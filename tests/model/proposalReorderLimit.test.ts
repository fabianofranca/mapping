import { describe, expect, it } from 'vitest';
import {
  addContainer,
  computeChanges,
  createMarking,
  patchProject,
  reorderMarking,
  wrapItems,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Reordering in the batch together with a rectangle tie (stage #549, item 1 and decision 3): the
// anchor of the created one respects the tiebreak, so applying the changes gives the same parents as the
// proposed project, with or without `move_marking` in the batch. Before the fix, the anchor came from the final array
// of the proposed project, already reordered, and the applied result inverted the tie (M2 at the root and W a child of M2).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Container C 100×100 with M1 and M4 inside M2, which fills it (created in the order M1, M2, M4). */
function base(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 100,
    height: 100,
  });
  p = createMarking(p, { id: 'M1', containerId: 'C', rect: rect(0, 0, 50, 50) });
  p = createMarking(p, { id: 'M2', containerId: 'C', rect: rect(0, 0, 100, 100) });
  p = createMarking(p, { id: 'M4', containerId: 'C', rect: rect(50, 0, 50, 50) });
  return p;
}

const wrap = (p: Project) =>
  wrapItems(
    p,
    {
      id: 'W',
      items: ['M1', 'M2'].map((id) => ({ kind: 'marking' as const, id })),
    },
    { settle: true },
  );

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));

describe('proposal v4: rectangle tie with reordering (#549)', () => {
  it('control: without reordering the tie applies the hierarchy of the plan', () => {
    const start = base();
    expect(parents(start)).toMatchObject({ M1: 'M2', M2: null, M4: 'M2' });
    const after = wrap(start);
    // The plan: W (same rectangle as M2) at the root, M2 a child of W.
    expect(parents(after)).toMatchObject({ W: null, M2: 'W' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });

  it('with move_marking in the same batch, the applied result has the parents of the plan', () => {
    const start = base();
    const after = reorderMarking(wrap(start), 'M1', 1);
    expect(parents(after)).toMatchObject({ W: null, M2: 'W' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });

  it('two wrappers of the same item and a move_marking of another to 0', () => {
    const start = base();
    let after = wrap(start);
    after = wrapItems(
      after,
      { id: 'W2', items: [{ kind: 'marking', id: 'M2' }] },
      { settle: true },
    );
    after = reorderMarking(after, 'M4', 0);
    // Three equal rectangles (W, W2 and M2), from outside to inside.
    expect(parents(after)).toMatchObject({ W: null, W2: 'W', M2: 'W2' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });
});
