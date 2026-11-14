import {
  patchProject,
  projectIndex,
  proposalIndex,
  reviewProgress,
  summarizeDecisions,
  droppedNoteOrigin,
  latestRevisionSummary,
  revisionMark,
  visibleRevisedChanges,
  type Change,
  type ChangeStatus,
  type ItemKind,
  type JsonValue,
  type Project,
  type Proposal,
  type ProposalNote,
  type ReviewNode,
  type ReviewTree,
} from '../src/model';
import { Refs } from './items';
import type { LoadedProject } from './projects';
import { isRecord } from './shared';

// Compact views of proposals for the agent (stage 4.2): state of each change, review
// levels, progress and notes. Every rule (levels, decisions, conflicts) comes from `src/model/`.

type Json = Record<string, unknown>;

/**
 * Labels and `mapping://` references of a proposal's entities. Uses the "as it would
 * be" project (with all the changes, for the created items) and, failing that, the current project
 * (for the removed items).
 */
export class ProposalLabels {
  private constructor(
    private readonly proposed: Refs,
    private readonly current: Refs,
  ) {}

  /** `proposed` is the project with all the proposal's changes applied (`patchProject`). */
  static of(loaded: LoadedProject, proposed: Project): ProposalLabels {
    return new ProposalLabels(
      new Refs({ ...loaded, project: proposed }),
      new Refs(loaded),
    );
  }

  /** For the preview of a new proposal: the after is the result of the batch. */
  static ofRefs(proposed: Refs, current: Refs): ProposalLabels {
    return new ProposalLabels(proposed, current);
  }

  /** Reference of the marking, container or annotation; `null` if it exists in neither. */
  ref(kind: ItemKind, id: string): string | null {
    for (const refs of [this.proposed, this.current]) {
      const index = projectIndex(refs.project);
      const map =
        kind === 'm'
          ? index.markings
          : kind === 'i'
            ? index.containers
            : index.annotations;
      if (map.has(id)) return refs.ref(kind, id);
    }
    return null;
  }

  private layerName(id: string): string {
    for (const refs of [this.proposed, this.current]) {
      const layer = projectIndex(refs.project).layers.get(id);
      if (layer) return layer.name;
    }
    return id;
  }

  /** The readable target of a change. */
  target(c: Change): string {
    switch (c.entity) {
      case 'image':
        return this.ref('i', c.entityId) ?? `container ${c.entityId}`;
      case 'marking':
        return this.ref('m', c.entityId) ?? `marking ${c.entityId}`;
      case 'arrow':
        return `arrow ${c.entityId}`;
      case 'annotation':
        return this.ref('a', c.entityId) ?? `annotation ${c.entityId}`;
      case 'layer':
        return `layer "${this.layerName(c.entityId)}"`;
      case 'specialization':
        return `specialization ${c.entityId}`;
      case 'platformRepo':
        return `platform repository ${c.entityId}`;
      case 'docRepo':
        return `documents repository ${c.entityId}`;
      case 'project':
        return 'project drawing mode and direction';
    }
  }
}

/** The whole specialization (`spec`) is not in the response: the agent has it in the file it sent. */
function slim(c: Change, value: JsonValue): JsonValue {
  if (c.entity !== 'specialization' || !isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'spec'));
}

export type ChangeState = 'pending' | 'accepted' | 'rejected' | 'applied';

export function stateOf(p: Proposal, id: string): ChangeState {
  if (Object.hasOwn(p.applied, id)) return 'applied';
  return p.decisions[id]?.state ?? 'pending';
}

export function conflictView(status: ChangeStatus): Json | null {
  if (!status.conflict) return null;
  return status.current === undefined
    ? { current: null, missing: true }
    : { current: status.current };
}

/** The change's revision mark for the agent (`revised`), or `null` if no revision cites it. */
export function revisedView(p: Proposal, c: Change): Json | null {
  const mark = revisionMark(p, c.id);
  if (mark === null) return null;
  return {
    at: mark.at,
    kind: mark.kind,
    ...(mark.previous
      ? { previous: { to: slim(c, mark.previous.to), state: mark.previous.state } }
      : {}),
  };
}

/** Summary of the proposal's revisions (`revisions`): how many and the date and counts of the last one. */
export function revisionsView(p: Proposal): Json {
  const last = latestRevisionSummary(p);
  if (last === null) return {};
  return { revisions: { count: p.revisions!.length, last } };
}

/** Can be revised by the agent: open and with nothing applied. */
export const isRevisable = (p: Proposal): boolean =>
  p.status === 'open' && Object.keys(p.applied).length === 0;

/** A change: state, target and values before and after (and conflict/lock, if any). */
export function changeView(
  p: Proposal,
  c: Change,
  status: ChangeStatus,
  labels: ProposalLabels,
): Json {
  const conflict = conflictView(status);
  // The mark only applies without a decision (the same rule as `visibleRevisedChanges`).
  const revised = p.decisions[c.id] === undefined ? revisedView(p, c) : null;
  return {
    id: c.id,
    state: stateOf(p, c.id),
    kind: c.kind,
    entity: c.entity,
    target: labels.target(c),
    ...(c.field !== null ? { field: c.field } : {}),
    ...(c.kind !== 'create' ? { from: slim(c, c.from) } : {}),
    ...(c.kind !== 'remove' ? { to: slim(c, c.to) } : {}),
    ...(conflict ? { conflict } : {}),
    ...(status.locked ? { locked: true } : {}),
    ...(revised ? { revised } : {}),
  };
}

/** Replaced and new changes still awaiting the user's decision (they are not rejected). */
export function awaitingView(p: Proposal, labels: ProposalLabels): Json[] {
  const byId = proposalIndex(p).changes;
  return visibleRevisedChanges(p).map((id) => {
    const c = byId.get(id)!;
    return {
      change: id,
      target: labels.target(c),
      ...(c.field !== null ? { field: c.field } : {}),
      revised: revisedView(p, c),
    };
  });
}

/** Note that rose to the proposal level: which withdrawn change it came from. */
export function droppedFrom(p: Proposal, noteId: string, labels: ProposalLabels): Json {
  const origin = droppedNoteOrigin(p, noteId);
  if (origin === null) return {};
  return {
    fromDroppedChange: {
      id: origin.id,
      target: labels.target(origin),
      ...(origin.field !== null ? { field: origin.field } : {}),
    },
  };
}

/** Non-overlapping counts: they add up to the total of changes. */
export function progressView(p: Proposal): Json {
  const progress = reviewProgress(p);
  return {
    total: progress.total,
    pending: progress.undecided,
    accepted: progress.acceptedPending,
    rejected: progress.rejected,
    applied: progress.applied,
    complete: progress.complete,
  };
}

function countItems(node: ReviewNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countItems(child), 0);
}

/** The kind of change of each container, from a single scan of the proposal's changes. */
function imageKinds(p: Proposal): Map<string, 'new' | 'removed' | 'changed'> {
  const kinds = new Map<string, 'new' | 'removed' | 'changed'>();
  for (const c of p.changes) {
    if (c.entity !== 'image') continue;
    const current = kinds.get(c.entityId);
    if (c.kind === 'create') kinds.set(c.entityId, 'new');
    else if (c.kind === 'remove' && current !== 'new') kinds.set(c.entityId, 'removed');
    else if (current === undefined) kinds.set(c.entityId, 'changed');
  }
  return kinds;
}

/** Summary by level: Project and each container (level `image` in `proposal.json`), with the decision state and the counts. */
export function levelsView(p: Proposal, tree: ReviewTree, labels: ProposalLabels): Json {
  const summarize = (node: ReviewNode) => {
    const summary = summarizeDecisions(
      p,
      tree.changeIdsOf({ level: node.level, id: node.id }),
    );
    return {
      state: summary.state,
      changes: summary.total,
      pending: summary.undecided,
      accepted: summary.accepted - summary.applied,
      rejected: summary.rejected,
      applied: summary.applied,
    };
  };
  const kinds = imageKinds(p);
  const project = tree.nodes.get('project:');
  return {
    ...(project ? { project: summarize(project) } : {}),
    containers: tree.root.children
      .filter((node) => node.level === 'image')
      .map((node) => ({
        container: labels.ref('i', node.id!) ?? node.id,
        change: kinds.get(node.id!) ?? 'items',
        items: countItems(node),
        ...summarize(node),
      })),
  };
}

/** Counts by kind of change, for the summary of a new proposal. */
export function kindCounts(p: Proposal): Json {
  const counts = { create: 0, update: 0, remove: 0 };
  for (const c of p.changes) counts[c.kind]++;
  return { total: p.changes.length, ...counts };
}

/** Note with the readable target (reference of the container or item; id of the change). */
export function noteView(p: Proposal, note: ProposalNote, labels: ProposalLabels): Json {
  const { level, id } = note.target;
  let target: string | null = null;
  let on: string | undefined;
  if (level === 'image' && id) target = labels.ref('i', id) ?? id;
  else if (level === 'item' && id) target = labels.ref('m', id) ?? id;
  else if (level === 'change' && id) {
    target = id;
    const change = proposalIndex(p).changes.get(id);
    if (change) on = labels.target(change);
  }
  return {
    id: note.id,
    level,
    ...(target !== null ? { target } : {}),
    ...(on !== undefined ? { on } : {}),
    text: note.text,
    at: note.at,
  };
}

/** The project with all the proposal's changes (to label created and removed items). */
export function proposedProject(project: Project, p: Proposal): Project {
  return patchProject(project, p.changes).project;
}

const REVISE_HINT =
  'the proposal can still be corrected under the same reference: use revise_proposal (replace the value with `operations` or withdraw it with `drop`; an accepted change is frozen) instead of sending another proposal';
const SUPERSEDE_HINT =
  'correct only what was rejected (and the conflicts) by reading the current project, and send with propose_changes and supersedes pointing to this proposal';

/** Text of the `get_proposal_review` hint: revise in the same proposal or supersede it. */
export function reviewHint(
  p: Proposal,
  progress: { complete: boolean; undecided: number; acceptedPending: number },
  toFix: number,
): string {
  const revisable = isRevisable(p);
  if (!progress.complete) {
    const wait = `the review has not finished yet (${progress.undecided} undecided, ${progress.acceptedPending} accepted without being applied)`;
    if (revisable && toFix > 0)
      return `${wait}, but there is something to fix: ${REVISE_HINT}`;
    return `${wait}: tell the user and wait before ${revisable ? 'correcting' : 'sending a proposal that supersedes it (propose_changes with supersedes)'}`;
  }
  if (toFix === 0)
    return 'the review finished with no rejections or conflicts: there is nothing to fix';
  return revisable
    ? `the review finished: ${REVISE_HINT}. If something was applied or a library package is new, ${SUPERSEDE_HINT}`
    : `the review finished: ${SUPERSEDE_HINT}`;
}
