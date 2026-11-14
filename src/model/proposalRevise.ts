import {
  PROPOSAL_REVISED_FORMAT_VERSION,
  proposalFormatVersionFor,
  type Change,
  type Proposal,
  type ProposalDecisions,
  type ProposalNote,
  type ProposalRevision,
  type RevisedPriorState,
  type RevisionDropped,
} from './proposal';
import { computeChanges } from './proposalChanges';
import { patchProject, validateAccepted, type ProposalIssue } from './proposalApply';
import { dependentChanges, proposalIndex } from './proposalReview';
import { jsonEqual } from './proposalValues';
import type { JsonValue, Project } from './types';

// Proposal revision by the agent (stage #644, CP1). The agent corrects an open proposal with
// nothing applied: it drops changes (`drop`) and applies a batch of operations over the **whole
// proposed state** (the current project with all the changes that remained, whatever the
// decision). The MCP server applies the batch; the model only receives the project after it:
//   `prepareRevision` (validates, closes the `drop`, builds the proposed state) → batch →
//   `reviseProposal`.
// Each change ends up as one of: untouched (identical), swapped (same id and `from`, new `to`,
// no decision), new (new id) or dropped (leaves `changes` and goes to `revisions[].dropped`).
// An accepted change is never swapped or dropped (frozen). Docs: docs/PROPOSAL-FORMAT.md.

export type ReviseErrorCode =
  | 'not-open'
  | 'proposal-applied'
  | 'change-not-found'
  | 'change-frozen'
  | 'proposal-not-applicable'
  | 'no-changes';

export interface ReviseError {
  readonly code: ReviseErrorCode;
  readonly message: string;
  readonly changeIds: readonly string[];
  /** In `proposal-not-applicable`: what prevents the proposal from being applied (from `validateAccepted`). */
  readonly problems?: readonly ProposalIssue[];
}

type Failure = { readonly ok: false; readonly error: ReviseError };

function fail(
  code: ReviseErrorCode,
  message: string,
  changeIds: readonly string[] = [],
  problems?: readonly ProposalIssue[],
): Failure {
  return {
    ok: false,
    error: { code, message, changeIds, ...(problems ? { problems } : {}) },
  };
}

const isAccepted = (p: Proposal, id: string) => p.decisions[id]?.state === 'accepted';

function frozenFailure(ids: readonly string[]): Failure {
  return fail(
    'change-frozen',
    `Accepted changes cannot be swapped or dropped: ${ids.join(', ')}.`,
    ids,
  );
}

/** Checks the proposal's state and the `drop` ids; returns the closure (ids, without repeats). */
function closeDrop(
  p: Proposal,
  drop: readonly string[],
): { readonly ok: true; readonly closure: ReadonlySet<string> } | Failure {
  if (p.status !== 'open') {
    return fail('not-open', `The proposal is not open (${p.status}).`);
  }
  const applied = Object.keys(p.applied);
  if (applied.length > 0) {
    return fail('proposal-applied', 'The proposal already has applied changes.', applied);
  }
  const known = proposalIndex(p).changes;
  const unknown = drop.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return fail(
      'change-not-found',
      `Change does not exist: ${unknown.join(', ')}.`,
      unknown,
    );
  }
  // Dropping a creation drops what depends on it; dropping a cascade removal drops the one
  // that causes it: the review index already models both.
  return { ok: true, closure: new Set([...drop, ...dependentChanges(p, drop)]) };
}

/**
 * Step 1 of the revision: validates the proposal's state, closes the `drop` over the
 * dependencies, checks that the closure does not touch an accepted change and builds the **whole
 * proposed state** (the current project with all the changes that remained: accepted, rejected
 * and undecided). `dropped` is the closure, in `changes` order. If what remains does not fit
 * the project, it refuses with the problems: `validateAccepted` is reused with a copy in which
 * everything that remained is accepted, which gives `entity-missing`, `entity-exists`,
 * `field-mismatch`, the invariants and the `changeIds` involved.
 */
export function prepareRevision(
  project: Project,
  proposal: Proposal,
  drop: readonly string[],
):
  | { readonly ok: true; readonly dropped: readonly string[]; readonly proposed: Project }
  | Failure {
  const closed = closeDrop(proposal, drop);
  if (!closed.ok) return closed;
  const { closure } = closed;
  const frozen = [...closure].filter((id) => isAccepted(proposal, id));
  if (frozen.length > 0) {
    return frozenFailure(
      proposal.changes.map((c) => c.id).filter((id) => frozen.includes(id)),
    );
  }
  const kept = proposal.changes.filter((c) => !closure.has(c.id));
  const allAccepted: ProposalDecisions = Object.fromEntries(
    kept.map((c) => [c.id, { state: 'accepted' as const, at: '' }]),
  );
  const check = validateAccepted(project, {
    ...proposal,
    changes: kept,
    decisions: allAccepted,
    applied: {},
  });
  if (!check.ok) {
    const involved = new Set(check.issues.flatMap((i) => i.changeIds));
    return fail(
      'proposal-not-applicable',
      'The proposal no longer applies to the current project.',
      kept.map((c) => c.id).filter((id) => involved.has(id)),
      check.issues,
    );
  }
  return {
    ok: true,
    dropped: proposal.changes.map((c) => c.id).filter((id) => closure.has(id)),
    proposed: check.project,
  };
}

// ---------------------------------------------------------------------------
// Classification by the change key

/** Key of a change: the field for an update; only the entity (and the kind) for a creation and a removal. */
function changeKey(c: Change): string {
  const head = `${c.entity}|${c.entityId}`;
  return c.kind === 'update' ? `${head}|${c.field ?? ''}` : `${head}|${c.kind}`;
}

const MARKING_GEOMETRY = new Set(['rect', 'space', 'containerId']);

/**
 * Field family: the batch touching one field of the family counts as touching the others in it
 * (the marking changes space via `space` or via `rect`; the annotation, via type or content).
 */
function family(c: Change): string {
  const field = c.field ?? '';
  if (c.entity === 'marking' && MARKING_GEOMETRY.has(field)) return 'geometry';
  const typed =
    field === 'type' || field.startsWith('values.') || field.startsWith('entries.');
  return c.entity === 'annotation' && typed ? 'content' : field;
}

/** What the batch touched, per entity: the field families, or `*` (created or removed). */
function touchedBy(batch: readonly Change[]): Map<string, Set<string>> {
  const touched = new Map<string, Set<string>>();
  for (const b of batch) {
    const key = `${b.entity}|${b.entityId}`;
    const set = touched.get(key) ?? new Set<string>();
    set.add(b.kind === 'update' ? family(b) : '*');
    touched.set(key, set);
  }
  return touched;
}

function wasTouched(
  touched: ReadonlyMap<string, ReadonlySet<string>>,
  c: Change,
): boolean {
  // `position` (marking and layer) is derived from the final order of the sibling group: when
  // the net effect no longer asks for it, it no longer holds, even if the batch did not touch it.
  if (c.kind === 'update' && c.field === 'position') return true;
  const set = touched.get(`${c.entity}|${c.entityId}`);
  if (!set) return false;
  return c.kind !== 'update' || set.has('*') || set.has(family(c));
}

/** The `parentId` is derived from geometry and informational only: left out of the creation comparison. */
function withoutParent(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'parentId'));
}

function sameTo(old: Change, next: Change): boolean {
  const derived =
    old.kind === 'create' && (old.entity === 'marking' || old.entity === 'image');
  return derived
    ? jsonEqual(withoutParent(old.to), withoutParent(next.to))
    : jsonEqual(old.to, next.to);
}

type Verdict =
  | { readonly kind: 'same'; readonly old: Change; readonly next?: Change }
  | { readonly kind: 'swapped'; readonly old: Change; readonly next: Change }
  | { readonly kind: 'retired'; readonly old: Change };

interface Classification {
  readonly verdicts: readonly Verdict[];
  /** The net-effect changes without a pair: the new ones, in proposed order. */
  readonly fresh: readonly Change[];
}

/**
 * Classifies the changes that remained by the net effect `net` (from the current project to the
 * result) and by what the batch touched, `batch` (from the proposed state to the result).
 */
function classify(
  kept: readonly Change[],
  net: readonly Change[],
  batch: readonly Change[],
): Classification {
  const byKey = new Map(net.map((n) => [changeKey(n), n]));
  const touched = touchedBy(batch);
  const used = new Set<Change>();
  const verdicts = kept.map((old): Verdict => {
    const next = byKey.get(changeKey(old));
    if (next && !used.has(next)) {
      used.add(next);
      return sameTo(old, next)
        ? { kind: 'same', old, next }
        : { kind: 'swapped', old, next };
    }
    return wasTouched(touched, old) ? { kind: 'retired', old } : { kind: 'same', old };
  });
  return { verdicts, fresh: net.filter((n) => !used.has(n)) };
}

// ---------------------------------------------------------------------------
// Assembling the revised proposal

/** Parents (markings and containers) and siblings in order: what the anchor and `position` guarantee. */
function structure(p: Project): string {
  const groups = new Map<string, string[]>();
  for (const m of p.markings) {
    const key = `${m.containerId ?? ''}|${m.parentId ?? ''}|${String(m.floating)}`;
    const group = groups.get(key);
    if (group) group.push(m.id);
    else groups.set(key, [m.id]);
  }
  const parents = (items: readonly { id: string; parentId: string | null }[]) =>
    items
      .map((i): [string, string | null] => [i.id, i.parentId])
      .sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([
    parents(p.markings),
    parents(p.containers),
    [...groups].sort(([a], [b]) => (a < b ? -1 : 1)),
  ]);
}

const isMarkingCreate = (c: Change) => c.kind === 'create' && c.entity === 'marking';

/**
 * The untouched ones keep the anchor (`insertBefore`). If, with them, applying the changes does
 * not give the parents and sibling order of the batch result (the old anchor vanished, or the
 * new `position` assumes another), a marking creation whose net-effect anchor is different
 * becomes **swapped**: its place in the array is part of its effect (it loses the decision; if
 * accepted, it freezes the revision).
 */
function settleAnchors(
  project: Project,
  target: Project,
  net: readonly Change[],
  { verdicts, fresh }: Classification,
): readonly Verdict[] {
  const trial = assemble(net, verdicts, new Map(fresh.map((n) => [n, n])));
  if (structure(patchProject(project, trial).project) === structure(target))
    return verdicts;
  return verdicts.map((v): Verdict => {
    const moved =
      v.kind === 'same' &&
      v.next !== undefined &&
      isMarkingCreate(v.old) &&
      (v.next.insertBefore ?? null) !== (v.old.insertBefore ?? null);
    return moved && v.next ? { kind: 'swapped', old: v.old, next: v.next } : v;
  });
}

/** The next `c<n>` greater than any id already used: in `changes`, in `added` and in `dropped`. */
function idCounter(p: Proposal): () => string {
  let max = 0;
  const see = (id: string) => {
    const m = /^c(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  };
  p.changes.forEach((c) => see(c.id));
  for (const r of p.revisions ?? []) {
    r.added.forEach(see);
    r.dropped.forEach((d) => see(d.change.id));
    Object.keys(r.changed).forEach(see);
  }
  return () => `c${++max}`;
}

/** The same change with another anchor (`undefined` removes the field). */
function withAnchor(c: Change, insertBefore: string | null | undefined): Change {
  const copy: { -readonly [K in keyof Change]: Change[K] } = { ...c };
  if (insertBefore === undefined) delete copy.insertBefore;
  else copy.insertBefore = insertBefore;
  return copy;
}

/** The swapped change: id, `from` and the rest of the old one, with the new one's `to` (and anchor). */
function swappedChange(old: Change, next: Change): Change {
  const anchored = old.kind === 'create' && old.entity === 'marking';
  return withAnchor(
    { ...old, to: next.to },
    anchored ? next.insertBefore : old.insertBefore,
  );
}

/** Proposed order: each change in its pair's place; those without a pair go at the end, in the old order. */
function assemble(
  net: readonly Change[],
  verdicts: readonly Verdict[],
  fresh: ReadonlyMap<Change, Change>,
): Change[] {
  const placed = new Map<Change, Change>();
  const tail: Change[] = [];
  for (const v of verdicts) {
    if (v.kind === 'retired') continue;
    const result = v.kind === 'swapped' ? swappedChange(v.old, v.next) : v.old;
    if (v.next) placed.set(v.next, result);
    else tail.push(result);
  }
  const ordered = net.flatMap((n) => {
    const out = placed.get(n) ?? fresh.get(n);
    return out ? [out] : [];
  });
  return [...ordered, ...tail];
}

function stateBefore(p: Proposal, id: string): RevisedPriorState {
  return p.decisions[id]?.state === 'rejected' ? 'rejected' : null;
}

/** Notes attached to dropped changes move up to the proposal level, with the same text and date. */
function liftNotes(notes: readonly ProposalNote[], retired: ReadonlySet<string>) {
  return notes.map((n) =>
    n.target.level === 'change' && n.target.id !== null && retired.has(n.target.id)
      ? { ...n, target: { level: 'proposal' as const, id: null } }
      : n,
  );
}

function buildRevision(
  p: Proposal,
  project: Project,
  args: ReviseArgs,
  swapped: readonly Verdict[],
  added: readonly string[],
  retired: readonly Change[],
): ProposalRevision {
  const changed = Object.fromEntries(
    swapped.map((v) => [v.old.id, { to: v.old.to, state: stateBefore(p, v.old.id) }]),
  );
  const dropped: RevisionDropped[] = retired.map((change) => ({
    change,
    state: stateBefore(p, change.id),
    notes: p.notes
      .filter((n) => n.target.level === 'change' && n.target.id === change.id)
      .map((n) => n.id),
  }));
  return {
    at: args.at,
    baseRevision: project.revision,
    operations: args.operations ?? [],
    changed,
    added,
    dropped,
  };
}

export interface ReviseArgs {
  /** Changes to drop (the closure over the dependencies also goes). */
  readonly drop?: readonly string[];
  /** The proposed state after the batch; absent = no batch. */
  readonly after?: Project;
  /** ISO 8601 date of the revision. */
  readonly at: string;
  /** The batch operations, for reference only (the base64 already replaced by the placeholder). */
  readonly operations?: readonly JsonValue[];
}

export interface ReviseSummary {
  /** Swapped (same id, new `to`). */
  readonly changed: readonly string[];
  /** New (new id). */
  readonly added: readonly string[];
  /** Dropped: the `drop` closure and those the batch undid, in `changes` order. */
  readonly dropped: readonly string[];
}

/**
 * Step 2 of the revision: classifies the changes and returns the new proposal (`formatVersion`
 * 5, with the revision added to `revisions`); `revision`, title and the rest do not change (the
 * one who saves takes care of `revision`). Redoes `prepareRevision` internally (pure).
 * Classification, no heuristics:
 * - `N = computeChanges(project, after)` is the net effect of the result over the current
 *   project; `B = computeChanges(proposed, after)`, what the batch touched;
 * - a change that remained and has its key in `N` is untouched (same `to`; in marking and
 *   container creations the `parentId` is left out of the comparison) or swapped (another `to`);
 * - without its key in `N`: dropped if `B` touched the entity (the field or its family),
 *   untouched if it did not (the project changed from outside);
 * - each change in `N` without a pair is new, with `from` taken from the current project.
 * Swapping or dropping an accepted change refuses the whole call (`change-frozen`).
 */
export function reviseProposal(
  project: Project,
  proposal: Proposal,
  args: ReviseArgs,
):
  | { readonly ok: true; readonly proposal: Proposal; readonly summary: ReviseSummary }
  | Failure {
  const prep = prepareRevision(project, proposal, args.drop ?? []);
  if (!prep.ok) return prep;
  const closure = new Set(prep.dropped);
  const kept = proposal.changes.filter((c) => !closure.has(c.id));
  const after = args.after ?? prep.proposed;
  const net = computeChanges(project, after);
  const batch = args.after ? computeChanges(prep.proposed, after) : [];
  const classified = classify(kept, net, batch);
  const { fresh } = classified;
  const verdicts = settleAnchors(project, after, net, classified);

  const swapped = verdicts.filter((v) => v.kind === 'swapped');
  const undone = new Set(
    verdicts.flatMap((v) => (v.kind === 'retired' ? [v.old.id] : [])),
  );
  const retired = proposal.changes.filter((c) => closure.has(c.id) || undone.has(c.id));
  const frozen = [...swapped.map((v) => v.old), ...retired]
    .filter((c) => isAccepted(proposal, c.id))
    .map((c) => c.id);
  if (frozen.length > 0) return frozenFailure(frozen);
  if (swapped.length === 0 && fresh.length === 0 && retired.length === 0) {
    return fail('no-changes', 'The revision does not change any change of the proposal.');
  }
  return finish(project, proposal, args, {
    net,
    verdicts,
    fresh,
    swapped,
    retired,
  });
}

interface Plan {
  readonly net: readonly Change[];
  readonly verdicts: readonly Verdict[];
  readonly fresh: readonly Change[];
  readonly swapped: readonly Verdict[];
  readonly retired: readonly Change[];
}

type Revised = {
  readonly ok: true;
  readonly proposal: Proposal;
  readonly summary: ReviseSummary;
};

function finish(
  project: Project,
  proposal: Proposal,
  args: ReviseArgs,
  plan: Plan,
): Revised {
  const nextId = idCounter(proposal);
  const created = new Map(plan.fresh.map((n) => [n, { ...n, id: nextId() }]));
  const changes = assemble(plan.net, plan.verdicts, created);
  const changedIds = new Set(plan.swapped.map((v) => v.old.id));
  const retiredIds = new Set(plan.retired.map((c) => c.id));
  const decisions = Object.fromEntries(
    Object.entries(proposal.decisions).filter(
      ([id]) => !changedIds.has(id) && !retiredIds.has(id),
    ),
  );
  const added = plan.fresh.map((n) => (created.get(n) as Change).id);
  const revision = buildRevision(
    proposal,
    project,
    args,
    plan.swapped,
    added,
    plan.retired,
  );
  return {
    ok: true,
    proposal: {
      ...proposal,
      formatVersion: proposalFormatVersionFor(
        changes,
        PROPOSAL_REVISED_FORMAT_VERSION,
        proposal.formatVersion,
      ),
      changes,
      decisions,
      notes: liftNotes(proposal.notes, retiredIds),
      revisions: [...(proposal.revisions ?? []), revision],
    },
    summary: {
      changed: plan.swapped.map((v) => v.old.id),
      added,
      dropped: plan.retired.map((c) => c.id),
    },
  };
}
