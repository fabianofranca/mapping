import { REF_SCHEME, normalizeId, shortCodesFor } from '../src/model';
import { ToolError } from './errors';
import { discoverProjects, findProject, type ProjectLocation } from './projects';
import { listStored, type StoredProposal, type StoredProposals } from './proposalStore';
import type { Roots } from './paths';

// Referência de proposta: `mapping://<projeto>/p/<código>` (o código são os 8 primeiros
// caracteres hexadecimais do id, como nos itens; cresce de 4 em 4 se houver colisão entre as
// propostas do projeto). Aceita também `p/<código>` com `project` informado, ou o id completo.

interface ParsedProposalRef {
  readonly project: string | null;
  /** Código curto ou id completo, como informado. */
  readonly code: string;
}

const FULL = /^mapping:\/\/([^/\s]+)\/p\/([0-9a-zA-Z._-]+)(?:\s+\([\s\S]*\))?$/;
const SHORT = /^p\/([0-9a-zA-Z._-]+)$/;
const BARE = /^[0-9a-zA-Z][0-9a-zA-Z._-]*$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseProposalRef(text: string): ParsedProposalRef | null {
  const input = text.trim();
  const full = FULL.exec(input);
  if (full) return { project: decodeSegment(full[1]!), code: full[2]! };
  const short = SHORT.exec(input);
  if (short) return { project: null, code: short[1]! };
  if (BARE.test(input)) return { project: null, code: input };
  return null;
}

/** Códigos curtos das propostas do projeto (únicos entre elas). */
export function proposalCodes(ids: readonly string[]): ReadonlyMap<string, string> {
  return shortCodesFor(ids);
}

/** `mapping://<projeto>/p/<código>`, com o título entre parênteses (só para leitura). */
export function formatProposalRef(
  projectName: string,
  code: string,
  title?: string,
): string {
  const ref = `${REF_SCHEME}${encodeURIComponent(projectName)}/p/${code}`;
  const readable = title?.replace(/\s+/g, ' ').trim();
  return readable ? `${ref} (${readable})` : ref;
}

/** Referências de todas as propostas legíveis do projeto, por id. */
export class ProposalRefs {
  private readonly codes: ReadonlyMap<string, string>;

  constructor(
    readonly projectName: string,
    private readonly all: StoredProposals,
    extraIds: readonly string[] = [],
  ) {
    this.codes = proposalCodes([...all.proposals.map((p) => p.id), ...extraIds]);
  }

  /** Referência da proposta; o título entre parênteses vem da pasta ou de `title` (proposta nova). */
  ref(id: string, title?: string): string {
    const code = this.codes.get(id) ?? normalizeId(id).slice(0, 8);
    const known = title ?? this.all.proposals.find((p) => p.id === id)?.proposal.title;
    return formatProposalRef(this.projectName, code, known);
  }
}

export interface ResolvedProposal {
  readonly location: ProjectLocation;
  readonly stored: StoredProposal;
  readonly all: StoredProposals;
  readonly refs: ProposalRefs;
}

function matches(stored: readonly StoredProposal[], code: string): StoredProposal[] {
  const exactId = stored.filter((s) => s.id === code);
  if (exactId.length === 1) return exactId;
  const wanted = normalizeId(code);
  if (wanted === '') return [];
  const prefix = stored.filter((s) => normalizeId(s.id).startsWith(wanted));
  const exact = prefix.filter((s) => normalizeId(s.id) === wanted);
  return exact.length > 0 ? exact : prefix;
}

const ACCEPTED = [
  'mapping://projeto/p/3f2a9c1e',
  'p/3f2a9c1e (com o projeto informado à parte)',
  'o id completo da proposta (com o projeto informado à parte)',
];

/**
 * Acha a proposta numa lista já lida (as de um projeto). A referência completa de outro
 * projeto é recusada (`project-mismatch`); código ambíguo devolve as candidatas.
 */
export function lookupStored(
  all: StoredProposals,
  location: ProjectLocation,
  refText: string,
): StoredProposal {
  const parsed = parseProposalRef(refText);
  if (!parsed) {
    throw new ToolError('invalid-ref', `referência de proposta inválida: ${refText}`, {
      accepted: ACCEPTED,
    });
  }
  if (parsed.project !== null && parsed.project !== location.name) {
    throw new ToolError(
      'project-mismatch',
      `a referência é do projeto "${parsed.project}", não de "${location.name}"`,
    );
  }
  const found = matches(all.proposals, parsed.code);
  if (found.length === 1) return found[0]!;
  if (found.length === 0) {
    throw new ToolError(
      'proposal-not-found',
      `nenhuma proposta corresponde a ${refText}`,
      {
        ref: refText,
        hint: 'use list_proposals(project) para ver as propostas do projeto',
      },
    );
  }
  throw ambiguous(refText, location, all, found);
}

function ambiguous(
  refText: string,
  location: ProjectLocation,
  all: StoredProposals,
  found: readonly StoredProposal[],
): ToolError {
  const refs = new ProposalRefs(location.name, all);
  return new ToolError(
    'ambiguous-ref',
    `${found.length} propostas começam com esse código: use a referência completa de uma delas`,
    {
      ref: refText,
      candidates: found
        .slice(0, 20)
        .map((s) => ({ ref: refs.ref(s.id), dir: location.dir })),
    },
  );
}

/**
 * Acha a proposta pelo que o agente informou (`ref`, mais `project` quando a referência não o
 * traz). Sem projeto, procura em todos os das raízes. Código ambíguo devolve as candidatas.
 */
export async function resolveProposal(
  roots: Roots,
  refText: string,
  projectArg?: string,
): Promise<ResolvedProposal> {
  const parsed = parseProposalRef(refText);
  if (!parsed) {
    throw new ToolError('invalid-ref', `referência de proposta inválida: ${refText}`, {
      accepted: ACCEPTED,
    });
  }
  let locations: ProjectLocation[];
  const named = parsed.project ?? projectArg;
  if (parsed.project !== null && projectArg !== undefined) {
    const [fromRef, fromArg] = [
      await findProject(roots, parsed.project),
      await findProject(roots, projectArg),
    ];
    if (fromRef.dir !== fromArg.dir) {
      throw new ToolError(
        'project-mismatch',
        `a referência é do projeto "${fromRef.name}", mas \`project\` indica "${fromArg.name}"`,
      );
    }
    locations = [fromRef];
  } else if (named !== undefined) {
    locations = [await findProject(roots, named)];
  } else {
    locations = await discoverProjects(roots);
    if (locations.length === 0) {
      throw new ToolError('project-not-found', 'nenhum projeto nas raízes configuradas');
    }
  }

  const found: {
    location: ProjectLocation;
    all: StoredProposals;
    stored: StoredProposal;
  }[] = [];
  for (const location of locations) {
    const all = await listStored(roots, location);
    for (const stored of matches(all.proposals, parsed.code)) {
      found.push({ location, all, stored });
    }
  }
  if (found.length === 1) {
    const [only] = found;
    return { ...only!, refs: new ProposalRefs(only!.location.name, only!.all) };
  }
  if (found.length === 0) {
    throw new ToolError(
      'proposal-not-found',
      `nenhuma proposta corresponde a ${refText}`,
      {
        ref: refText,
        searched: locations.map((l) => l.path),
        hint: 'use list_proposals(project) para ver as propostas do projeto',
      },
    );
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} propostas começam com esse código: use a referência completa de uma delas`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => ({
        ref: new ProposalRefs(c.location.name, c.all).ref(c.stored.id),
        dir: c.location.dir,
      })),
    },
  );
}
