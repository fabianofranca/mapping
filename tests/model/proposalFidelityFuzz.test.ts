import { describe, expect, it } from 'vitest';
import {
  computeChanges,
  patchProject,
  reorderMarking,
  removeMarking,
  setMarkingRect,
  settleHierarchy,
  siblingPosition,
  wrapItems,
  type Change,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import {
  CONTAINER,
  create,
  gridRect,
  int,
  pick,
  rng,
  same,
  tryOp,
  unexpressible,
  type Rand,
} from './proposalFuzzSupport';

// Proposal fidelity fuzz (stage #549, decision 6): over a random base, a batch of
// operations (create, wrap, reorder, move or resize, and remove) with rectangles from a
// small grid, to force rectangle and area ties. `computeChanges` followed by
// `patchProject` must give the same parents (markings and containers) and the same order among siblings
// as the proposed project, without `problems`, and no `position` may be redundant (removing any
// one changes the applied result). The exception is the batch where no anchor would give the proposed parents (a
// tie decided by a step of the batch that the proposal does not record; "Guarantee" in
// docs/PROPOSAL-FORMAT.md): the test proves this by brute force and pins the batches. Fixed seed: the
// same result on every run. Known limit: issue #625.

const BATCHES = 2000;
const SEED = 549;

function randomOp(p: Project, r: Rand, nextId: () => string): Project {
  const kind = int(r, 5);
  if (kind === 0 || p.markings.length === 0) return create(p, r, nextId());
  const m = pick(r, p.markings);
  if (kind === 1) {
    const items = [m, ...p.markings.filter(() => r() < 0.3)];
    const refs = [...new Set(items.map((x) => x.id))].map((id) => ({
      kind: 'marking' as const,
      id,
    }));
    return tryOp(p, () => wrapItems(p, { id: nextId(), items: refs }, { settle: true }));
  }
  if (kind === 2) {
    const { count } = siblingPosition(p, m.id);
    return tryOp(p, () => reorderMarking(p, m.id, int(r, count)));
  }
  if (kind === 3) {
    return tryOp(p, () => setMarkingRect(p, m.id, gridRect(r, m.containerId !== null)));
  }
  return tryOp(p, () => removeMarking(p, m.id));
}

interface Case {
  readonly batch: number;
  readonly base: Project;
  readonly after: Project;
  readonly changes: readonly Change[];
}

function cases(): Case[] {
  const r = rng(SEED);
  const out: Case[] = [];
  for (let batch = 0; batch < BATCHES; batch++) {
    let n = 0;
    const nextId = () => `N${n++}`;
    let base: Project = { ...emptyProject(), containers: [CONTAINER] };
    const size = 3 + int(r, 5);
    for (let i = 0; i < size; i++) base = create(base, r, nextId());
    let after = base;
    const ops = 1 + int(r, 5);
    for (let i = 0; i < ops; i++) after = randomOp(after, r, nextId);
    out.push({ batch, base, after, changes: computeChanges(base, after) });
  }
  return out;
}

const isPosition = (c: Change) => c.entity === 'marking' && c.field === 'position';

/** Does some `position` go away without changing the applied result (would it be redundant)? */
function hasRedundantPosition({ base, after, changes }: Case): boolean {
  return changes.filter(isPosition).some((c) =>
    same(
      patchProject(
        base,
        changes.filter((x) => x !== c),
      ).project,
      after,
    ),
  );
}

describe('proposal: the applied result equals the proposed (fuzz, #549)', () => {
  it(`${BATCHES} batches: same parents and same order among siblings, no redundant position`, () => {
    const unstable: number[] = [];
    const divergent: number[] = [];
    const redundant: number[] = [];
    // The Guarantee exception: they diverge, and no anchor would give the proposed parents.
    const exception: number[] = [];
    for (const c of cases()) {
      if (settleHierarchy(c.after) !== c.after) unstable.push(c.batch);
      const applied = patchProject(c.base, c.changes);
      if (applied.problems.length > 0) divergent.push(c.batch);
      else if (!same(applied.project, c.after)) {
        if (unexpressible(c)) exception.push(c.batch);
        else divergent.push(c.batch);
      } else if (hasRedundantPosition(c)) redundant.push(c.batch);
    }
    expect({ unstable, divergent, redundant }).toEqual({
      unstable: [],
      divergent: [],
      redundant: [],
    });
    // Before the fix (seed 549): 6 divergent batches and 6 with a redundant position.
    // The two of the exception remain (about 1 batch in 1,000).
    expect(exception).toEqual([182, 300]);
  });
});
