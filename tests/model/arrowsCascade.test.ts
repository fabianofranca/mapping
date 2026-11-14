import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  canDeleteItems,
  containerDeletionImpact,
  itemsDeletionImpact,
  markingDeletionImpact,
  moveItems,
  moveMarking,
  movingItems,
  removeContainer,
  removeItems,
  removeMarking,
  replaceContainer,
  setArrowLocked,
  setArrowRoute,
  setItemsLocked,
  setMarkingFloating,
  setMarkingLocked,
  validateProject,
  type ItemRef,
  type Project,
} from '../../src/model';
import { arrowProject, withArrow } from './arrowFixtures';
import { expectValid } from './fixtures';

// The arrows cascade: deleting a marking, a container or a selection takes the attached arrows and their
// annotations, and the count enters the impact. Fixture: tests/model/arrowFixtures.ts.

const mark = (id: string): ItemRef => ({ kind: 'marking', id });
const img = (id: string): ItemRef => ({ kind: 'image', id });
const arr = (id: string): ItemRef => ({ kind: 'arrow', id });
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);

/**
 * `arrowProject` (r1: a1 → a3, with ra1 and ra2) plus r2: b1 → a1 (arrives at a1), r3: a2 → b1 (leaves
 * a descendant of a1) and r4: c1 → b1 (far from A), one annotation on each arrow other than r1 and one
 * on a1.
 */
function cascadeProject(): Project {
  let p = arrowProject();
  p = withArrow(p, 'r2', 'b1', 'a1');
  p = withArrow(p, 'r3', 'a2', 'b1');
  p = withArrow(p, 'r4', 'c1', 'b1');
  p = addAnnotation(p, { id: 'rb', markingId: 'r2', layerId: 'L1' });
  p = addAnnotation(p, { id: 'rc', markingId: 'r4', layerId: 'L1' });
  return addAnnotation(p, { id: 'ma', markingId: 'a1', layerId: 'L1' });
}

describe('deleting a marking', () => {
  it('takes the arrows attached to the marking and its descendants, and the arrows annotations', () => {
    const p = cascadeProject();
    expect(markingDeletionImpact(p, 'a1')).toEqual({
      descendants: 1,
      lockedDescendants: 0,
      // ma (a1) + ra1, ra2 (r1) + rb (r2); r3 has no annotation.
      annotations: 4,
      containers: 0,
      arrows: 3,
      brokenRefs: 0,
    });
    const next = expectValid(removeMarking(p, 'a1'));
    expect(ids(next.arrows)).toEqual(['r4']);
    expect(ids(next.annotations)).toEqual(['rc']);
    expect(next.markings.some((m) => m.id === 'a2')).toBe(false);
  });

  it('the descendant also takes its own', () => {
    const p = cascadeProject();
    const next = expectValid(removeMarking(p, 'a2'));
    expect(ids(next.arrows)).toEqual(['r1', 'r2', 'r4']);
    expect(markingDeletionImpact(p, 'a2').arrows).toBe(1);
  });

  it('a marking without an arrow has zero impact and the arrows stay as they are', () => {
    const p = cascadeProject();
    expect(markingDeletionImpact(p, 'e1').arrows).toBe(0);
    expect(removeMarking(p, 'e1').arrows).toBe(p.arrows);
  });

  it('the arrow lock does not prevent deleting the marking; the marking lock does', () => {
    let p = cascadeProject();
    p = setArrowLocked(p, 'r1', true);
    expect(ids(removeMarking(p, 'a3').arrows)).toEqual(['r2', 'r3', 'r4']);
    p = setMarkingLocked(p, 'a3', true);
    expect(() => removeMarking(p, 'a3')).toThrow('locked');
  });

  it('an arrow that links two leaving markings counts once', () => {
    // r1 links a1 and a3; deleting a1 and a3 together (removeItems) does not count r1 twice.
    const p = cascadeProject();
    const impact = itemsDeletionImpact(p, [mark('a1'), mark('a3')]);
    expect(impact.arrows).toBe(3);
  });
});

describe('deleting a container', () => {
  it('takes the arrows of its markings, even those arriving from outside, and their annotations', () => {
    const p = cascadeProject();
    expect(containerDeletionImpact(p, 'A')).toEqual({
      markings: 3,
      lockedMarkings: 0,
      annotations: 4,
      arrows: 3,
      brokenRefs: 0,
    });
    const next = expectValid(removeContainer(p, 'A'));
    expect(ids(next.arrows)).toEqual(['r4']);
    expect(ids(next.annotations)).toEqual(['rc']);
  });

  it('a container without a marking with an arrow removes none', () => {
    const p = cascadeProject();
    expect(containerDeletionImpact(p, 'D').arrows).toBe(0);
    expect(removeContainer(p, 'D').arrows).toBe(p.arrows);
  });
});

describe('multiple selection with arrows', () => {
  it('deleting a selected arrow takes its annotations and nothing else', () => {
    const p = cascadeProject();
    expect(itemsDeletionImpact(p, [arr('r4')])).toEqual({
      markings: 0,
      containers: 0,
      arrows: 1,
      annotations: 1,
      lockedMarkings: 0,
      containersStay: 0,
      brokenRefs: 0,
    });
    const next = expectValid(removeItems(p, [arr('r4')]));
    expect(ids(next.arrows)).toEqual(['r1', 'r2', 'r3']);
    expect(ids(next.annotations)).toEqual(['ra1', 'ra2', 'rb', 'ma']);
    expect(next.markings).toEqual(p.markings);
  });

  it('selected arrow and its marking selected: counts once', () => {
    const p = cascadeProject();
    const impact = itemsDeletionImpact(p, [mark('a1'), arr('r1'), arr('r4')]);
    expect(impact).toMatchObject({ markings: 2, arrows: 4, annotations: 5 });
    const next = expectValid(removeItems(p, [mark('a1'), arr('r1'), arr('r4')]));
    expect(next.arrows).toEqual([]);
    expect(next.annotations).toEqual([]);
  });

  it('the container and the arrow arriving at it from outside leave together', () => {
    const p = cascadeProject();
    const next = expectValid(removeItems(p, [img('A')]));
    expect(ids(next.arrows)).toEqual(['r4']);
  });

  it('a selected locked arrow blocks; it leaves together with the selected endpoint without blocking', () => {
    const p = setArrowLocked(cascadeProject(), 'r4', true);
    expect(canDeleteItems(p, [arr('r4')])).toBe(false);
    expect(() => removeItems(p, [arr('r4')])).toThrow('locked');
    // Selected together with one of the endpoints, it leaves with the marking and the lock does not prevent it.
    expect(canDeleteItems(p, [arr('r4'), mark('c1')])).toBe(true);
    expect(ids(removeItems(p, [arr('r4'), mark('c1')]).arrows)).toEqual([
      'r1',
      'r2',
      'r3',
    ]);
    // A locked arrow that is only attached to a marking that leaves does not block either.
    expect(canDeleteItems(p, [mark('c1')])).toBe(true);
  });

  it('a nonexistent arrow is ignored', () => {
    const p = cascadeProject();
    expect(removeItems(p, [arr('zz')])).toBe(p);
    expect(itemsDeletionImpact(p, [arr('zz')]).arrows).toBe(0);
    expect(canDeleteItems(p, [arr('zz')])).toBe(false);
  });

  it('moving does not apply to arrows: movingItems and moveItems ignore them', () => {
    const p = withArrow(cascadeProject(), 'r5', 'H', 'a1', {
      points: [{ x: 700, y: 700 }],
    });
    expect(movingItems(p, [arr('r5'), mark('H')])).toEqual([mark('H')]);
    expect(movingItems(p, [arr('r5')])).toEqual([]);
    // Arrows only: nothing to move, the same project.
    expect(moveItems(p, [arr('r5')], 40, 40)).toBe(p);
    // With a marking: it moves, the arrow (and the route) stay as they are.
    const moved = moveItems(p, [arr('r5'), mark('H')], 40, 20);
    expect(moved.markings.find((m) => m.id === 'H')?.rect).toMatchObject({
      x: 440,
      y: 1320,
    });
    expect(moved.arrows).toBe(p.arrows);
  });

  it('locking and unlocking the selection reaches the arrows', () => {
    const p = cascadeProject();
    const locked = setItemsLocked(p, [arr('r1'), mark('a1')], true);
    expect(locked.arrows.find((a) => a.id === 'r1')?.locked).toBe(true);
    expect(locked.arrows.find((a) => a.id === 'r2')?.locked).toBe(false);
    expect(locked.markings.find((m) => m.id === 'a1')?.locked).toBe(true);
    expect(setItemsLocked(locked, [arr('r1'), mark('a1')], true)).toBe(locked);
    const open = setItemsLocked(locked, [arr('r1')], false);
    expect(open.arrows.find((a) => a.id === 'r1')?.locked).toBe(false);
    // Arrows only: the markings are not touched.
    expect(open.markings).toBe(locked.markings);
  });
});

describe('switching space and switching the image', () => {
  const route = [{ x: 500, y: 100 }];

  it('a marking dragged out of the container deletes the arrow points', () => {
    const p = setArrowRoute(arrowProject(), 'r1', route);
    // Inside the container the route stays.
    expect(
      moveMarking(p, 'a3', 10, 10).arrows.find((a) => a.id === 'r1')?.points,
    ).toEqual(route);
    // Out (600 px to the right, in the gap between A and B): it becomes a canvas marking.
    const out = moveMarking(p, 'a3', 600, 0);
    expect(out.markings.find((m) => m.id === 'a3')?.containerId).toBeNull();
    expect(out.arrows.find((a) => a.id === 'r1')?.points).toEqual([]);
    expect(validateProject(out)).toEqual([]);
  });

  it('making the marking floating deletes the arrow points', () => {
    const p = setArrowRoute(arrowProject(), 'r1', route);
    const next = setMarkingFloating(p, 'a3', true);
    expect(next.markings.find((m) => m.id === 'a3')).toMatchObject({
      containerId: null,
      floating: true,
    });
    expect(next.arrows.find((a) => a.id === 'r1')?.points).toEqual([]);
  });

  it('replacing the file with one of another resolution rescales the container points', () => {
    // A container with a file: a1 → a3 in the same container, with a route in its pixels.
    let p = arrowProject();
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'A' ? { ...c, file: 'images/a.png', background: null } : c,
      ),
    };
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    const same = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 1000,
      height: 1000,
    });
    expect(same.arrows.find((a) => a.id === 'r1')?.points).toEqual([{ x: 500, y: 100 }]);
    const bigger = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 2000,
      height: 2000,
    });
    expect(bigger.arrows.find((a) => a.id === 'r1')?.points).toEqual([
      { x: 1000, y: 200 },
    ]);
    expect(validateProject(bigger)).toEqual([]);
  });

  it('the route between different containers (on the canvas) is not rescaled', () => {
    let p = withArrow(arrowProject(), 'r5', 'a1', 'b1', { points: [{ x: 1500, y: 50 }] });
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'A' ? { ...c, file: 'images/a.png', background: null } : c,
      ),
    };
    const next = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 2000,
      height: 2000,
    });
    expect(next.arrows.find((a) => a.id === 'r5')?.points).toEqual([{ x: 1500, y: 50 }]);
  });
});
