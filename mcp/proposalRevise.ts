import {
  prepareRevision,
  reviseProposal,
  type Change,
  type Proposal,
  type ReviseError,
} from '../src/model';
import { batchReport, createdRefs, prepareBatch, readMapping, sha256 } from './changes';
import { ToolError, type McpErrorCode } from './errors';
import { Refs } from './items';
import type { Operation } from './operations';
import type { ProjectLocation } from './projects';
import { ProposalRefs, type ResolvedProposal } from './proposalRefs';
import {
  listStored,
  proposalFiles,
  reservedImages,
  reviseStored,
  type RevisionPlan,
  type RevisionStop,
} from './proposalStore';
import { ProposalLabels } from './proposalViews';
import { storedOperations } from './proposalOperations';
import type { Roots } from './paths';

// `revise_proposal` (etapa #644): o agente corrige a proposta aberta na mesma proposta. O modelo
// (`prepareRevision`/`reviseProposal`, CP1) decide o que fica, o que troca e o que sai; aqui o
// lote roda sobre o **proposto inteiro** pelo mesmo caminho do `propose_changes` e a gravação
// passa por `reviseStored`, que relê e recalcula se a proposta mudou no meio.

type Json = Record<string, unknown>;

export interface ReviseArgs {
  readonly drop?: readonly string[] | undefined;
  readonly operations?: readonly Operation[] | undefined;
  readonly dryRun?: boolean | undefined;
}

const HINTS: Partial<Record<ReviseError['code'], string>> = {
  'proposal-applied':
    'já há mudanças aplicadas: envie as correções com propose_changes e `supersedes` apontando para esta proposta',
  'change-frozen':
    'o usuário já aceitou essas mudanças; peça a ele para limpar a decisão ou mande uma proposta nova com `supersedes`',
  'proposal-not-applicable':
    'retire as mudanças envolvidas no `drop` e tente de novo, ou mande uma proposta nova com `supersedes`',
};

/** Os códigos do modelo da revisão são os mesmos do servidor (`mcp/errors.ts`). */
const CODES: Record<ReviseError['code'], McpErrorCode | 'not-open' | 'no-changes'> = {
  'not-open': 'not-open',
  'proposal-applied': 'proposal-applied',
  'change-not-found': 'change-not-found',
  'change-frozen': 'change-frozen',
  'proposal-not-applicable': 'proposal-not-applicable',
  'no-changes': 'no-changes',
};

function toToolError(error: ReviseError): ToolError {
  const hint = HINTS[error.code];
  return new ToolError(CODES[error.code], error.message, {
    ...(error.changeIds.length > 0 ? { changeIds: error.changeIds } : {}),
    ...(error.problems ? { problems: error.problems } : {}),
    ...(hint ? { hint } : {}),
  });
}

const SHOWN = 60;

/** O valor novo de uma mudança em poucas palavras (texto curto; a criação mostra o nome). */
function shownValue(c: Change): string {
  if (c.kind === 'remove') return '';
  const named = (c.to as { name?: unknown } | null)?.name;
  const value = c.kind === 'create' ? named : c.to;
  if (value === undefined || value === null || typeof value === 'object') return '';
  const text = JSON.stringify(value);
  return ` → ${text.length > SHOWN ? `${text.slice(0, SHOWN)}…` : text}`;
}

/** Resumo legível de uma mudança: o que ela faz, em quê e o valor novo. */
function summaryOf(c: Change, labels: ProposalLabels): string {
  const verb = { create: 'criar', update: 'alterar', remove: 'remover' }[c.kind];
  const field = c.field !== null ? ` › ${c.field}` : '';
  return `${verb} ${labels.target(c)}${field}${shownValue(c)}`;
}

function itemsOf(
  ids: readonly string[],
  changes: readonly Change[],
  labels: ProposalLabels,
) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return ids.map((id) => ({
    id,
    summary: byId.has(id) ? summaryOf(byId.get(id)!, labels) : id,
  }));
}

/** Arquivos de `images/` que a revisão não pode reutilizar: de outras propostas e da própria pasta. */
async function reservedFor(
  roots: Roots,
  location: ProjectLocation,
  proposalId: string,
): Promise<Set<string>> {
  const reserved = new Set<string>();
  for (const stored of (await listStored(roots, location)).proposals) {
    for (const file of reservedImages(stored.proposal)) reserved.add(file);
  }
  const prefix = `proposals/${proposalId}/`;
  for (const file of await proposalFiles(roots, location, proposalId)) {
    if (file.startsWith(prefix)) reserved.add(file.slice(prefix.length));
  }
  return reserved;
}

interface Computed {
  readonly summary: {
    readonly changed: readonly string[];
    readonly added: readonly string[];
    readonly dropped: readonly string[];
  };
  readonly view: Json;
}

async function compute(
  roots: Roots,
  location: ProjectLocation,
  now: () => number,
  args: ReviseArgs,
  current: Proposal,
): Promise<RevisionPlan<Computed> | RevisionStop<Computed>> {
  const drop = args.drop ?? [];
  const operations = args.operations ?? [];
  const prepared = await prepareBatch(roots, location, operations, {
    now,
    reservedImages: await reservedFor(roots, location, current.id),
    startFrom: (project) => {
      const prep = prepareRevision(project, current, drop);
      if (!prep.ok) throw toToolError(prep.error);
      return prep.proposed;
    },
  });
  const report = batchReport(prepared);
  const stop = (extra: Json): RevisionStop<Computed> => ({
    stop: {
      summary: { changed: [], added: [], dropped: [] },
      view: { ...report, ...extra },
    },
  });
  if (!prepared.valid) {
    return stop({
      revised: false,
      hint: 'nada foi gravado: corrija as operações com erro e chame revise_proposal de novo com o lote inteiro',
    });
  }
  if (prepared.result.packageFiles.size > 0) {
    throw new ToolError(
      'revise-unsupported',
      'um pacote de biblioteca novo ou trocado não cabe numa revisão: envie-o numa proposta nova (propose_changes)',
    );
  }
  const { loaded, result } = prepared;
  const revised = reviseProposal(loaded.project, current, {
    drop,
    ...(operations.length > 0 ? { after: result.project } : {}),
    at: new Date(now()).toISOString(),
    operations: storedOperations(operations),
  });
  if (!revised.ok) throw toToolError(revised.error);
  const labels = ProposalLabels.ofRefs(prepared.refs, new Refs(loaded));
  const { summary } = revised;
  const { warnings } = report;
  return {
    proposal: revised.proposal,
    images: result.imageFiles,
    check: async () => {
      const text = await readMapping(roots, location.dir);
      if (text === null || sha256(text) !== prepared.baseHash) {
        throw new ToolError(
          'revision-conflict',
          'o projeto foi alterado por outro processo enquanto a revisão era calculada; releia e envie de novo',
          { baseRevision: loaded.project.revision },
        );
      }
    },
    result: {
      summary,
      view: {
        counts: {
          changed: summary.changed.length,
          added: summary.added.length,
          dropped: summary.dropped.length,
        },
        changed: itemsOf(summary.changed, revised.proposal.changes, labels),
        added: itemsOf(summary.added, revised.proposal.changes, labels),
        dropped: itemsOf(summary.dropped, current.changes, labels),
        created: createdRefs(prepared.refs, result),
        ...(Array.isArray(warnings) && warnings.length > 0 ? { warnings } : {}),
      },
    },
  };
}

/** `revise_proposal`: valida, calcula e (sem `dryRun`) grava a revisão na mesma proposta. */
export async function reviseOnDisk(
  roots: Roots,
  now: () => number,
  resolved: ResolvedProposal,
  args: ReviseArgs,
): Promise<Json> {
  if ((args.drop?.length ?? 0) === 0 && (args.operations?.length ?? 0) === 0) {
    throw new ToolError(
      'invalid-arguments',
      'informe `drop` (ids de mudança a retirar) ou `operations` com pelo menos um item',
    );
  }
  const { location, stored } = resolved;
  const dryRun = args.dryRun === true;
  const { proposal, result } = await reviseStored(
    roots,
    location,
    stored.id,
    !dryRun,
    (current) => compute(roots, location, now, args, current),
  );
  if (proposal === null) return result.view;
  const refs = new ProposalRefs(location.name, resolved.all);
  return {
    revised: !dryRun,
    ...(dryRun ? { dryRun: true } : {}),
    proposal: {
      ref: refs.ref(proposal.id),
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
    },
    revision: proposal.revision,
    ...result.view,
    hint: 'a proposta é a mesma (mesma referência): as mudanças trocadas e as novas voltam a aguardar a decisão do usuário (marca "Revisada"); as aceitas e as intocadas não mudaram. O mapping.json não foi alterado. Avise o usuário e espere a revisão terminar (get_proposal). Com dryRun nada é gravado.',
  };
}
