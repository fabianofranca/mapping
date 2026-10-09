import {
  canDeleteImage,
  canDeleteMarking,
  canEditImagePlacement,
  canEditMarkingGeometry,
  canReplaceImage,
} from './locks';
import type {
  Change,
  DecisionState,
  Proposal,
  ProposalDecisions,
  ProposalNote,
  ReviewLevel,
  ReviewTarget,
} from './proposal';
import {
  currentValue,
  entityKey,
  fromSideRefs,
  jsonEqual,
  toSideRefs,
} from './proposalValues';
import { projectIndex } from './projectIndex';
import { isRecord } from './refs';
import type { JsonValue, Project } from './types';

// Revisão de uma proposta (etapa 4): dependências entre mudanças, níveis (proposta →
// projeto/imagem → item → mudança), decisões de três estados com "parcial", conflitos
// e o aviso de item trancado. Tudo puro: a app (estado derivado) e o MCP usam o mesmo.

// ---------------------------------------------------------------------------
// Dependências

export interface ProposalIndex {
  readonly changes: ReadonlyMap<string, Change>;
  /** Mudança de criação de cada entidade criada pela proposta (por `entityKey`). */
  readonly created: ReadonlyMap<string, string>;
  /**
   * O que cada mudança exige: aceitar a mudança aceita estas (e as que elas exigem).
   * Criação ou alteração que cita uma entidade criada na proposta exige a criação dela;
   * remoção exige as mudanças que deixam de citar a entidade removida (a cascata).
   */
  readonly requires: ReadonlyMap<string, readonly string[]>;
  /** O inverso de `requires`: rejeitar a mudança rejeita estas (e as que dependem delas). */
  readonly dependents: ReadonlyMap<string, readonly string[]>;
}

function buildIndex(changes: readonly Change[]): ProposalIndex {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const created = new Map<string, string>();
  for (const c of changes) {
    if (c.kind === 'create') created.set(entityKey(c.entity, c.entityId), c.id);
  }
  // Quem cita cada entidade no estado anterior e deixa de citá-la.
  const releasedBy = new Map<string, string[]>();
  for (const c of changes) {
    const after = new Set(
      toSideRefs(c)
        .filter((r) => r.strong)
        .map((r) => r.key),
    );
    for (const ref of fromSideRefs(c)) {
      if (!ref.strong || after.has(ref.key)) continue;
      const list = releasedBy.get(ref.key);
      if (list) list.push(c.id);
      else releasedBy.set(ref.key, [c.id]);
    }
  }
  const requires = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    if (from === to) return;
    const list = requires.get(from) ?? [];
    if (list.includes(to)) return;
    list.push(to);
    requires.set(from, list);
    const back = dependents.get(to);
    if (back) back.push(from);
    else dependents.set(to, [from]);
  };
  for (const c of changes) {
    const self = entityKey(c.entity, c.entityId);
    if (c.kind === 'remove') {
      for (const other of releasedBy.get(self) ?? []) link(c.id, other);
      continue;
    }
    for (const ref of toSideRefs(c)) {
      const creation = created.get(ref.key);
      if (creation) link(c.id, creation);
    }
    if (c.kind === 'update') {
      const creation = created.get(self);
      if (creation) link(c.id, creation);
    }
  }
  return { changes: byId, created, requires, dependents };
}

const indexCache = new WeakMap<readonly Change[], ProposalIndex>();

/** Índice das mudanças, memoizado pela lista (decidir não muda a lista). */
export function proposalIndex(p: Proposal): ProposalIndex {
  const cached = indexCache.get(p.changes);
  if (cached) return cached;
  const index = buildIndex(p.changes);
  indexCache.set(p.changes, index);
  return index;
}

function closure(
  start: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): string[] {
  const seen = new Set(start);
  const queue = [...start];
  const out: string[] = [];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of edges.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

/** Mudanças exigidas (transitivamente) por `changeIds`, fora elas mesmas. */
export function requiredChanges(p: Proposal, changeIds: readonly string[]): string[] {
  return closure(changeIds, proposalIndex(p).requires);
}

/** Mudanças que dependem (transitivamente) de `changeIds`, fora elas mesmas. */
export function dependentChanges(p: Proposal, changeIds: readonly string[]): string[] {
  return closure(changeIds, proposalIndex(p).dependents);
}

// ---------------------------------------------------------------------------
// Níveis

export interface ReviewNode {
  readonly level: Exclude<ReviewLevel, 'change'>;
  readonly id: string | null;
  /** Mudanças diretas do nível (na imagem: as da própria imagem). */
  readonly changeIds: readonly string[];
  readonly children: readonly ReviewNode[];
}

export interface ReviewTree {
  readonly root: ReviewNode;
  /** Nó de um nível (`level:id`, ex: `item:3f2a…`; `project:`, `proposal:`). */
  readonly nodes: ReadonlyMap<string, ReviewNode>;
  /** Todas as mudanças do alvo (o nível e tudo abaixo), na ordem da proposta. */
  changeIdsOf(target: ReviewTarget): readonly string[];
}

function nodeKey(level: ReviewLevel, id: string | null): string {
  return `${level}:${id ?? ''}`;
}

/**
 * Pai de cada marcação citada pela proposta, para aninhar os itens: o proposto (criação
 * ou mudança de `parentId`), senão o atual, senão o anterior (marcação removida).
 */
function parentLookup(
  p: Proposal,
  project: Project,
): (markingId: string) => string | null {
  const proposed = new Map<string, string | null>();
  const removed = new Map<string, string | null>();
  for (const c of p.changes) {
    if (c.entity !== 'marking') continue;
    if (c.kind === 'create' && isRecord(c.to)) {
      proposed.set(c.entityId, typeof c.to.parentId === 'string' ? c.to.parentId : null);
    } else if (c.kind === 'update' && c.field === 'parentId') {
      proposed.set(c.entityId, typeof c.to === 'string' ? c.to : null);
    } else if (c.kind === 'remove' && isRecord(c.from)) {
      removed.set(
        c.entityId,
        typeof c.from.parentId === 'string' ? c.from.parentId : null,
      );
    }
  }
  const markings = projectIndex(project).markings;
  return (id) => {
    if (proposed.has(id)) return proposed.get(id) ?? null;
    const current = markings.get(id);
    if (current) return current.parentId;
    return removed.get(id) ?? null;
  };
}

/**
 * Os níveis da revisão: Projeto (especializações, repositórios e camadas) e uma imagem
 * para cada imagem citada, com os itens (marcações com tudo que mudou nelas, inclusive
 * as anotações) aninhados pela hierarquia: a filha fica dentro do ancestral mais próximo
 * que também tem mudanças. `project` é o projeto atual (para achar os pais das marcações
 * que só foram alteradas).
 */
export function reviewTree(p: Proposal, project: Project): ReviewTree {
  interface MutableNode {
    level: ReviewNode['level'];
    id: string | null;
    changeIds: string[];
    children: MutableNode[];
  }
  const make = (level: ReviewNode['level'], id: string | null): MutableNode => ({
    level,
    id,
    changeIds: [],
    children: [],
  });
  const root = make('proposal', null);
  let projectNode: MutableNode | null = null;
  const images = new Map<string, MutableNode>();
  const items = new Map<string, { node: MutableNode; imageId: string }>();

  for (const c of p.changes) {
    if (c.imageId === null) {
      if (!projectNode) {
        projectNode = make('project', null);
        root.children.unshift(projectNode);
      }
      projectNode.changeIds.push(c.id);
      continue;
    }
    let image = images.get(c.imageId);
    if (!image) {
      image = make('image', c.imageId);
      images.set(c.imageId, image);
      root.children.push(image);
    }
    if (c.markingId === null) {
      image.changeIds.push(c.id);
      continue;
    }
    let item = items.get(c.markingId);
    if (!item) {
      item = { node: make('item', c.markingId), imageId: c.imageId };
      items.set(c.markingId, item);
    }
    item.node.changeIds.push(c.id);
  }

  // Aninha cada item no ancestral mais próximo com mudanças (na mesma imagem).
  const parentOf = parentLookup(p, project);
  for (const [markingId, { node, imageId }] of items) {
    const seen = new Set([markingId]);
    let host: MutableNode | undefined;
    for (let up = parentOf(markingId); up !== null && !seen.has(up); up = parentOf(up)) {
      seen.add(up);
      const candidate = items.get(up);
      if (candidate && candidate.imageId === imageId) {
        host = candidate.node;
        break;
      }
    }
    (host ?? images.get(imageId))?.children.push(node);
  }

  const nodes = new Map<string, ReviewNode>();
  const all = new Map<string, string[]>();
  const order = new Map(p.changes.map((c, i) => [c.id, i]));
  const visit = (node: MutableNode): string[] => {
    nodes.set(nodeKey(node.level, node.id), node);
    const ids = [...node.changeIds];
    for (const child of node.children) ids.push(...visit(child));
    ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    all.set(nodeKey(node.level, node.id), ids);
    return ids;
  };
  visit(root);
  if (!projectNode) {
    const empty = make('project', null);
    nodes.set(nodeKey('project', null), empty);
    all.set(nodeKey('project', null), []);
  }
  const changes = proposalIndex(p).changes;
  return {
    root,
    nodes,
    changeIdsOf: (target) => {
      if (target.level === 'change') {
        return target.id !== null && changes.has(target.id) ? [target.id] : [];
      }
      return all.get(nodeKey(target.level, target.id)) ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// Estado de um nível

/** Estado de um nível: os três estados mais "parcial" quando as mudanças divergem. */
export type LevelState = 'accepted' | 'rejected' | 'undecided' | 'partial';

export interface LevelSummary {
  readonly state: LevelState;
  readonly total: number;
  /** Aceitas (inclui as aplicadas). */
  readonly accepted: number;
  readonly rejected: number;
  readonly undecided: number;
  /** Aceitas e já aplicadas. */
  readonly applied: number;
}

/** Resume as decisões de um conjunto de mudanças (ex: `tree.changeIdsOf(alvo)`). */
export function summarizeDecisions(
  p: Proposal,
  changeIds: readonly string[],
): LevelSummary {
  let accepted = 0;
  let rejected = 0;
  let applied = 0;
  for (const id of changeIds) {
    const state = p.decisions[id]?.state;
    if (state === 'accepted') accepted++;
    else if (state === 'rejected') rejected++;
    if (Object.hasOwn(p.applied, id)) applied++;
  }
  const total = changeIds.length;
  const undecided = total - accepted - rejected;
  let state: LevelState = 'partial';
  if (undecided === total) state = 'undecided';
  else if (accepted === total) state = 'accepted';
  else if (rejected === total) state = 'rejected';
  return { state, total, accepted, rejected, undecided, applied };
}

/** Progresso da proposta inteira, para a lista de propostas e o aviso de substituição. */
export interface ReviewProgress extends LevelSummary {
  /** Aceitas que ainda não foram aplicadas. */
  readonly acceptedPending: number;
  /** Nada sem decisão nem aceito sem aplicar: pode ser substituída sem deixar nada para trás. */
  readonly complete: boolean;
}

export function reviewProgress(p: Proposal): ReviewProgress {
  const summary = summarizeDecisions(
    p,
    p.changes.map((c) => c.id),
  );
  const acceptedPending = summary.accepted - summary.applied;
  return {
    ...summary,
    acceptedPending,
    complete: summary.undecided === 0 && acceptedPending === 0,
  };
}

// ---------------------------------------------------------------------------
// Decidir

export type DecideResult =
  | {
      readonly ok: true;
      readonly decisions: ProposalDecisions;
      /** Mudanças do alvo cujo estado mudou. */
      readonly changed: readonly string[];
      /** Mudanças fora do alvo que mudaram pelas dependências ("4 rejeitadas junto"). */
      readonly cascaded: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not-open' | 'unknown-target' };

/**
 * Decide um nível: aceita (`accepted`), rejeita (`rejected`) ou limpa (`null`) todas as
 * mudanças do alvo ainda não aplicadas e resolve as dependências:
 * - aceitar exige o que as mudanças exigem (criação do item, dos ancestrais, da camada…,
 *   e na remoção, a cascata), que também passa a aceito;
 * - rejeitar rejeita o que depende delas (o que está dentro do item criado, o que cita
 *   o item, e na cascata de uma remoção, a remoção de quem a causa);
 * - limpar tira a aceitação do que dependia delas.
 * Mudanças aplicadas não mudam. Só uma proposta aberta aceita decisões.
 */
export function decide(
  p: Proposal,
  tree: ReviewTree,
  target: ReviewTarget,
  state: DecisionState | null,
  at: string,
): DecideResult {
  if (p.status !== 'open') return { ok: false, reason: 'not-open' };
  const all = tree.changeIdsOf(target);
  if (all.length === 0) return { ok: false, reason: 'unknown-target' };
  const applied = (id: string) => Object.hasOwn(p.applied, id);
  const targets = all.filter((id) => !applied(id));
  const next: Record<string, { state: DecisionState; at: string }> = { ...p.decisions };
  const set = (id: string, value: DecisionState | null) => {
    if (applied(id)) return;
    if (value === null) delete next[id];
    else if (next[id]?.state !== value) next[id] = { state: value, at };
  };
  for (const id of targets) set(id, state);
  if (state === 'accepted') {
    for (const id of requiredChanges(p, targets)) set(id, 'accepted');
  } else if (state === 'rejected') {
    for (const id of dependentChanges(p, targets)) set(id, 'rejected');
  } else {
    for (const id of dependentChanges(p, targets)) {
      if (next[id]?.state === 'accepted') set(id, null);
    }
  }
  const differs = (id: string) => p.decisions[id]?.state !== next[id]?.state;
  const inTarget = new Set(targets);
  return {
    ok: true,
    decisions: next,
    changed: targets.filter(differs),
    cascaded: p.changes.map((c) => c.id).filter((id) => !inTarget.has(id) && differs(id)),
  };
}

// ---------------------------------------------------------------------------
// Situação de cada mudança no projeto atual

export interface ChangeStatus {
  readonly decision: DecisionState | null;
  readonly applied: boolean;
  /**
   * O projeto mudou depois da proposta: o `from` não bate com o valor atual (ou a
   * entidade a alterar sumiu, ou a entidade a criar já existe). Aceitar sobrescreve o
   * valor atual; rejeitar mantém.
   */
  readonly conflict: boolean;
  /** Valor atual na forma de `from`/`to`; `undefined` se a entidade não existe. */
  readonly current: JsonValue | undefined;
  /** Geometria ou remoção de item trancado: aceitar é permitido e a trava continua. */
  readonly locked: boolean;
}

/** Remoção: compara a entidade sem o que não vira mudança (`needsReview`). */
function sameRemoved(c: Change, current: JsonValue): boolean {
  if (c.entity === 'marking' && isRecord(current) && isRecord(c.from)) {
    return jsonEqual(
      { ...current, needsReview: false },
      { ...c.from, needsReview: false },
    );
  }
  return jsonEqual(current, c.from);
}

function lockWarning(c: Change, project: Project): boolean {
  const index = projectIndex(project);
  if (c.entity === 'marking' && index.markings.has(c.entityId)) {
    if (c.kind === 'remove') return !canDeleteMarking(project, c.entityId);
    if (c.kind === 'update' && c.field === 'rect') {
      return !canEditMarkingGeometry(project, c.entityId);
    }
  }
  if (c.entity === 'image' && index.images.has(c.entityId)) {
    if (c.kind === 'remove') return !canDeleteImage(project, c.entityId);
    if (c.kind === 'update' && c.field === 'placement') {
      return !canEditImagePlacement(project, c.entityId);
    }
    if (c.kind === 'update' && c.field === 'file' && isRecord(c.to)) {
      const { width, height } = c.to;
      if (typeof width === 'number' && typeof height === 'number') {
        return !canReplaceImage(project, c.entityId, { width, height });
      }
    }
  }
  return false;
}

export function changeStatus(p: Proposal, c: Change, project: Project): ChangeStatus {
  const decision = p.decisions[c.id]?.state ?? null;
  const applied = Object.hasOwn(p.applied, c.id);
  const current = currentValue(project, c);
  let conflict = false;
  if (!applied) {
    if (c.kind === 'create') conflict = current !== undefined;
    else if (c.kind === 'remove')
      conflict = current === undefined || !sameRemoved(c, current);
    else if (current === undefined) {
      // Alteração de uma entidade criada por esta mesma proposta: sem conflito.
      conflict = !proposalIndex(p).created.has(entityKey(c.entity, c.entityId));
    } else if (!(c.field === 'position' && c.from === null)) {
      conflict = !jsonEqual(current, c.from);
    }
  }
  return {
    decision,
    applied,
    conflict,
    current,
    locked: !applied && lockWarning(c, project),
  };
}

/** Situação de todas as mudanças, por id. */
export function changeStatuses(p: Proposal, project: Project): Map<string, ChangeStatus> {
  return new Map(p.changes.map((c) => [c.id, changeStatus(p, c, project)]));
}

// ---------------------------------------------------------------------------
// Notas e estado da proposta

/** Acrescenta uma nota (id padrão: `crypto.randomUUID()`). */
export function addNote(
  p: Proposal,
  target: ReviewTarget,
  text: string,
  at: string,
  id: string = crypto.randomUUID(),
): Proposal {
  const note: ProposalNote = {
    id,
    target: { level: target.level, id: target.id },
    text,
    at,
  };
  return { ...p, notes: [...p.notes, note] };
}

/** Troca o texto de uma nota; texto vazio a remove. */
export function editNote(
  p: Proposal,
  noteId: string,
  text: string,
  at: string,
): Proposal {
  if (text.trim() === '') return removeNote(p, noteId);
  return {
    ...p,
    notes: p.notes.map((n) => (n.id === noteId ? { ...n, text, at } : n)),
  };
}

export function removeNote(p: Proposal, noteId: string): Proposal {
  return { ...p, notes: p.notes.filter((n) => n.id !== noteId) };
}

/** Notas de um alvo, na ordem em que foram escritas. */
export function notesOf(p: Proposal, target: ReviewTarget): ProposalNote[] {
  return p.notes.filter(
    (n) => n.target.level === target.level && n.target.id === target.id,
  );
}

/** O agente retira uma proposta aberta. */
export function withdrawProposal(p: Proposal): Proposal {
  return p.status === 'open' ? { ...p, status: 'withdrawn' } : p;
}

/** Marca a proposta como substituída (as decisões e notas continuam guardadas). */
export function supersedeProposal(p: Proposal): Proposal {
  return p.status === 'open' ? { ...p, status: 'superseded' } : p;
}
