import { describe, expect, it } from 'vitest';
import {
  membersOf,
  projectIndex,
  settleHierarchy,
  validateProject,
  type Arrow,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Containment rules (docs/ARCHITECTURE.md, "Spaces, containment and gestures"): the test
// that comes before any canvas. The projects are built by hand, without the operations (which
// already settle), so the settle is exercised on its own.

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function container(
  id: string,
  width: number,
  height: number,
  placement: Placement,
): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width,
    height,
    placement,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function mk(
  id: string,
  containerId: string | null,
  r: Rect,
  extra: Partial<Marking> = {},
): Marking {
  return {
    id,
    containerId,
    parentId: null,
    name: null,
    rect: r,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
    ...extra,
  };
}

function project(containers: ProjectContainer[], markings: Marking[]): Project {
  return { ...emptyProject(), containers, markings };
}

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));
const containerParents = (p: Project) =>
  Object.fromEntries(p.containers.map((c) => [c.id, c.parentId]));
const get = (p: Project, id: string) => projectIndex(p).markings.get(id) as Marking;

// Three screens on the canvas: A (1000×1000, scale 1, at 0,0), B (500×500, scale 2, at 2000,0,
// takes 1000×1000 on the canvas) and C (1000×1000, scale 1, at 4000,0).
const A = container('A', 1000, 1000, { x: 0, y: 0, scale: 1 });
const B = container('B', 500, 500, { x: 2000, y: 0, scale: 2 });
const C = container('C', 1000, 1000, { x: 4000, y: 0, scale: 1 });

describe('parent of a marking: the smallest in the same space that fully contains it', () => {
  it('picks the one with the smallest area among those that contain it', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('inner', 'A', rect(110, 110, 50, 50)),
          mk('big', 'A', rect(0, 0, 800, 800)),
          mk('mid', 'A', rect(100, 100, 200, 200)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ inner: 'mid', big: null, mid: 'big' });
  });

  it('coinciding edges count as inside', () => {
    const p = settleHierarchy(
      project(
        [A],
        [mk('out', 'A', rect(0, 0, 100, 100)), mk('in', 'A', rect(0, 0, 100, 50))],
      ),
    );
    expect(get(p, 'in').parentId).toBe('out');
  });

  it('area tie: the one that comes first in the array is the outer one', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('first', 'A', rect(10, 10, 100, 100)),
          mk('second', 'A', rect(10, 10, 100, 100)),
          mk('third', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    // Among several equal ones, the nearest in the array (the one with the highest index before it).
    expect(parents(p)).toEqual({ first: null, second: 'first', third: 'second' });
  });

  it('tie inside a larger one: the current relation among the equal ones holds, not the array', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('twinB', 'A', rect(10, 10, 100, 100), { parentId: 'twinA' }),
          mk('big', 'A', rect(0, 0, 500, 500)),
          mk('twinA', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    // Stable tie-break (#549): twinB is already a child of twinA, and stays so, even coming before it in
    // the array. The larger one is the parent of the outer one of the pair.
    expect(parents(p)).toEqual({ twinB: 'twinA', big: null, twinA: 'big' });
  });

  it('crossing markings have no relation; what is inside both belongs to the smaller one', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('left', 'A', rect(0, 0, 300, 200)),
          mk('right', 'A', rect(200, 0, 300, 300)),
          mk('both', 'A', rect(210, 10, 50, 50)),
          mk('partial', 'A', rect(250, 150, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({
      left: null,
      right: null,
      both: 'left',
      partial: 'right',
    });
  });

  it('a partially covered item is not a child', () => {
    const p = settleHierarchy(
      project(
        [A],
        [mk('box', 'A', rect(0, 0, 100, 100)), mk('half', 'A', rect(50, 50, 100, 20))],
      ),
    );
    expect(get(p, 'half').parentId).toBeNull();
  });
});

describe('the two spaces', () => {
  it('markings in different spaces never relate, even with the same numbers', () => {
    const p = settleHierarchy(
      project(
        [A, C],
        [
          // Canvas: covers only A on the canvas, around where C's marking sits in C's pixels.
          mk('canvasBox', null, rect(-50, -50, 1100, 1100)),
          mk('inC', 'C', rect(10, 10, 100, 100)),
          mk('inA', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ canvasBox: null, inC: null, inA: null });
  });

  it('a canvas marking around two containers has them as members', () => {
    const p = settleHierarchy(
      project([A, B, C], [mk('group', null, rect(-10, -10, 3020, 1020))]),
    );
    expect(containerParents(p)).toEqual({ A: 'group', B: 'group', C: null });
    const members = membersOf(p, 'group');
    expect(members.containers.map((c) => c.id)).toEqual(['A', 'B']);
    expect(members.markings).toEqual([]);
  });

  it('a container inside nested canvas markings belongs to the smaller one', () => {
    const p = settleHierarchy(
      project(
        [A, B],
        [
          mk('outer', null, rect(-100, -100, 3200, 1200)),
          mk('inner', null, rect(1900, -10, 1200, 1020)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ outer: null, inner: 'outer' });
    expect(containerParents(p)).toEqual({ A: 'outer', B: 'inner' });
    expect(projectIndex(p).canvasRoots.map((m) => m.id)).toEqual(['outer']);
  });

  it('a partially covered container is not a member', () => {
    const p = settleHierarchy(
      project([A], [mk('half', null, rect(-10, -10, 500, 2000))]),
    );
    expect(get(p, 'half').containerId).toBeNull();
    expect(containerParents(p)).toEqual({ A: null });
  });

  it('the parent of a container goes away when the marking stops containing it', () => {
    const base = settleHierarchy(
      project([A], [mk('box', null, rect(-10, -10, 1020, 1020))]),
    );
    expect(base.containers[0]?.parentId).toBe('box');
    const moved = settleHierarchy({
      ...base,
      containers: base.containers.map((c) => ({
        ...c,
        placement: { ...c.placement, x: 5000 },
      })),
    });
    expect(moved.containers[0]?.parentId).toBeNull();
  });
});

describe('space change on settle', () => {
  it('a marking of A dragged to B becomes a marking of B, with the same size on screen', () => {
    // In A's pixels (scale 1), the rectangle is on the canvas at 2100,100 — inside B.
    const p = settleHierarchy(
      project([A, B], [mk('ball', 'A', rect(2100, 100, 200, 100))]),
    );
    const ball = get(p, 'ball');
    expect(ball.containerId).toBe('B');
    // B has scale 2: 200×100 on the canvas = 100×50 pixels of B.
    expect(ball.rect).toEqual(rect(50, 50, 100, 50));
  });

  it('the descendants switch along and remain children', () => {
    const p = settleHierarchy(
      project(
        [A, B],
        [
          mk('card', 'A', rect(2100, 100, 400, 400)),
          mk('icon', 'A', rect(2120, 120, 40, 40), { parentId: 'card' }),
        ],
      ),
    );
    expect(get(p, 'card')).toMatchObject({
      containerId: 'B',
      rect: rect(50, 50, 200, 200),
    });
    expect(get(p, 'icon')).toMatchObject({
      containerId: 'B',
      parentId: 'card',
      rect: rect(60, 60, 20, 20),
    });
  });

  it('dropped outside all containers becomes a canvas marking, in canvas units', () => {
    // In B's pixels (scale 2, at 2000,0): -300 px = 1400 on the canvas, in the gap between A and B.
    const p = settleHierarchy(project([A, B], [mk('m', 'B', rect(-300, 10, 50, 20))]));
    expect(get(p, 'm')).toMatchObject({
      containerId: null,
      rect: rect(1400, 20, 100, 40),
    });
  });

  it('a canvas marking that ends up entirely inside a container becomes its own (decision 5)', () => {
    const p = settleHierarchy(project([A, B], [mk('m', null, rect(2010, 10, 100, 100))]));
    expect(get(p, 'm')).toMatchObject({ containerId: 'B', rect: rect(5, 5, 50, 50) });
  });

  it('the conversion rounds by the edges, enforces the minimum and the component minimum', () => {
    const D = container('D', 300, 300, { x: 0, y: 2000, scale: 3 });
    const p = settleHierarchy(
      project(
        [D],
        [
          // 10×10 on the canvas = 3.33 px of D: rises to the minimum of 8.
          mk('tiny', null, rect(31, 2031, 10, 10)),
          mk('button', null, rect(301, 2301, 31, 31)),
        ],
      ),
      { minSizeOf: (id) => (id === 'button' ? { width: 40, height: 12 } : null) },
    );
    expect(get(p, 'tiny')).toMatchObject({ containerId: 'D', rect: rect(10, 10, 8, 8) });
    expect(get(p, 'button')).toMatchObject({
      containerId: 'D',
      rect: rect(100, 100, 40, 12),
    });
  });

  it('a container marking that stays inside it does not change', () => {
    const before = project([A, B], [mk('m', 'B', rect(0, 0, 500, 500))]);
    expect(settleHierarchy(before)).toBe(before);
  });
});

describe('floating: outside the tree in both directions', () => {
  it('never a parent: a large sticky note does not capture a screen or canvas markings', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('note', null, rect(-100, -100, 3000, 3000), { floating: true }),
          mk('label', null, rect(1500, 10, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ note: null, label: null });
    expect(containerParents(p)).toEqual({ A: null });
  });

  it('never a child and never changes space: over a screen, it stays on the canvas', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('box', null, rect(1500, 0, 500, 500)),
          mk('note', null, rect(1510, 10, 50, 50), { floating: true, parentId: 'box' }),
          mk('onScreen', null, rect(10, 10, 50, 50), { floating: true }),
        ],
      ),
    );
    expect(get(p, 'note')).toMatchObject({ containerId: null, parentId: null });
    expect(get(p, 'onScreen')).toMatchObject({ containerId: null, parentId: null });
  });

  it('a floating one saved in a container goes to the canvas, converted', () => {
    const p = settleHierarchy(
      project([B], [mk('note', 'B', rect(10, 10, 50, 50), { floating: true })]),
    );
    expect(get(p, 'note')).toMatchObject({
      containerId: null,
      parentId: null,
      rect: rect(2020, 20, 100, 100),
    });
  });
});

describe('settling is deterministic and idempotent', () => {
  const messy = () =>
    project(
      [A, B, C],
      [
        mk('group', null, rect(-10, -10, 3020, 1020)),
        mk('m1', 'A', rect(10, 10, 300, 300), { parentId: 'x' }),
        mk('m2', 'A', rect(20, 20, 50, 50)),
        mk('moved', 'A', rect(4100, 100, 50, 50)),
        mk('twin1', 'C', rect(0, 0, 100, 100)),
        mk('twin2', 'C', rect(0, 0, 100, 100)),
      ],
    );

  it('settling again returns the same object', () => {
    const once = settleHierarchy(messy());
    expect(settleHierarchy(once)).toBe(once);
  });

  it('does not change the order of the arrays', () => {
    const once = settleHierarchy(messy());
    expect(once.markings.map((m) => m.id)).toEqual(messy().markings.map((m) => m.id));
    expect(once.containers.map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });

  it('the result satisfies the containment invariants', () => {
    expect(validateProject(settleHierarchy(messy()))).toEqual([]);
  });

  it('settled random projects are valid and stable', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 30; round++) {
      const markings: Marking[] = [];
      for (let i = 0; i < 25; i++) {
        const space = ['A', 'B', 'C', null][rand(4)] ?? null;
        const w = 8 + rand(300);
        const h = 8 + rand(300);
        const x = space === null ? rand(5000) - 500 : rand(400);
        const y = space === null ? rand(1500) - 200 : rand(150);
        markings.push(mk(`m${i}`, space, rect(x, y, w, h), { floating: rand(10) === 0 }));
      }
      const once = settleHierarchy(project([A, B, C], markings));
      expect(validateProject(once)).toEqual([]);
      expect(settleHierarchy(once)).toBe(once);
    }
  });
});

// Arrows (ME4): outside the containment tree. The settle ignores them, except for one thing: if an
// end changes space, the waypoints (which live in the space of the ends) are erased.
describe('arrows', () => {
  const arrowOf = (
    id: string,
    from: string,
    to: string,
    points: Arrow['points'] = [],
  ): Arrow => ({
    id,
    from,
    to,
    fromSide: null,
    toSide: null,
    points,
    style: 'curve',
    name: null,
    locked: false,
  });
  const withArrows = (p: Project, arrows: Arrow[]): Project => ({ ...p, arrows });
  const via = [{ x: 400, y: 50 }];

  it('they are ignored: nothing to change returns the same object, with the arrows as they are', () => {
    const settled = withArrows(
      settleHierarchy(
        project(
          [A, B],
          [
            mk('x', 'A', rect(10, 10, 100, 100)),
            mk('y', 'A', rect(300, 10, 100, 100)),
            mk('z', 'B', rect(0, 0, 100, 100)),
            mk('h', null, rect(0, 1500, 100, 100)),
          ],
        ),
      ),
      [arrowOf('r1', 'x', 'y', via), arrowOf('r2', 'x', 'z'), arrowOf('r3', 'h', 'x')],
    );
    const again = settleHierarchy(settled);
    expect(again).toBe(settled);
    expect(again.arrows).toBe(settled.arrows);
    // Being parent or child does not depend on arrows: they are not in the tree.
    expect(parents(again)).toEqual({ x: null, y: null, z: null, h: null });
  });

  it('an end that changes space erases the points (from the canvas to the container)', () => {
    // `y` is on the canvas, but fits entirely in A: the settle moves it to A.
    const p = withArrows(
      project(
        [A, B],
        [
          mk('x', 'A', rect(10, 10, 100, 100)),
          mk('y', null, rect(300, 10, 100, 100)),
          mk('w', 'A', rect(600, 600, 100, 100)),
        ],
      ),
      [arrowOf('r1', 'x', 'y', via), arrowOf('r2', 'x', 'w', via)],
    );
    const settled = settleHierarchy(p);
    expect(get(settled, 'y').containerId).toBe('A');
    expect(settled.arrows[0]?.points).toEqual([]);
    // An arrow that touches no marking that changed stays as is.
    expect(settled.arrows[1]).toBe(p.arrows[1]);
    expect(settled.arrows[0]).toMatchObject({ from: 'x', to: 'y', style: 'curve' });
    // And settling again returns the same object.
    expect(settleHierarchy(settled)).toBe(settled);
  });

  it('an end that leaves the container for the canvas erases the points', () => {
    // `x` goes past the edge of A: becomes a canvas marking.
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(950, 10, 100, 100)), mk('y', 'A', rect(300, 10, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'y', via)],
    );
    const settled = settleHierarchy(p);
    expect(get(settled, 'x').containerId).toBeNull();
    expect(settled.arrows[0]?.points).toEqual([]);
  });

  it('an end that changes container erases the points, even if the derived space is the canvas', () => {
    // x (A) and z (B) already have the points on the canvas; x moves to B: the end changes space.
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(2100, 100, 100, 100)), mk('z', 'B', rect(0, 0, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'z', via)],
    );
    expect(get(settleHierarchy(p), 'x').containerId).toBe('B');
    expect(settleHierarchy(p).arrows[0]?.points).toEqual([]);
  });

  it('an arrow without points is never rewritten', () => {
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(10, 10, 100, 100)), mk('y', null, rect(300, 10, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'y')],
    );
    expect(settleHierarchy(p).arrows).toBe(p.arrows);
  });

  it('the settle does not create, delete or reorder arrows', () => {
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(950, 10, 100, 100)), mk('y', 'A', rect(300, 10, 100, 100))],
      ),
      [arrowOf('r2', 'y', 'x', via), arrowOf('r1', 'x', 'y', via)],
    );
    expect(settleHierarchy(p).arrows.map((a) => a.id)).toEqual(['r2', 'r1']);
    expect(validateProject(settleHierarchy(p))).toEqual([]);
  });
});
