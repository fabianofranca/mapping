import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  addAnnotation,
  addContainer,
  canRemoveProposal,
  changeImageFile,
  changeLayerId,
  changeTarget,
  changeType,
  dominantChangeType,
  filterChanges,
  hasActiveFilters,
  leftBehind,
  levelType,
  moveContainer,
  needsExitReminder,
  proposalListStatus,
  removeAnnotation,
  removeMarking,
  renameMarking,
  replaceContainer,
  reviewKey,
  reviewProgress,
  reviewTree,
  setMarkingRect,
  stepChange,
  undecidedChanges,
  type Project,
  type Proposal,
  type ReviewTarget,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { AT, changeOf, decided, propose } from './proposalFixtures';

function scenario() {
  const base = sampleProject();
  let after = renameMarking(base, 'M1', 'Front door');
  after = setMarkingRect(after, 'M4', { x: 10, y: 10, width: 100, height: 100 });
  after = addAnnotation(after, {
    id: 'A9',
    markingId: 'M4',
    layerId: 'L1',
    name: 'New',
  });
  after = removeAnnotation(after, 'A4');
  after = moveContainer(after, 'I2', 5000, 5000);
  after = addContainer(after, {
    id: 'I3',
    file: 'images/new.webp',
    width: 800,
    height: 600,
  });
  return { base, proposal: propose(base, after) };
}

describe('type and target of the changes', () => {
  it('classifies created, removed, moved, changed and replaced image', () => {
    const { base, proposal } = scenario();
    expect(changeType(changeOf(proposal, 'annotation', 'A9'))).toBe('created');
    expect(changeType(changeOf(proposal, 'annotation', 'A4'))).toBe('removed');
    expect(changeType(changeOf(proposal, 'marking', 'M4', 'rect'))).toBe('moved');
    expect(changeType(changeOf(proposal, 'image', 'I2', 'placement'))).toBe('moved');
    expect(changeType(changeOf(proposal, 'marking', 'M1', 'name'))).toBe('changed');

    const replaced = propose(
      base,
      replaceContainer(base, 'I2', {
        file: 'images/other.jpg',
        width: 1000,
        height: 1000,
      }),
    );
    expect(changeType(changeOf(replaced, 'image', 'I2', 'file'))).toBe('replaced');
    expect(changeImageFile(changeOf(replaced, 'image', 'I2', 'file'))).toBe(
      'images/other.jpg',
    );
    expect(changeImageFile(changeOf(proposal, 'image', 'I3'))).toBe('images/new.webp');
    expect(changeImageFile(changeOf(proposal, 'marking', 'M1', 'name'))).toBeNull();
  });

  it('the dominant type: created > removed > replaced image > changed; moved only alone', () => {
    expect(dominantChangeType(['moved', 'changed'])).toBe('changed');
    expect(dominantChangeType(['moved'])).toBe('moved');
    expect(dominantChangeType(['moved', 'changed', 'removed'])).toBe('removed');
    expect(dominantChangeType(['changed', 'replaced'])).toBe('replaced');
    expect(dominantChangeType(['removed', 'created', 'changed'])).toBe('created');
    expect(dominantChangeType([])).toBeNull();
  });

  it('the target is the item, the image or the Project group, and the key joins level and id', () => {
    const { proposal } = scenario();
    expect(changeTarget(changeOf(proposal, 'marking', 'M1', 'name'))).toEqual({
      level: 'item',
      id: 'M1',
    });
    expect(changeTarget(changeOf(proposal, 'image', 'I2', 'placement'))).toEqual({
      level: 'image',
      id: 'I2',
    });
    expect(reviewKey({ level: 'item', id: 'M1' })).toBe('item:M1');
    expect(reviewKey({ level: 'project', id: null })).toBe('project:');
  });

  it("a change's layer comes from the annotation (new, current or removed)", () => {
    const { base, proposal } = scenario();
    expect(changeLayerId(changeOf(proposal, 'annotation', 'A9'), base)).toBe('L1');
    expect(changeLayerId(changeOf(proposal, 'annotation', 'A4'), base)).toBe('L2');
    expect(changeLayerId(changeOf(proposal, 'marking', 'M1', 'name'), base)).toBeNull();
  });
});

describe('filters', () => {
  const noConflicts = new Set<string>();

  it('only revised keeps the changes of the revised set', () => {
    const { base, proposal } = scenario();
    const first = proposal.changes[0]?.id ?? '';
    expect(hasActiveFilters({ ...NO_FILTERS, onlyRevised: true })).toBe(true);
    expect(NO_FILTERS.onlyRevised).toBe(false);
    const got = filterChanges(
      proposal,
      base,
      { ...NO_FILTERS, onlyRevised: true },
      noConflicts,
      new Set([first]),
    );
    expect(got.map((c) => c.id)).toEqual([first]);
  });

  it('without filters returns all, in proposal order', () => {
    const { base, proposal } = scenario();
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(filterChanges(proposal, base, NO_FILTERS, noConflicts)).toEqual(
      proposal.changes,
    );
  });

  it('filters by type, image, layer, decision and conflicts only', () => {
    const { base, proposal } = scenario();
    const ids = (filters: Partial<typeof NO_FILTERS>, conflicts = noConflicts) =>
      filterChanges(proposal, base, { ...NO_FILTERS, ...filters }, conflicts).map(
        (c) => c.id,
      );
    const created = changeOf(proposal, 'annotation', 'A9').id;
    const removed = changeOf(proposal, 'annotation', 'A4').id;
    const moved = changeOf(proposal, 'marking', 'M4', 'rect').id;

    expect(ids({ types: ['created'] })).toContain(created);
    expect(ids({ types: ['created'] })).not.toContain(removed);
    expect(ids({ types: ['removed', 'moved'] })).toEqual(
      expect.arrayContaining([removed, moved]),
    );
    expect(
      filterChanges(proposal, base, { ...NO_FILTERS, imageId: 'I2' }, noConflicts).every(
        (c) => c.imageId === 'I2',
      ),
    ).toBe(true);
    expect(ids({ layerId: 'L2' })).toEqual([removed]);
    expect(ids({ onlyConflicts: true }, new Set([moved]))).toEqual([moved]);

    const half = decided(proposal, base, { level: 'change', id: created }, 'accepted');
    expect(
      filterChanges(half, base, { ...NO_FILTERS, decision: 'accepted' }, noConflicts).map(
        (c) => c.id,
      ),
    ).toContain(created);
    expect(
      filterChanges(
        half,
        base,
        { ...NO_FILTERS, decision: 'undecided' },
        noConflicts,
      ).map((c) => c.id),
    ).not.toContain(created);
    expect(
      filterChanges(half, base, { ...NO_FILTERS, decision: 'rejected' }, noConflicts),
    ).toEqual([]);
  });
});

describe('pending items, what was left behind and navigation', () => {
  it('lists what was left undecided, accepted without applying, and rejected', () => {
    const { base, proposal } = scenario();
    const accepted = changeOf(proposal, 'marking', 'M1', 'name').id;
    const rejected = changeOf(proposal, 'marking', 'M4', 'rect').id;
    let p = decided(
      proposal,
      base as Project,
      { level: 'change', id: accepted },
      'accepted',
    );
    p = decided(p, base, { level: 'change', id: rejected }, 'rejected');
    const behind = leftBehind(p);
    expect(behind.acceptedPending).toEqual([accepted]);
    expect(behind.rejected).toEqual([rejected]);
    expect(behind.undecided).toEqual(undecidedChanges(p));
    expect(behind.undecided).not.toContain(accepted);
    expect(behind.undecided.length + 2).toBe(p.changes.length);
  });

  it('the next and the previous change wrap around', () => {
    const order = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    const ids = ['b', 'd'];
    expect(stepChange(ids, order, null, 1)).toBe('b');
    expect(stepChange(ids, order, null, -1)).toBe('d');
    expect(stepChange(ids, order, 'b', 1)).toBe('d');
    expect(stepChange(ids, order, 'd', 1)).toBe('b');
    expect(stepChange(ids, order, 'b', -1)).toBe('d');
    expect(stepChange(ids, order, 'c', 1)).toBe('d');
    expect(stepChange(ids, order, 'c', -1)).toBe('b');
    expect(stepChange([], order, 'a', 1)).toBeNull();
  });
});

// Phase 8.2 (P10): the review business rule that lived in the store and the interface.
describe('level type, list status and exit reminder (phase 8.2)', () => {
  const changesOf = (p: Proposal, project: Project, target: ReviewTarget) => {
    const ids = new Set(reviewTree(p, project).changeIdsOf(target));
    return p.changes.filter((c) => ids.has(c.id));
  };

  it('levelType: item and image by the type of the entity itself; "moved" only alone; internal change = changed; proposal and project by the dominant one', () => {
    const { base, proposal } = scenario();
    const of = (target: ReviewTarget) =>
      levelType(target.level, target.id, changesOf(proposal, base, target));
    // M1: only the name changes.
    expect(of({ level: 'item', id: 'M1' })).toBe('changed');
    // M4: the position changes, but one annotation enters and another leaves → changed, not moved.
    expect(of({ level: 'item', id: 'M4' })).toBe('changed');
    // I2: the image moves, but one of its items changes → changed.
    expect(of({ level: 'image', id: 'I2' })).toBe('changed');
    expect(of({ level: 'image', id: 'I3' })).toBe('created');
    expect(of({ level: 'proposal', id: null })).toBe('created');
    expect(levelType('project', null, [])).toBeNull();

    // Only the position changes: moved (item and image).
    const onlyMoved = propose(
      base,
      moveContainer(
        setMarkingRect(base, 'M4', { x: 1, y: 1, width: 10, height: 10 }),
        'I1',
        9,
        9,
      ),
    );
    expect(
      levelType('item', 'M4', changesOf(onlyMoved, base, { level: 'item', id: 'M4' })),
    ).toBe('moved');
    expect(
      levelType('image', 'I1', changesOf(onlyMoved, base, { level: 'image', id: 'I1' })),
    ).toBe('moved');
    // Removed and replaced image beat changed.
    const removed = propose(base, removeMarking(base, 'M2'));
    expect(
      levelType('item', 'M2', changesOf(removed, base, { level: 'item', id: 'M2' })),
    ).toBe('removed');
    const swapped = propose(
      base,
      renameMarking(
        replaceContainer(base, 'I1', {
          file: 'images/other.webp',
          width: 4000,
          height: 3000,
        }),
        'M1',
        'X',
      ),
    );
    expect(
      levelType('image', 'I1', changesOf(swapped, base, { level: 'image', id: 'I1' })),
    ).toBe('replaced');
  });

  it('proposalListStatus: New and a primary Review only when fresh; In review after deciding or noting; closed ones are only viewed', () => {
    const { base, proposal } = scenario();
    const progress = reviewProgress(proposal);
    expect(proposalListStatus(proposal, progress, true)).toEqual({
      flag: 'new',
      action: 'review',
      primary: true,
    });
    // Open, already seen, with no decision or note: no badge, plain Review.
    expect(proposalListStatus(proposal, progress, false)).toEqual({
      flag: null,
      action: 'review',
      primary: false,
    });
    const started = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    expect(proposalListStatus(started, reviewProgress(started), false)).toEqual({
      flag: 'inReview',
      action: 'continue',
      primary: false,
    });
    const noted: Proposal = {
      ...proposal,
      notes: [{ id: 'n1', target: { level: 'proposal', id: null }, text: 'x', at: AT }],
    };
    expect(proposalListStatus(noted, progress, false).flag).toBe('inReview');
    for (const [status, flag] of [
      ['superseded', 'superseded'],
      ['applied', 'applied'],
      ['withdrawn', 'withdrawn'],
    ] as const) {
      // The derived state never marks a closed one as `fresh`; the rule does not depend on it.
      expect(proposalListStatus({ ...proposal, status }, progress, true)).toEqual({
        flag,
        action: 'view',
        primary: false,
      });
    }
  });

  it('needsExitReminder: only with accepted changes awaiting application in an applicable proposal', () => {
    expect(needsExitReminder('open', 0)).toBe(false);
    expect(needsExitReminder('open', 3)).toBe(true);
    expect(needsExitReminder('superseded', 1)).toBe(true);
    expect(needsExitReminder('applied', 2)).toBe(false);
    expect(needsExitReminder('withdrawn', 2)).toBe(false);
    expect(needsExitReminder(undefined, 2)).toBe(false);
  });
});

describe('canRemoveProposal (phase 9.2)', () => {
  it('only withdrawn, superseded and applied can be deleted; open cannot', () => {
    const { proposal } = scenario();
    expect(canRemoveProposal({ ...proposal, status: 'open' })).toBe(false);
    expect(canRemoveProposal({ ...proposal, status: 'withdrawn' })).toBe(true);
    expect(canRemoveProposal({ ...proposal, status: 'superseded' })).toBe(true);
    expect(canRemoveProposal({ ...proposal, status: 'applied' })).toBe(true);
  });
});
