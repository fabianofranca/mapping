import type {
  Change,
  Proposal,
  ProposalStatus,
  ReviewLevel,
  ReviewTarget,
} from './proposal';
import type { ReviewProgress } from './proposalReview';
import { isAcceptedPending } from './proposalApply';
import { projectIndex } from './projectIndex';
import { isRecord } from './refs';
import type { Project } from './types';

// Reading of a proposal for the review interface (stage 4): the type of each change, the
// type of each level, filters, pending items, what was left behind in a superseded proposal,
// the status of a row in the Proposals window and the reminder on exit. Pure functions;
// the counts and the levels live in `proposalReview.ts`.

/**
 * Type of the change, for the badge and the filter (the shape tells the type; the color tells
 * the decision). `moved`: geometry (`rect` or a space change of the marking, `placement` of the
 * image). `replaced`: swap of the image's file. `changed`: any other field.
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
    (c.entity === 'marking' && (c.field === 'rect' || c.field === 'space')) ||
    (c.entity === 'image' && c.field === 'placement')
  ) {
    return 'moved';
  }
  return 'changed';
}

/**
 * Dominant type of a set of changes (an item or an image): created, removed, image
 * replaced, changed; "moved" only when the position is the only thing that changes.
 * `null` with no changes.
 */
export function dominantChangeType(types: Iterable<ChangeType>): ChangeType | null {
  const found = new Set(types);
  for (const type of ['created', 'removed', 'replaced', 'changed'] as const) {
    if (found.has(type)) return type;
  }
  return found.has('moved') ? 'moved' : null;
}

/**
 * Type of a review level (the badge of the Tree and the list), from the changes it
 * groups (`ReviewTree.changeIdsOf`). Item and image: the type of the entity itself (the
 * marking, the image), in the order created > removed > replaced > changed; "moved" only if
 * the position is the only thing that changes. With no change to the entity itself, what
 * changes inside it (a created annotation, a marking of the image) makes the level
 * "changed". The item may be an arrow (ME4): its creation and removal are the entity itself.
 * Proposal, Project and Canvas: the dominant one of everything. `null` with no changes.
 */
export function levelType(
  level: ReviewLevel,
  id: string | null,
  changes: readonly Change[],
): ChangeType | null {
  if (changes.length === 0) return null;
  const entity = level === 'item' ? 'marking' : level === 'image' ? 'image' : null;
  if (entity === null) return dominantChangeType(changes.map(changeType));
  const own = changes.filter(
    (c) =>
      (c.entity === entity || (entity === 'marking' && c.entity === 'arrow')) &&
      c.entityId === id,
  );
  const type = dominantChangeType(own.map(changeType));
  return type === null || (type === 'moved' && own.length < changes.length)
    ? 'changed'
    : type;
}

/** Key of a review target (`level:id`), the same as `ReviewTree.nodes`. */
export function reviewKey(target: ReviewTarget): string {
  return `${target.level}:${target.id ?? ''}`;
}

/**
 * Is the change about a canvas marking (or one of its annotations)? `imageId` null with
 * `markingId`; without both it is the Project group.
 */
export function isCanvasChange(c: Change): boolean {
  return c.imageId === null && c.markingId !== null;
}

/**
 * Where the change appears in the review: the item (marking, also the canvas one, which sits
 * in the Canvas group), the image or the Project group.
 */
export function changeTarget(c: Change): ReviewTarget {
  if (c.markingId !== null) return { level: 'item', id: c.markingId };
  if (c.imageId !== null) return { level: 'image', id: c.imageId };
  return { level: 'project', id: null };
}

/**
 * Layer the change belongs to: the annotation's (the proposed one, or the current one, or the
 * removed one) or the layer itself. `null` for the rest.
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
// Filters

export type DecisionFilter = 'all' | 'undecided' | 'accepted' | 'rejected';

/** Review filters. Empty/`null`/`'all'`/`false` = no filter on that criterion. */
export interface ReviewFilters {
  readonly types: readonly ChangeType[];
  /** Id of a container, `CANVAS_FILTER` (the Canvas group) or `null` (all). */
  readonly imageId: string | null;
  readonly layerId: string | null;
  readonly decision: DecisionFilter;
  readonly onlyConflicts: boolean;
  /** Only the changes with the "Revised" mark and no decision (stage #644). */
  readonly onlyRevised: boolean;
}

/**
 * Value of `ReviewFilters.imageId` that filters the Canvas group (the canvas markings) instead
 * of a container. It is not an image id.
 */
export const CANVAS_FILTER = '@canvas';

export const NO_FILTERS: ReviewFilters = {
  types: [],
  imageId: null,
  layerId: null,
  decision: 'all',
  onlyConflicts: false,
  onlyRevised: false,
};

const NO_REVISED: ReadonlySet<string> = new Set();

export function hasActiveFilters(f: ReviewFilters): boolean {
  return (
    f.types.length > 0 ||
    f.imageId !== null ||
    f.layerId !== null ||
    f.decision !== 'all' ||
    f.onlyConflicts ||
    f.onlyRevised
  );
}

/**
 * Changes that pass the filters, in the proposal's order. `conflicts`: the changes in
 * conflict with the current project (`changeStatuses`). With no filters, all of them.
 */
export function filterChanges(
  p: Proposal,
  project: Project,
  filters: ReviewFilters,
  conflicts: ReadonlySet<string>,
  revised: ReadonlySet<string> = NO_REVISED,
): Change[] {
  if (!hasActiveFilters(filters)) return [...p.changes];
  const types = new Set(filters.types);
  return p.changes.filter((c) => {
    if (types.size > 0 && !types.has(changeType(c))) return false;
    if (filters.imageId === CANVAS_FILTER) {
      if (!isCanvasChange(c)) return false;
    } else if (filters.imageId !== null && c.imageId !== filters.imageId) return false;
    if (filters.layerId !== null && changeLayerId(c, project) !== filters.layerId) {
      return false;
    }
    if (filters.onlyConflicts && !conflicts.has(c.id)) return false;
    if (filters.onlyRevised && !revised.has(c.id)) return false;
    const state = p.decisions[c.id]?.state ?? null;
    if (filters.decision === 'undecided') return state === null;
    if (filters.decision === 'accepted') return state === 'accepted';
    if (filters.decision === 'rejected') return state === 'rejected';
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pending items and superseded proposal

/** Changes without a decision, in the proposal's order. */
export function undecidedChanges(p: Proposal): string[] {
  return p.changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id);
}

/** Accepted ones that have not been applied yet. */
export function acceptedPendingIds(p: Proposal): string[] {
  return p.changes.filter(isAcceptedPending(p)).map((c) => c.id);
}

/**
 * What a closed (superseded) proposal left behind: what was undecided (the pending ones can
 * no longer be applied), the accepted ones not yet applied (they still can) and the
 * rejected ones.
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
 * The pending change after (or before) `fromId` among `ids` (proposal order), wrapping
 * around. Without `fromId` (or if it is not in `ids`), the first (or the last).
 * `ids` is usually the pending ones or the already filtered conflicts.
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

// ---------------------------------------------------------------------------
// Proposals window and leaving the review

/** The row's badge in the Proposals window (`null` without a badge); the interface translates it. */
export type ProposalListFlag =
  'new' | 'inReview' | 'superseded' | 'applied' | 'withdrawn';

export interface ProposalListStatus {
  readonly flag: ProposalListFlag | null;
  /** Review (not started yet), Continue (in progress) or View (closed). */
  readonly action: 'review' | 'continue' | 'view';
  /** The action is the window's primary one: only on a proposal that arrived and nobody opened (`fresh`). */
  readonly primary: boolean;
}

/**
 * Can the proposal be deleted (phase 9.2)? Only those that are not open (withdrawn,
 * superseded, applied): an open one still awaits the owner's decision, and its file is what
 * the agent and the review read.
 */
export function canRemoveProposal(p: Pick<Proposal, 'status'>): boolean {
  return p.status !== 'open';
}

/**
 * Status shown and action of a row in the Proposals window. `fresh`: open, with no decision
 * or note and not yet opened on this device ("New"); it is the same truth as the status
 * bar's count, so every `fresh` row carries the badge and the primary action.
 */
export function proposalListStatus(
  p: Proposal,
  progress: ReviewProgress,
  fresh: boolean,
): ProposalListStatus {
  switch (p.status) {
    case 'open': {
      if (fresh) return { flag: 'new', action: 'review', primary: true };
      const started = progress.accepted + progress.rejected > 0 || p.notes.length > 0;
      return started
        ? { flag: 'inReview', action: 'continue', primary: false }
        : { flag: null, action: 'review', primary: false };
    }
    case 'superseded':
      return { flag: 'superseded', action: 'view', primary: false };
    case 'applied':
      return { flag: 'applied', action: 'view', primary: false };
    case 'withdrawn':
      return { flag: 'withdrawn', action: 'view', primary: false };
  }
}

/**
 * Does leaving the review call for the reminder? Only with accepted changes awaiting
 * application in a proposal that can still be applied (open or superseded). Nothing is lost
 * in any case.
 */
export function needsExitReminder(
  status: ProposalStatus | undefined,
  acceptedPending: number,
): boolean {
  return acceptedPending > 0 && (status === 'open' || status === 'superseded');
}

/**
 * Image file (`images/screen.webp`) that the change brings: the creation or the file swap
 * of an image. Until it is accepted, it waits in `proposals/<id>/` plus this path.
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
