import {
  canDeleteImage,
  canDeleteMarking,
  canEditArrow,
  canEditImagePlacement,
  canEditMarkingGeometry,
  canReplaceImage,
} from './locks';
import type {
  Change,
  ChangeEntity,
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

// Review of a proposal (stage 4): dependencies between changes, levels (proposal →
// project/canvas/image → item → change), three-state decisions with "partial", conflicts
// and the locked-item warning. All pure: the app (derived state) and the MCP use the same.

// ---------------------------------------------------------------------------
// Dependencies

export interface ProposalIndex {
  readonly changes: ReadonlyMap<string, Change>;
  /** The creation change of each entity created by the proposal (by `entityKey`). */
  readonly created: ReadonlyMap<string, string>;
  /**
   * What each change requires: accepting the change accepts these (and what they require).
   * A creation or update that cites an entity created in the proposal requires its creation;
   * a removal requires the changes that stop citing the removed entity (the cascade).
   */
  readonly requires: ReadonlyMap<string, readonly string[]>;
  /** The inverse of `requires`: rejecting the change rejects these (and what depends on them). */
  readonly dependents: ReadonlyMap<string, readonly string[]>;
}

function buildIndex(changes: readonly Change[]): ProposalIndex {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const created = new Map<string, string>();
  for (const c of changes) {
    if (c.kind === 'create') created.set(entityKey(c.entity, c.entityId), c.id);
  }
  // Who cites each entity in the previous state and stops citing it.
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

/** Index of the changes, memoized by the list (deciding does not change the list). */
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

/** Changes required (transitively) by `changeIds`, not counting themselves. */
export function requiredChanges(p: Proposal, changeIds: readonly string[]): string[] {
  return closure(changeIds, proposalIndex(p).requires);
}

/** Changes that depend (transitively) on `changeIds`, not counting themselves. */
export function dependentChanges(p: Proposal, changeIds: readonly string[]): string[] {
  return closure(changeIds, proposalIndex(p).dependents);
}

// ---------------------------------------------------------------------------
// Levels

export interface ReviewNode {
  readonly level: Exclude<ReviewLevel, 'change'>;
  readonly id: string | null;
  /** The level's direct changes (for an image: those of the image itself). */
  readonly changeIds: readonly string[];
  readonly children: readonly ReviewNode[];
}

export interface ReviewTree {
  readonly root: ReviewNode;
  /** Node of a level (`level:id`, e.g. `item:3f2a…`; `project:`, `proposal:`). */
  readonly nodes: ReadonlyMap<string, ReviewNode>;
  /** All the target's changes (the level and everything below), in the proposal's order. */
  changeIdsOf(target: ReviewTarget): readonly string[];
}

function nodeKey(level: ReviewLevel, id: string | null): string {
  return `${level}:${id ?? ''}`;
}

/**
 * Parent of each marking cited by the proposal, to nest the items: the proposed one
 * (creation; the `parentId` of an update is derived and does not come in the proposal), else
 * the current one, else the previous one (removed marking). An arrow's "parent" is the origin
 * marking (ME4): the arrow sits under it when the origin also has changes, otherwise under the
 * container (or the Canvas).
 */
function parentLookup(
  p: Proposal,
  project: Project,
): (markingId: string) => string | null {
  const proposed = new Map<string, string | null>();
  const removed = new Map<string, string | null>();
  const arrowOrigin = new Map<string, string>();
  for (const c of p.changes) {
    if (c.entity === 'arrow') {
      const value = c.kind === 'create' ? c.to : c.kind === 'remove' ? c.from : null;
      if (isRecord(value) && typeof value.from === 'string') {
        arrowOrigin.set(c.entityId, value.from);
      }
      continue;
    }
    if (c.entity !== 'marking') continue;
    if (c.kind === 'create' && isRecord(c.to)) {
      proposed.set(c.entityId, typeof c.to.parentId === 'string' ? c.to.parentId : null);
    } else if (c.kind === 'remove' && isRecord(c.from)) {
      removed.set(
        c.entityId,
        typeof c.from.parentId === 'string' ? c.from.parentId : null,
      );
    }
  }
  const index = projectIndex(project);
  return (id) => {
    if (proposed.has(id)) return proposed.get(id) ?? null;
    const current = index.markings.get(id);
    if (current) return current.parentId;
    const origin = arrowOrigin.get(id) ?? index.arrows.get(id)?.from;
    if (origin !== undefined) return origin;
    return removed.get(id) ?? null;
  };
}

/**
 * The review levels: Project (specializations, repositories and layers), Canvas (the
 * canvas markings, `imageId` null with `markingId`) and one image
 * for each cited image, with the items (markings with everything that changed in them,
 * including the annotations) nested by the hierarchy: the child sits inside the nearest
 * ancestor that also has changes. `project` is the current project (to find the parents of
 * the markings that were only updated).
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
  let canvasNode: MutableNode | null = null;
  const containers = new Map<string, MutableNode>();
  // `containerId` null: the item belongs to the canvas.
  const items = new Map<string, { node: MutableNode; containerId: string | null }>();

  for (const c of p.changes) {
    if (c.imageId === null && c.markingId === null) {
      if (!projectNode) {
        projectNode = make('project', null);
        root.children.unshift(projectNode);
      }
      projectNode.changeIds.push(c.id);
      continue;
    }
    if (c.markingId !== null && c.imageId === null && !canvasNode) {
      canvasNode = make('canvas', null);
      // After the Project and before the images: the Canvas is a sibling of the containers.
      root.children.splice(projectNode ? 1 : 0, 0, canvasNode);
    }
    let image: MutableNode | undefined;
    if (c.imageId !== null) {
      image = containers.get(c.imageId);
      if (!image) {
        image = make('image', c.imageId);
        containers.set(c.imageId, image);
        root.children.push(image);
      }
      if (c.markingId === null) {
        image.changeIds.push(c.id);
        continue;
      }
    }
    if (c.markingId === null) continue;
    let item = items.get(c.markingId);
    if (!item) {
      item = { node: make('item', c.markingId), containerId: c.imageId };
      items.set(c.markingId, item);
    }
    item.node.changeIds.push(c.id);
  }

  // Nests each item under the nearest ancestor with changes (in the same space).
  const parentOf = parentLookup(p, project);
  for (const [markingId, { node, containerId: imageId }] of items) {
    const seen = new Set([markingId]);
    let host: MutableNode | undefined;
    for (let up = parentOf(markingId); up !== null && !seen.has(up); up = parentOf(up)) {
      seen.add(up);
      const candidate = items.get(up);
      if (candidate && candidate.containerId === imageId) {
        host = candidate.node;
        break;
      }
    }
    (host ?? (imageId === null ? canvasNode : containers.get(imageId)))?.children.push(
      node,
    );
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
  for (const [level, node] of [
    ['project', projectNode],
    ['canvas', canvasNode],
  ] as const) {
    if (node) continue;
    nodes.set(nodeKey(level, null), make(level, null));
    all.set(nodeKey(level, null), []);
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
// State of a level

/** State of a level: the three states plus "partial" when the changes diverge. */
export type LevelState = 'accepted' | 'rejected' | 'undecided' | 'partial';

export interface LevelSummary {
  readonly state: LevelState;
  readonly total: number;
  /** Accepted (includes the applied ones). */
  readonly accepted: number;
  readonly rejected: number;
  readonly undecided: number;
  /** Accepted and already applied. */
  readonly applied: number;
}

/** Summarizes the decisions of a set of changes (e.g. `tree.changeIdsOf(target)`). */
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

/** Progress of the whole proposal, for the list of proposals and the supersede warning. */
export interface ReviewProgress extends LevelSummary {
  /** Accepted ones that have not been applied yet. */
  readonly acceptedPending: number;
  /** Nothing undecided and nothing accepted but unapplied: it can be superseded leaving nothing behind. */
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
// Deciding

export type DecideResult =
  | {
      readonly ok: true;
      readonly decisions: ProposalDecisions;
      /** Changes of the target whose state changed. */
      readonly changed: readonly string[];
      /** Changes outside the target that changed through dependencies ("4 rejected along"). */
      readonly cascaded: readonly string[];
    }
  | { readonly ok: false; readonly reason: 'not-open' | 'unknown-target' };

/**
 * Decides a level: accepts (`accepted`), rejects (`rejected`) or clears (`null`) all the
 * target's changes not yet applied and resolves the dependencies:
 * - accepting requires what the changes require (creation of the item, of the ancestors, of
 *   the layer…, and, for a removal, the cascade), which also becomes accepted;
 * - rejecting rejects what depends on them (what is inside the created item, what cites
 *   the item, and, in the cascade of a removal, the removal of whoever causes it);
 * - clearing removes the acceptance of what depended on them.
 * Applied changes do not change. Only an open proposal accepts decisions.
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
// Status of each change in the current project

export interface ChangeStatus {
  readonly decision: DecisionState | null;
  readonly applied: boolean;
  /**
   * The project changed after the proposal: the `from` does not match the current value (or
   * the entity to update is gone, or the entity to create already exists). Accepting
   * overwrites the current value; rejecting keeps it.
   */
  readonly conflict: boolean;
  /** Current value in the shape of `from`/`to`; `undefined` if the entity does not exist. */
  readonly current: JsonValue | undefined;
  /** Geometry or removal of a locked item: accepting is allowed and the lock stays. */
  readonly locked: boolean;
}

/**
 * Removal: compares the entity without what does not become a change (`needsReview`; the
 * arrow's route, which is the person's and may have changed after the proposal).
 */
function sameRemoved(c: Change, current: JsonValue): boolean {
  const normalize = REMOVED_NORMALIZERS[c.entity];
  if (!normalize || !isRecord(current) || !isRecord(c.from)) {
    return jsonEqual(current, c.from);
  }
  return jsonEqual(normalize(current), normalize(c.from));
}

type JsonRecord = Record<string, JsonValue>;

const without = (r: JsonRecord, key: string): JsonRecord => {
  const { [key]: ignored, ...own } = r;
  void ignored;
  return own;
};

/**
 * What the removal comparison sets aside, per entity: the container's `parentId` is derived
 * from the geometry (schema 13) and the proposal reader fills it in only in the `from`; the
 * arrow's route is the person's; a missing `parentRole` (proposal before v14) counts as
 * `null`, on both sides.
 */
const REMOVED_NORMALIZERS: Partial<Record<ChangeEntity, (r: JsonRecord) => JsonRecord>> =
  {
    marking: (r) => ({ ...r, needsReview: false }),
    image: (r) => without(r, 'parentId'),
    arrow: (r) => without(r, 'points'),
    annotation: (r) => ({ ...r, parentRole: r.parentRole ?? null }),
  };

function lockWarning(c: Change, project: Project): boolean {
  const index = projectIndex(project);
  if (c.entity === 'marking' && index.markings.has(c.entityId)) {
    if (c.kind === 'remove') return !canDeleteMarking(project, c.entityId);
    if (c.kind === 'update' && (c.field === 'rect' || c.field === 'space')) {
      return !canEditMarkingGeometry(project, c.entityId);
    }
  }
  if (c.entity === 'arrow' && c.kind === 'remove' && index.arrows.has(c.entityId)) {
    return !canEditArrow(project, c.entityId);
  }
  if (c.entity === 'image' && index.containers.has(c.entityId)) {
    if (c.kind === 'remove') return !canDeleteImage(project, c.entityId);
    if (c.kind === 'update' && (c.field === 'placement' || c.field === 'size')) {
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
      // Update of an entity created by this same proposal: no conflict.
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

/** Status of all the changes, by id. */
export function changeStatuses(p: Proposal, project: Project): Map<string, ChangeStatus> {
  return new Map(p.changes.map((c) => [c.id, changeStatus(p, c, project)]));
}

// ---------------------------------------------------------------------------
// Notes and proposal state

/** Adds a note (default id: `crypto.randomUUID()`). */
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

/** Replaces a note's text; empty text removes it. */
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

/** Notes of a target, in the order they were written. */
export function notesOf(p: Proposal, target: ReviewTarget): ProposalNote[] {
  return p.notes.filter(
    (n) => n.target.level === target.level && n.target.id === target.id,
  );
}

/** The agent withdraws an open proposal. */
export function withdrawProposal(p: Proposal): Proposal {
  return p.status === 'open' ? { ...p, status: 'withdrawn' } : p;
}

/** Marks the proposal as superseded (the decisions and notes stay stored). */
export function supersedeProposal(p: Proposal): Proposal {
  return p.status === 'open' ? { ...p, status: 'superseded' } : p;
}
