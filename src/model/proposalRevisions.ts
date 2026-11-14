import type { Change, Proposal, ProposalRevision, RevisedPriorState } from './proposal';
import type { JsonValue } from './types';

// Reading the "Revised" mark (stage #644, decision 5): pure functions over `Proposal.revisions`
// for the interface and the MCP. A change's mark is the newest revision that cites it.

export interface RevisionMark {
  /** `changed`: the agent replaced the change; `added`: it came in with a revision. */
  readonly kind: 'changed' | 'added';
  readonly at: string;
  /** Only in `changed`: the `to` and the decision from before that revision. */
  readonly previous?: { readonly to: JsonValue; readonly state: RevisedPriorState };
}

const EMPTY: ReadonlyMap<string, RevisionMark> = new Map();

interface Cached {
  readonly changes: readonly Change[];
  readonly marks: ReadonlyMap<string, RevisionMark>;
}

const cache = new WeakMap<readonly ProposalRevision[], Cached>();

/** Mark of each cited id, the newest revision wins (revisions come oldest first). */
function collectMarks(
  revisions: readonly ProposalRevision[],
  changes: readonly Change[],
): ReadonlyMap<string, RevisionMark> {
  const marks = new Map<string, RevisionMark>();
  for (const r of revisions) {
    for (const [id, prior] of Object.entries(r.changed)) {
      marks.set(id, {
        kind: 'changed',
        at: r.at,
        previous: { to: prior.to, state: prior.state },
      });
    }
    for (const id of r.added) marks.set(id, { kind: 'added', at: r.at });
  }
  const present = new Set(changes.map((c) => c.id));
  for (const id of [...marks.keys()]) {
    if (!present.has(id)) marks.delete(id);
  }
  return marks;
}

/** Marks of all the changes still in the proposal (memoized by the revisions). */
export function revisionMarks(p: Proposal): ReadonlyMap<string, RevisionMark> {
  const revisions = p.revisions;
  if (revisions === undefined || revisions.length === 0) return EMPTY;
  const cached = cache.get(revisions);
  if (cached && cached.changes === p.changes) return cached.marks;
  const marks = collectMarks(revisions, p.changes);
  cache.set(revisions, { changes: p.changes, marks });
  return marks;
}

/** The change's mark, or `null` if no revision cites it or it is no longer in `changes`. */
export function revisionMark(p: Proposal, changeId: string): RevisionMark | null {
  return revisionMarks(p).get(changeId) ?? null;
}

/**
 * Ids (in `changes` order) with a mark and no decision: the "Revised" mark only shows without a
 * decision; deciding removes it from the screen and clearing the decision brings it back.
 */
export function visibleRevisedChanges(p: Proposal): string[] {
  const marks = revisionMarks(p);
  if (marks.size === 0) return [];
  return p.changes
    .filter((c) => marks.has(c.id) && p.decisions[c.id] === undefined)
    .map((c) => c.id);
}

/** Summary of the newest revision (how many changes it replaced, added and dropped), or `null`. */
export function latestRevisionSummary(
  p: Proposal,
): { at: string; changed: number; added: number; dropped: number } | null {
  const latest = p.revisions?.[p.revisions.length - 1];
  if (latest === undefined) return null;
  return {
    at: latest.at,
    changed: Object.keys(latest.changed).length,
    added: latest.added.length,
    dropped: latest.dropped.length,
  };
}

/** The dropped change the note (which moved up to the proposal level) came from, or `null`. */
export function droppedNoteOrigin(p: Proposal, noteId: string): Change | null {
  for (const r of p.revisions ?? []) {
    const found = r.dropped.find((d) => d.notes.includes(noteId));
    if (found) return found.change;
  }
  return null;
}

/**
 * Ids of the changes that a revision the person has not seen yet replaced or added: the
 * revisions of `current` beyond those `seen` already had. Basis of the decision guard in the app
 * (stage #644, decision 8): deciding one of them is refused until the session adopts the new version.
 */
export function unseenRevisedIds(seen: Proposal, current: Proposal): ReadonlySet<string> {
  const known = seen.revisions?.length ?? 0;
  const fresh = (current.revisions ?? []).slice(known);
  if (fresh.length === 0) return new Set();
  const present = new Set(current.changes.map((c) => c.id));
  const ids = new Set<string>();
  for (const r of fresh) {
    for (const id of [...Object.keys(r.changed), ...r.added]) {
      if (present.has(id)) ids.add(id);
    }
  }
  return ids;
}

/**
 * The revision and dropped change that the note of a change that no longer exists came from (it
 * moves up to the proposal level), or `null` if the change was never dropped.
 */
export function droppedEntryOf(
  p: Proposal,
  changeId: string,
): { revisionIndex: number; droppedIndex: number } | null {
  const revisions = p.revisions ?? [];
  for (let revisionIndex = revisions.length - 1; revisionIndex >= 0; revisionIndex--) {
    const droppedIndex =
      revisions[revisionIndex]?.dropped.findIndex((d) => d.change.id === changeId) ?? -1;
    if (droppedIndex >= 0) return { revisionIndex, droppedIndex };
  }
  return null;
}

/** Adds the note id to the dropped change's notes (the origin of "From the dropped change"). */

export function withDroppedNote(
  p: Proposal,
  where: { revisionIndex: number; droppedIndex: number },
  noteId: string,
): Proposal {
  const revisions = (p.revisions ?? []).map((r, i) =>
    i !== where.revisionIndex
      ? r
      : {
          ...r,
          dropped: r.dropped.map((d, j) =>
            j === where.droppedIndex ? { ...d, notes: [...d.notes, noteId] } : d,
          ),
        },
  );
  return { ...p, revisions };
}
