import type { Change, Proposal, ReviewTarget } from './proposal';
import { projectIndex } from './projectIndex';
import { isRecord } from './refs';
import type { Project } from './types';

// Leitura de uma proposta para a interface de revisão (etapa 4): tipo de cada mudança,
// filtros, pendências e o que ficou para trás numa proposta substituída. Funções puras;
// as contagens e os níveis ficam em `proposalReview.ts`.

/**
 * Tipo da mudança, para o selo e o filtro (a forma diz o tipo; a cor diz a decisão).
 * `moved`: geometria (`rect` da marcação, `placement` da imagem). `replaced`: troca do
 * arquivo da imagem. `changed`: qualquer outro campo.
 */
export type ChangeType = 'created' | 'removed' | 'moved' | 'changed' | 'replaced';

export const CHANGE_TYPES: readonly ChangeType[] = [
  'created',
  'removed',
  'moved',
  'changed',
  'replaced',
];

export function changeType(c: Change): ChangeType {
  if (c.kind === 'create') return 'created';
  if (c.kind === 'remove') return 'removed';
  if (c.entity === 'image' && c.field === 'file') return 'replaced';
  if (
    (c.entity === 'marking' && c.field === 'rect') ||
    (c.entity === 'image' && c.field === 'placement')
  ) {
    return 'moved';
  }
  return 'changed';
}

/**
 * Tipo dominante de um conjunto de mudanças (um item ou uma imagem): criada, removida,
 * imagem trocada, alterada; "movida" só quando a posição é a única coisa que muda.
 * `null` sem mudanças.
 */
export function dominantChangeType(types: Iterable<ChangeType>): ChangeType | null {
  const found = new Set(types);
  for (const type of ['created', 'removed', 'replaced', 'changed'] as const) {
    if (found.has(type)) return type;
  }
  return found.has('moved') ? 'moved' : null;
}

/** Chave de um alvo da revisão (`level:id`), a mesma de `ReviewTree.nodes`. */
export function reviewKey(target: ReviewTarget): string {
  return `${target.level}:${target.id ?? ''}`;
}

/** Onde a mudança aparece na revisão: o item, a imagem ou o grupo Projeto. */
export function changeTarget(c: Change): ReviewTarget {
  if (c.markingId !== null) return { level: 'item', id: c.markingId };
  if (c.imageId !== null) return { level: 'image', id: c.imageId };
  return { level: 'project', id: null };
}

/**
 * Camada a que a mudança pertence: a da anotação (a proposta, ou a atual, ou a removida)
 * ou a própria camada. `null` nas demais.
 */
export function changeLayerId(c: Change, project: Project): string | null {
  if (c.entity === 'layer') return c.entityId;
  if (c.entity !== 'annotation') return null;
  if (c.kind === 'create' && isRecord(c.to)) {
    return typeof c.to.layerId === 'string' ? c.to.layerId : null;
  }
  if (c.kind === 'update' && c.field === 'layerId') {
    return typeof c.to === 'string' ? c.to : null;
  }
  const current = projectIndex(project).annotations.get(c.entityId);
  if (current) return current.layerId;
  if (c.kind === 'remove' && isRecord(c.from)) {
    return typeof c.from.layerId === 'string' ? c.from.layerId : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filtros

export type DecisionFilter = 'all' | 'undecided' | 'accepted' | 'rejected';

/** Filtros da revisão. Vazio/`null`/`'all'`/`false` = sem filtro naquele critério. */
export interface ReviewFilters {
  readonly types: readonly ChangeType[];
  readonly imageId: string | null;
  readonly layerId: string | null;
  readonly decision: DecisionFilter;
  readonly onlyConflicts: boolean;
}

export const NO_FILTERS: ReviewFilters = {
  types: [],
  imageId: null,
  layerId: null,
  decision: 'all',
  onlyConflicts: false,
};

export function hasActiveFilters(f: ReviewFilters): boolean {
  return (
    f.types.length > 0 ||
    f.imageId !== null ||
    f.layerId !== null ||
    f.decision !== 'all' ||
    f.onlyConflicts
  );
}

/**
 * Mudanças que passam pelos filtros, na ordem da proposta. `conflicts`: as mudanças em
 * conflito com o projeto atual (`changeStatuses`). Sem filtros, todas.
 */
export function filterChanges(
  p: Proposal,
  project: Project,
  filters: ReviewFilters,
  conflicts: ReadonlySet<string>,
): Change[] {
  if (!hasActiveFilters(filters)) return [...p.changes];
  const types = new Set(filters.types);
  return p.changes.filter((c) => {
    if (types.size > 0 && !types.has(changeType(c))) return false;
    if (filters.imageId !== null && c.imageId !== filters.imageId) return false;
    if (filters.layerId !== null && changeLayerId(c, project) !== filters.layerId) {
      return false;
    }
    if (filters.onlyConflicts && !conflicts.has(c.id)) return false;
    const state = p.decisions[c.id]?.state ?? null;
    if (filters.decision === 'undecided') return state === null;
    if (filters.decision === 'accepted') return state === 'accepted';
    if (filters.decision === 'rejected') return state === 'rejected';
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pendências e proposta substituída

/** Mudanças sem decisão, na ordem da proposta. */
export function undecidedChanges(p: Proposal): string[] {
  return p.changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id);
}

/** Aceitas que ainda não foram aplicadas. */
export function acceptedPendingIds(p: Proposal): string[] {
  return p.changes
    .filter(
      (c) => p.decisions[c.id]?.state === 'accepted' && !Object.hasOwn(p.applied, c.id),
    )
    .map((c) => c.id);
}

/**
 * O que uma proposta fechada (substituída) deixou para trás: o que estava sem decisão
 * (as pendentes não podem mais ser aplicadas), as aceitas sem aplicar (ainda podem) e as
 * rejeitadas.
 */
export interface LeftBehind {
  readonly undecided: readonly string[];
  readonly acceptedPending: readonly string[];
  readonly rejected: readonly string[];
}

export function leftBehind(p: Proposal): LeftBehind {
  return {
    undecided: undecidedChanges(p),
    acceptedPending: acceptedPendingIds(p),
    rejected: p.changes
      .filter((c) => p.decisions[c.id]?.state === 'rejected')
      .map((c) => c.id),
  };
}

/**
 * A mudança pendente seguinte (ou anterior) a `fromId` dentre `ids` (ordem da proposta),
 * dando a volta. Sem `fromId` (ou se ele não está em `ids`), a primeira (ou a última).
 * `ids` costuma ser as pendentes ou os conflitos já filtrados.
 */
export function stepChange(
  ids: readonly string[],
  order: ReadonlyMap<string, number>,
  fromId: string | null,
  direction: 1 | -1,
): string | null {
  if (ids.length === 0) return null;
  const from = fromId === null ? undefined : order.get(fromId);
  if (from === undefined) return (direction === 1 ? ids[0] : ids.at(-1)) ?? null;
  const rank = (id: string) => order.get(id) ?? 0;
  if (direction === 1) {
    return ids.find((id) => rank(id) > from) ?? ids[0] ?? null;
  }
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    if (id !== undefined && rank(id) < from) return id;
  }
  return ids.at(-1) ?? null;
}

/**
 * Arquivo de imagem (`images/tela.webp`) que a mudança traz: a criação ou a troca do
 * arquivo de uma imagem. Até ser aceita, ele espera em `proposals/<id>/` mais este caminho.
 */
export function changeImageFile(c: Change): string | null {
  if (c.entity !== 'image') return null;
  const isCreate = c.kind === 'create';
  const isReplace = c.kind === 'update' && c.field === 'file';
  if (!isCreate && !isReplace) return null;
  if (!isRecord(c.to)) return null;
  const file = c.to.file;
  return typeof file === 'string' ? file : null;
}
