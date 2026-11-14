import { describe, expect, it } from 'vitest';
import {
  droppedNoteOrigin,
  latestRevisionSummary,
  revisionMark,
  revisionMarks,
  renameMarking,
  visibleRevisedChanges,
  PROPOSAL_REVISED_FORMAT_VERSION,
  type Change,
  type Proposal,
  type ProposalRevision,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, LATER, propose } from './proposalFixtures';

// Reading of the "Revised" mark (stage #644, decision 5): the newest revision that cites the change.

const T1 = '2026-11-07T10:00:00.000Z';
const T2 = '2026-11-07T11:00:00.000Z';

function revision(over: Partial<ProposalRevision>): ProposalRevision {
  return {
    at: T1,
    baseRevision: 1,
    operations: [],
    changed: {},
    added: [],
    dropped: [],
    ...over,
  };
}

/** Proposal with changes c1 and c2 (renames M3 and M4) and the given revisions. */
function revised(revisions: readonly ProposalRevision[] | undefined): Proposal {
  const base = sampleProject();
  const p = propose(base, renameMarking(renameMarking(base, 'M3', 'A'), 'M4', 'B'));
  expect(p.changes.map((c) => c.id)).toEqual(['c1', 'c2']);
  return revisions === undefined
    ? p
    : { ...p, formatVersion: PROPOSAL_REVISED_FORMAT_VERSION, revisions };
}

function droppedChange(): Change {
  const base = revised(undefined);
  return { ...(base.changes[0] as Change), id: 'c7' };
}

describe('revisionMark', () => {
  it('without revisions there is no mark', () => {
    const p = revised(undefined);
    expect(revisionMark(p, 'c1')).toBeNull();
    expect(revisionMarks(p).size).toBe(0);
    expect(visibleRevisedChanges(p)).toEqual([]);
    expect(latestRevisionSummary(p)).toBeNull();
    expect(droppedNoteOrigin(p, 'n1')).toBeNull();
  });

  it('replaced change: the mark carries the previous to and decision', () => {
    const p = revised([
      revision({ changed: { c1: { to: 'Before', state: 'rejected' } } }),
    ]);
    expect(revisionMark(p, 'c1')).toEqual({
      kind: 'changed',
      at: T1,
      previous: { to: 'Before', state: 'rejected' },
    });
    expect(revisionMark(p, 'c2')).toBeNull();
  });

  it('new change: the mark is added, without previous', () => {
    const p = revised([revision({ added: ['c2'] })]);
    expect(revisionMark(p, 'c2')).toEqual({ kind: 'added', at: T1 });
  });

  it('replaced in two revisions: the newest wins', () => {
    const p = revised([
      revision({ changed: { c1: { to: 'First', state: null } } }),
      revision({ at: T2, changed: { c1: { to: 'Second', state: null } } }),
    ]);
    expect(revisionMark(p, 'c1')).toEqual({
      kind: 'changed',
      at: T2,
      previous: { to: 'Second', state: null },
    });
  });

  it('new in one revision and replaced later: the replacement wins (the newest)', () => {
    const p = revised([
      revision({ added: ['c2'] }),
      revision({ at: T2, changed: { c2: { to: 'x', state: null } } }),
    ]);
    expect(revisionMark(p, 'c2')?.kind).toBe('changed');
    expect(revisionMark(p, 'c2')?.at).toBe(T2);
  });

  it('a change that is no longer in changes has no mark', () => {
    const p = revised([
      revision({ added: ['c40'], changed: { c41: { to: 1, state: null } } }),
    ]);
    expect(revisionMark(p, 'c40')).toBeNull();
    expect(revisionMark(p, 'c41')).toBeNull();
    expect(revisionMarks(p).size).toBe(0);
  });

  it('revisionMarks gathers all the marks and is memoized by the revisions', () => {
    const p = revised([
      revision({ added: ['c2'], changed: { c1: { to: 'a', state: null } } }),
    ]);
    const marks = revisionMarks(p);
    expect([...marks.keys()].sort()).toEqual(['c1', 'c2']);
    expect(revisionMarks({ ...p, decisions: {} })).toBe(marks);
  });
});

describe('visibleRevisedChanges', () => {
  const revisions = [
    revision({ added: ['c2'], changed: { c1: { to: 'a', state: null } } }),
  ];

  it('lists, in changes order, the marked ones without a decision', () => {
    expect(visibleRevisedChanges(revised(revisions))).toEqual(['c1', 'c2']);
  });

  it('deciding removes from the list and clearing the decision brings it back', () => {
    const p = revised(revisions);
    const decided: Proposal = {
      ...p,
      decisions: {
        c1: { state: 'accepted', at: AT },
        c2: { state: 'rejected', at: LATER },
      },
    };
    expect(visibleRevisedChanges(decided)).toEqual([]);
    const cleared: Proposal = {
      ...p,
      decisions: { c2: { state: 'rejected', at: LATER } },
    };
    expect(visibleRevisedChanges(cleared)).toEqual(['c1']);
    expect(visibleRevisedChanges({ ...p, decisions: {} })).toEqual(['c1', 'c2']);
  });
});

describe('latestRevisionSummary', () => {
  it('counts changed, added and dropped of the newest revision', () => {
    const p = revised([
      revision({ added: ['c1', 'c2'] }),
      revision({
        at: T2,
        changed: { c1: { to: 'a', state: null }, c2: { to: 'b', state: 'rejected' } },
        added: ['c9'],
        dropped: [{ change: droppedChange(), state: null, notes: [] }],
      }),
    ]);
    expect(latestRevisionSummary(p)).toEqual({
      at: T2,
      changed: 2,
      added: 1,
      dropped: 1,
    });
  });
});

describe('droppedNoteOrigin', () => {
  it('returns the dropped change the note came from', () => {
    const change = droppedChange();
    const p = revised([
      revision({ dropped: [{ change, state: null, notes: ['n2', 'n3'] }] }),
      revision({ at: T2 }),
    ]);
    expect(droppedNoteOrigin(p, 'n3')).toEqual(change);
    expect(droppedNoteOrigin(p, 'n9')).toBeNull();
  });
});
