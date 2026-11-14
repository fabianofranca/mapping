import { describe, expect, it } from 'vitest';
import {
  createMarking,
  reorderMarking,
  settleHierarchy,
  wrapItems,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Stable tie-break (stage #549, decisions 1 and 2): on ties the settle keeps the current
// relation (the current parent among candidates of the same area; the current chain among equal
// rectangles), and the array order only decides a new tie. So reordering siblings never changes
// parents, not even in the next settle.

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

function container(id: string, size: number, placement: Placement): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width: size,
    height: size,
    placement,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function mk(id: string, containerId: string | null, r: Rect): Marking {
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
  };
}

function project(containers: ProjectContainer[], markings: Marking[]): Project {
  return settleHierarchy({ ...emptyProject(), containers, markings });
}

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));
const containerParents = (p: Project) =>
  Object.fromEntries(p.containers.map((c) => [c.id, c.parentId]));

/** Number of siblings of the marking (same space and same parent, itself included), in array order. */
function siblingCount(p: Project, id: string): number {
  const m = p.markings.find((x) => x.id === id) as Marking;
  return p.markings.filter(
    (x) =>
      !x.floating &&
      !m.floating &&
      x.containerId === m.containerId &&
      x.parentId === m.parentId,
  ).length;
}

const C = container('C', 100, { x: 0, y: 0, scale: 1 });

describe('stable tie-break: reordering does not change parents', () => {
  it('equal rectangles: the outer one stays the outer one after reordering and settling', () => {
    const start = project(
      [C],
      [
        mk('A', 'C', rect(0, 0, 50, 100)),
        mk('B', 'C', rect(0, 0, 50, 100)),
        mk('D', 'C', rect(50, 0, 50, 100)),
      ],
    );
    expect(parents(start)).toEqual({ A: null, B: 'A', D: null });
    const reordered = reorderMarking(start, 'A', 1);
    expect(reordered.markings.map((m) => m.id)).toEqual(['D', 'B', 'A']);
    expect(parents(settleHierarchy(reordered))).toEqual({ A: null, B: 'A', D: null });
  });

  it('candidates of the same area: reordering the two does not change the parent of the small one', () => {
    const start = project(
      [C],
      [
        mk('N0', 'C', rect(0, 0, 50, 100)),
        mk('N2', 'C', rect(0, 0, 100, 50)),
        mk('N3', 'C', rect(0, 0, 50, 50)),
      ],
    );
    const before = parents(start);
    expect(before).toEqual({ N0: null, N2: null, N3: 'N2' });
    const reordered = reorderMarking(start, 'N2', 0);
    expect(parents(settleHierarchy(reordered))).toEqual(before);
  });

  it('container parent: reordering two canvas markings of the same area does not change its parent', () => {
    const inner = container('I', 100, { x: 100, y: 100, scale: 1 });
    const start = project(
      [inner],
      [mk('H', null, rect(0, 100, 300, 100)), mk('V', null, rect(100, 0, 100, 300))],
    );
    expect(containerParents(start)).toEqual({ I: 'V' });
    const reordered = reorderMarking(start, 'V', 0);
    expect(reordered.markings.map((m) => m.id)).toEqual(['V', 'H']);
    expect(containerParents(settleHierarchy(reordered))).toEqual({ I: 'V' });
  });

  it('a new tie still follows the array: Wrap of the one that fills the container makes the new one the parent', () => {
    let p = project([C], []);
    p = createMarking(p, { id: 'M1', containerId: 'C', rect: rect(0, 0, 50, 50) });
    p = createMarking(p, { id: 'M2', containerId: 'C', rect: rect(0, 0, 100, 100) });
    p = wrapItems(p, { id: 'W', items: [{ kind: 'marking', id: 'M2' }] });
    expect(parents(p)).toMatchObject({ W: null, M2: 'W', M1: 'M2' });
  });

  it('Wrap the inner one of a reordered equal pair: the new one sits between the two', () => {
    let p = project([C], []);
    p = createMarking(p, { id: 'O', containerId: 'C', rect: rect(0, 0, 50, 100) });
    p = createMarking(p, { id: 'M', containerId: 'C', rect: rect(0, 0, 50, 100) });
    p = createMarking(p, { id: 'D', containerId: 'C', rect: rect(50, 0, 50, 100) });
    // The outer one (O) moves after the inner one (M) in the array; the parents do not change.
    p = reorderMarking(p, 'O', 1);
    expect(parents(p)).toEqual({ D: null, M: 'O', O: null });
    p = wrapItems(p, { id: 'W', items: [{ kind: 'marking', id: 'M' }] });
    expect(parents(p)).toEqual({ D: null, W: 'O', M: 'W', O: null });
  });

  it('a new marking with the same rectangle as a chain goes where the array puts it', () => {
    // Chain A › B › D (same rectangle), with A after B in the array by a reorder.
    const chain = project(
      [C],
      [
        mk('A', 'C', rect(0, 0, 50, 50)),
        mk('B', 'C', rect(0, 0, 50, 50)),
        mk('D', 'C', rect(0, 0, 50, 50)),
      ],
    );
    expect(parents(chain)).toEqual({ A: null, B: 'A', D: 'B' });
    const moved: Project = {
      ...chain,
      markings: [chain.markings[1], chain.markings[0], chain.markings[2]] as Marking[],
    };
    // N goes between B and D in the array: free at the same time as D only after B.
    const withNew: Project = {
      ...moved,
      markings: [
        moved.markings[0],
        moved.markings[1],
        mk('N', 'C', rect(0, 0, 50, 50)),
        moved.markings[2],
      ] as Marking[],
    };
    const settled = settleHierarchy(withNew);
    expect(parents(settled)).toEqual({ A: null, B: 'A', N: 'B', D: 'N' });
    // N before all in the array: becomes the outer one.
    const first: Project = {
      ...moved,
      markings: [mk('N', 'C', rect(0, 0, 50, 50)), ...moved.markings],
    };
    expect(parents(settleHierarchy(first))).toEqual({ N: null, A: 'N', B: 'A', D: 'B' });
  });

  it('parentId in a cycle (invalid file) becomes a chain without a cycle', () => {
    const a = { ...mk('A', 'C', rect(0, 0, 50, 50)), parentId: 'B' };
    const b = { ...mk('B', 'C', rect(0, 0, 50, 50)), parentId: 'A' };
    const settled = settleHierarchy({
      ...emptyProject(),
      containers: [C],
      markings: [a, b],
    });
    expect(parents(settled)).toEqual({ A: null, B: 'A' });
  });
});

// ---------------------------------------------------------------------------
// Property (decision 2): rectangles on a small grid force both kinds of tie.

/** Linear congruential generator: fixed seed, repeatable result. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length)] as T;

/** A 100×100 container at (100, 100) on the canvas, with markings inside and canvas ones around it. */
function randomProject(r: () => number, id: number): Project {
  const space = container('C', 100, { x: 100, y: 100, scale: 1 });
  const markings: Marking[] = [];
  const count = 3 + Math.floor(r() * 7);
  for (let k = 0; k < count; k++) {
    if (r() < 0.7) {
      const w = pick(r, [50, 100]);
      const h = pick(r, [50, 100]);
      const x = w === 100 ? 0 : pick(r, [0, 50]);
      const y = h === 100 ? 0 : pick(r, [0, 50]);
      markings.push(mk(`m${id}-${k}`, 'C', rect(x, y, w, h)));
    } else {
      const w = pick(r, [100, 200, 300]);
      const h = pick(r, [100, 200, 300]);
      const x = pick(r, [0, 100]);
      const y = pick(r, [0, 100]);
      markings.push(mk(`m${id}-${k}`, null, rect(x, y, w, h)));
    }
  }
  return settleHierarchy({ ...emptyProject(), containers: [space], markings });
}

function hasCycle(p: Project): boolean {
  const parentOf = new Map(p.markings.map((m) => [m.id, m.parentId]));
  for (const m of p.markings) {
    const seen = new Set<string>();
    let at: string | null | undefined = m.id;
    while (at) {
      if (seen.has(at)) return true;
      seen.add(at);
      at = parentOf.get(at);
    }
  }
  return false;
}

describe('stable tie-break: property with a fixed seed', () => {
  it('any sequence of reorderMarking followed by settleHierarchy gives the same parents', () => {
    const r = rng(549);
    for (let n = 0; n < 400; n++) {
      const start = randomProject(r, n);
      expect(hasCycle(start)).toBe(false);
      expect(settleHierarchy(start)).toBe(start);
      let p = start;
      const steps = 1 + Math.floor(r() * 6);
      for (let s = 0; s < steps; s++) {
        const target = pick(r, p.markings);
        const index = Math.floor(r() * siblingCount(p, target.id));
        p = reorderMarking(p, target.id, index);
        if (r() < 0.3) p = settleHierarchy(p);
      }
      const settled = settleHierarchy(p);
      expect(parents(settled), `case ${n}`).toEqual(parents(start));
      expect(containerParents(settled), `case ${n}`).toEqual(containerParents(start));
      expect(settleHierarchy(settled)).toBe(settled);
      expect(hasCycle(settled)).toBe(false);
    }
  });
});
