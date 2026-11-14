import {
  addAnnotation,
  settleHierarchy,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Project of the joint drag and the multiple selection (ME2), built by hand and settled.
//
//   Canvas (canvas units)
//   G   canvas marking (-100,-100)–(5200,1100), encloses A, B and C
//   G2  canvas marking (-50,-50)–(1050,1050), inside G, encloses A
//   H   canvas marking (400,1300) 200×100, loose in the empty space
//   N   FLOATING marking (100,1300) 200×100
//
//   Containers (width × height in pixels, scale, position on the canvas)
//   A 1000×1000 scale 1   at (0,0)        markings a1 › a2 and a3
//   B  500×500  scale 2   at (2000,0)     (1000×1000 on the canvas) marking b1
//   C 1000×1000 scale 1   at (4000,0)     marking c1 stuck to the bottom right corner
//   D 1000×1000 scale 1   at (7000,0)     without markings (outside G)
//   E 2000×2000 scale 0.5 at (9000,0)     (1000×1000 on the canvas) marking e1
//
// Settled membership: A › G2 › G, B and C › G, D and E without a parent; a2 › a1.

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function container(
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

export function mk(
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

export function multiProject(): Project {
  const base = emptyProject();
  return settleHierarchy({
    ...base,
    containers: [
      container('A', 1000, 1000, { x: 0, y: 0, scale: 1 }),
      container('B', 500, 500, { x: 2000, y: 0, scale: 2 }),
      container('C', 1000, 1000, { x: 4000, y: 0, scale: 1 }),
      container('D', 1000, 1000, { x: 7000, y: 0, scale: 1 }),
      container('E', 2000, 2000, { x: 9000, y: 0, scale: 0.5 }),
    ],
    markings: [
      mk('G', null, rect(-100, -100, 5300, 1200)),
      mk('G2', null, rect(-50, -50, 1100, 1100)),
      mk('a1', 'A', rect(100, 100, 300, 300)),
      mk('a2', 'A', rect(150, 150, 100, 100)),
      mk('a3', 'A', rect(600, 600, 200, 200)),
      mk('b1', 'B', rect(50, 50, 100, 100)),
      mk('c1', 'C', rect(900, 900, 100, 100)),
      mk('e1', 'E', rect(100, 100, 200, 200)),
      mk('N', null, rect(100, 1300, 200, 100), { floating: true }),
      mk('H', null, rect(400, 1300, 200, 100)),
    ],
  });
}

/** `multiProject` with free annotations on layer L1: two on a1, one on a2 and one on b1. */
export function multiProjectAnnotated(): Project {
  let p = multiProject();
  for (const [id, markingId] of [
    ['n1', 'a1'],
    ['n2', 'a1'],
    ['n3', 'a2'],
    ['n4', 'b1'],
  ] as const) {
    p = addAnnotation(p, { id, markingId, layerId: 'L1' });
  }
  return p;
}
