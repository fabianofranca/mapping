import { describe, expect, it } from 'vitest';
import {
  moveMarking,
  setMarkingFloating,
  settleHierarchy,
  type Marking,
  type Project,
} from '../../src/model';
import { knownPositions } from '../../src/model/settlePositions';
import { emptyProject } from './fixtures';

// Decision 12 of #1971: a move or resize inside one space keeps the space's entry of the position
// table (the box is copied on write), so the next operation does not rescan the markings array;
// the entry of the previous array stays intact, so undo and redo branches keep their own.

function mk(id: string, x: number, size: number, containerId: string): Marking {
  return {
    id,
    containerId,
    parentId: null,
    pageId: null,
    name: null,
    rect: { x, y: x, width: size, height: size },
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
  };
}

function container(id: string): Project['containers'][number] {
  return {
    id,
    name: null,
    file: null,
    width: 1000,
    height: 1000,
    placement: { x: id === 'A' ? 0 : 2000, y: 0, scale: 1 },
    parentId: null,
    pageId: 'PG1',
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function settledProject(): Project {
  const base = emptyProject();
  return settleHierarchy({
    ...base,
    containers: [container('A'), container('B')],
    markings: [
      mk('outer', 10, 300, 'A'),
      mk('inner', 50, 50, 'A'),
      mk('far', 600, 100, 'A'),
      mk('other', 20, 40, 'B'),
    ],
  });
}

/** One move, so the position table of the result exists (the first operation fills it by scanning). */
function warm(): Project {
  const warmed = moveMarking(settledProject(), 'far', 1, 0);
  expect(knownPositions(warmed.markings)?.has('A')).toBe(true);
  return warmed;
}

function boxAt(project: Project, space: string, id: string): number[] {
  const entry = knownPositions(project.markings)?.get(space);
  const slot = entry?.positions
    .slice(0, entry.count)
    .indexOf(project.markings.findIndex((m) => m.id === id));
  if (!entry || slot === undefined || slot < 0) return [];
  return [...entry.boxes.subarray(slot * 4, slot * 4 + 4)];
}

describe('advancePositions: a move inside a space keeps the entry', () => {
  it('keeps the entry of the space with the new box after a move', () => {
    const before = warm();
    const after = moveMarking(before, 'far', 20, 5);
    const entry = knownPositions(after.markings)?.get('A');
    expect(entry).toBeDefined();
    expect(entry?.count).toBe(3);
    expect(boxAt(after, 'A', 'far')).toEqual([621, 605, 721, 705]);
    // The other markings keep their boxes.
    expect(boxAt(after, 'A', 'outer')).toEqual([10, 10, 310, 310]);
  });

  it("leaves the previous array's entry intact", () => {
    const before = warm();
    const entryBefore = knownPositions(before.markings)?.get('A');
    const boxesBefore = [...(entryBefore?.boxes ?? [])];
    const moved = moveMarking(before, 'far', 20, 5);
    expect(knownPositions(before.markings)?.get('A')).toBe(entryBefore);
    expect([...(entryBefore?.boxes ?? [])]).toEqual(boxesBefore);
    expect(boxAt(before, 'A', 'far')).toEqual([601, 600, 701, 700]);
    // A second branch from the same `before` (undo then another move) has its own box.
    const branch = moveMarking(before, 'far', -30, 0);
    expect(boxAt(branch, 'A', 'far')).toEqual([571, 600, 671, 700]);
    expect(boxAt(moved, 'A', 'far')).toEqual([621, 605, 721, 705]);
  });

  it('keeps the entries of the other spaces', () => {
    const before = warm();
    const entryB = knownPositions(before.markings)?.get('B');
    const after = moveMarking(before, 'far', 20, 5);
    expect(knownPositions(after.markings)?.get('B')).toBe(entryB);
  });

  it('keeps the entry through a sequence of moves', () => {
    let current = warm();
    for (let k = 0; k < 5; k++) {
      current = moveMarking(current, 'far', 3, 0);
      expect(knownPositions(current.markings)?.has('A')).toBe(true);
    }
    expect(boxAt(current, 'A', 'far')).toEqual([616, 600, 716, 700]);
  });

  it("keeps today's behavior when the marking leaves the space (floating)", () => {
    const before = warm();
    const after = setMarkingFloating(before, 'far', true);
    // The entry of the space is dropped (unknown again), not updated.
    expect(knownPositions(after.markings)?.has('A') ?? false).toBe(false);
  });
});
