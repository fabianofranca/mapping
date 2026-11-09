import {
  ancestorsOf,
  annotationShortLabel,
  formatRef,
  markingTypeName,
  matchShortCode,
  parseAnyRef,
  parseRef,
  projectIndex,
  refImageLabel,
  resolveCitation,
  shortCode,
  type ItemKind,
  type Project,
  type SubRef,
} from '../src/model';
import { ToolError } from './errors';
import {
  discoverProjects,
  findProject,
  loadProject,
  type LoadedProject,
  type ProjectLocation,
} from './projects';
import type { Roots } from './paths';

/** Nome do container sem nome (o MCP não usa `t()`). */
export const CONTAINER_LABEL = 'Container';
export const CANVAS_LABEL = 'Canvas';
/** Primeiro trecho do caminho legível de uma seta. */
export const ARROW_LABEL = 'Seta';

/** Nomes dos tipos de item. A letra `i` das referências é o container (não mudou por compatibilidade). */
export const KIND_NAMES: Record<ItemKind, string> = {
  m: 'marcação',
  i: 'container',
  a: 'anotação',
};

/** O tipo com artigo indefinido (`uma marcação`, `um container`), para as mensagens. */
export const KIND_WITH_ARTICLE: Record<ItemKind, string> = {
  m: 'uma marcação',
  i: 'um container',
  a: 'uma anotação',
};

/** `marcação não encontrada`, `container não encontrado`: a concordância muda com o tipo. */
export const KIND_NOT_FOUND: Record<ItemKind, string> = {
  m: 'marcação não encontrada',
  i: 'container não encontrado',
  a: 'anotação não encontrada',
};

const PATH_SEPARATOR = ' › ';

/** Referências `mapping://` e rótulos legíveis dos itens de um projeto carregado. */
export class Refs {
  readonly project: Project;

  constructor(readonly loaded: LoadedProject) {
    this.project = loaded.project;
  }

  get projectName(): string {
    return this.loaded.location.name;
  }

  /** Rótulo do container; marcação do canvas (`null`) é "Canvas". */
  imageLabel(containerId: string | null): string {
    if (containerId === null) return CANVAS_LABEL;
    const image = projectIndex(this.project).containers.get(containerId);
    if (!image) return containerId;
    return refImageLabel(image) ?? CONTAINER_LABEL;
  }

  /** `imageLabel` sem o índice do projeto (o lote do MCP rotula a marcação que acabou de criar sem reconstruí-lo). */
  imageLabelNoIndex(containerId: string | null): string {
    if (containerId === null) return CANVAS_LABEL;
    const image = this.project.containers.find((c) => c.id === containerId);
    if (!image) return containerId;
    return refImageLabel(image) ?? CONTAINER_LABEL;
  }

  /** Texto da seta: o nome dela ou "Origem → Destino" ("Seta <código>" se uma ponta sumiu). */
  arrowName(arrowId: string): string {
    const arrow = projectIndex(this.project).arrows.get(arrowId);
    if (!arrow) return arrowId;
    if (arrow.name !== null) return arrow.name;
    const markings = projectIndex(this.project).markings;
    if (!markings.has(arrow.from) || !markings.has(arrow.to)) {
      return `Seta ${shortCode(this.project, 'm', arrowId)}`;
    }
    return `${this.markingName(arrow.from)} → ${this.markingName(arrow.to)}`;
  }

  /**
   * Nome da marcação; sem nome, "<Tipo> <código>" se ela desenha um tipo de componente (uma
   * instância nasce sem nome), senão "Marcação <código>". O código mantém o nome único.
   */
  markingName(markingId: string): string {
    if (projectIndex(this.project).arrows.has(markingId))
      return this.arrowName(markingId);
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return markingId;
    if (marking.name !== null) return marking.name;
    const code = shortCode(this.project, 'm', markingId);
    return `${markingTypeName(this.project, markingId) ?? 'Marcação'} ${code}`;
  }

  /** `Container › Pai › Marcação` (`Canvas › Pai › Marcação` no canvas). */
  markingPath(markingId: string): string[] {
    // A seta (ME4) divide o espaço de ids das marcações e não tem container nem pai.
    if (projectIndex(this.project).arrows.has(markingId)) {
      return [ARROW_LABEL, this.arrowName(markingId)];
    }
    const marking = projectIndex(this.project).markings.get(markingId);
    if (!marking) return [markingId];
    const chain = [...ancestorsOf(this.project, markingId).reverse(), marking];
    return [
      this.imageLabel(marking.containerId),
      ...chain.map((m) => this.markingName(m.id)),
    ];
  }

  label(kind: ItemKind, id: string): string {
    const index = projectIndex(this.project);
    if (kind === 'i') return this.imageLabel(id);
    if (kind === 'm') return this.markingPath(id).join(PATH_SEPARATOR);
    const annotation = index.annotations.get(id);
    if (!annotation) return id;
    return [
      ...this.markingPath(annotation.markingId),
      annotationShortLabel(this.project, annotation),
    ].join(PATH_SEPARATOR);
  }

  /** Referência `mapping://<projeto>/<m|i|a>/<código>`: só a URL, sem caminho legível. */
  ref(kind: ItemKind, id: string): string {
    return formatRef({
      project: this.projectName,
      kind,
      code: shortCode(this.project, kind, id),
    });
  }
}

export interface ResolvedItem {
  readonly loaded: LoadedProject;
  readonly refs: Refs;
  readonly kind: ItemKind;
  /** Com uma sub-referência (campo, par ou linha), o id é o da anotação que a contém. */
  readonly id: string;
  /** A parte da anotação que a referência designa (`/f/`, `/e/` ou `/r/`); ausente na referência de item. */
  readonly sub?: SubRef;
}

/** Dica do `invalid-ref`: o formato estrito e o que fazer com o antigo. */
export const INVALID_REF_HINT =
  'use a referência mapping://<projeto>/<m|i|a|p>/<código>, só a URL, com o projeto codificado (ex: mapping://Meu%20Projeto/m/3f2a9c1e); referências com o caminho entre parênteses são do formato antigo: copie de novo na app';

const ACCEPTED_FORMATS = [
  'mapping://projeto/m/3f2a9c1e',
  'm/3f2a9c1e (com o projeto informado à parte)',
  'o id completo do item (com o projeto informado à parte)',
];

/**
 * Os projetos em que procurar: o da referência, o do argumento `project` (iguais, se os dois
 * vierem) ou todos os das raízes. Projetos diferentes na referência e no argumento: `project-mismatch`.
 */
export async function candidateLocations(
  roots: Roots,
  refProject: string | null,
  projectArg: string | undefined,
): Promise<ProjectLocation[]> {
  if (refProject !== null && projectArg !== undefined) {
    const [fromRef, fromArg] = [
      await findProject(roots, refProject),
      await findProject(roots, projectArg),
    ];
    if (fromRef.dir !== fromArg.dir) {
      throw new ToolError(
        'project-mismatch',
        `a referência é do projeto "${fromRef.name}", mas \`project\` indica "${fromArg.name}"`,
      );
    }
    return [fromRef];
  }
  const named = refProject ?? projectArg;
  if (named !== undefined) return [await findProject(roots, named)];
  const all = await discoverProjects(roots);
  if (all.length === 0) {
    throw new ToolError('project-not-found', 'nenhum projeto nas raízes configuradas');
  }
  return all;
}

const WHAT_IS: Record<string, string> = {
  l: 'uma camada',
  c: 'uma conversa',
  part: 'uma parte de anotação (campo, par ou linha)',
};

/**
 * A gramática completa (decisão 27): campo, par e linha valem como a anotação que os contém
 * (com a parte em `sub`); camada (`l`) e conversa (`c`) não são itens, e as tools de item as
 * recusam com `wrong-kind`.
 */
function readExtended(
  refText: string,
  expected: ItemKind | undefined,
): { project: string | null; code: string; sub: SubRef | null } | null {
  const any = parseAnyRef(refText);
  if (!any) return null;
  const { ref } = any;
  if (ref.type === 'item') {
    if (ref.kind !== 'l' && ref.kind !== 'c') return null;
    throw new ToolError(
      'wrong-kind',
      `a referência é de ${WHAT_IS[ref.kind]}, não de ${expected ? KIND_WITH_ARTICLE[expected] : 'um item'}`,
      { kind: ref.kind },
    );
  }
  if (expected && expected !== 'a') {
    throw new ToolError(
      'wrong-kind',
      `a referência é de ${WHAT_IS.part}, não de ${KIND_WITH_ARTICLE[expected]}`,
      { kind: 'a' },
    );
  }
  return { project: any.project, code: ref.annotation, sub: ref };
}

/** A parte (campo, par ou linha) tem de existir na anotação; senão `not-found`. */
function checkSub(project: Project, sub: SubRef, refText: string): void {
  const resolution = resolveCitation({ project, threads: [], proposals: [] }, sub);
  if (resolution.found) return;
  throw new ToolError(
    resolution.reason === 'ambiguous' ? 'ambiguous-ref' : 'not-found',
    resolution.reason === 'ambiguous'
      ? 'o código curto serve a mais de um par ou linha: use um código mais longo'
      : `a anotação não tem o campo, par ou linha de ${refText}`,
    { ref: refText },
  );
}

/**
 * Interpreta o que o agente colou (`ref`) e acha o item. Aceita a referência completa, só
 * `m/código` com `project`, ou o id completo. Sem projeto na referência nem em `project`, procura
 * em todos os das raízes. Ambiguidade (código curto, projetos homônimos) devolve as candidatas.
 * Campo, par e linha (`…/a/<código>/f/<campo>`, `/e/`, `/r/`) valem como a anotação que os contém.
 */
export async function resolveItem(
  roots: Roots,
  refText: string,
  projectArg?: string,
  expected?: ItemKind,
): Promise<ResolvedItem> {
  const extended = readExtended(refText, expected);
  const parsed = extended
    ? { project: extended.project, kind: 'a' as const, code: extended.code }
    : parseRef(refText);
  const sub = extended?.sub ?? null;
  if (!parsed) {
    throw new ToolError('invalid-ref', `referência inválida: ${refText}`, {
      accepted: ACCEPTED_FORMATS,
      hint: INVALID_REF_HINT,
    });
  }
  if (expected && parsed.kind && parsed.kind !== expected) {
    throw new ToolError(
      'wrong-kind',
      `a referência é de ${KIND_WITH_ARTICLE[parsed.kind]}, não de ${KIND_WITH_ARTICLE[expected]}`,
      { kind: parsed.kind },
    );
  }
  const kind = parsed.kind ?? expected ?? null;

  const named = parsed.project ?? projectArg;
  const locations = await candidateLocations(roots, parsed.project, projectArg);

  const searchingAll = named === undefined;
  const found: { loaded: LoadedProject; kind: ItemKind; id: string }[] = [];
  const unreadable: string[] = [];
  for (const location of locations) {
    let loaded: LoadedProject;
    try {
      loaded = await loadProject(roots, location);
    } catch (error) {
      if (!searchingAll || !(error instanceof ToolError)) throw error;
      unreadable.push(location.path);
      continue;
    }
    for (const match of matchShortCode(loaded.project, kind, parsed.code)) {
      found.push({ loaded, ...match });
    }
  }

  if (found.length === 1) {
    const [only] = found;
    const refs = new Refs(only!.loaded);
    if (sub) checkSub(refs.project, sub, refText);
    return { ...only!, refs, ...(sub ? { sub } : {}) };
  }
  if (found.length === 0) {
    throw new ToolError('not-found', `nenhum item corresponde a ${refText}`, {
      ref: refText,
      searched: locations.map((l) => l.path),
      ...(unreadable.length > 0 ? { unreadable } : {}),
    });
  }
  throw new ToolError(
    'ambiguous-ref',
    `${found.length} itens começam com esse código: use a referência completa de um deles`,
    {
      ref: refText,
      candidates: found.slice(0, 20).map((c) => {
        const refs = new Refs(c.loaded);
        return { ref: refs.ref(c.kind, c.id), dir: c.loaded.location.dir };
      }),
    },
  );
}
