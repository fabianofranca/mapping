import {
  addAnnotation,
  addLayer,
  createArrow,
  createMarking,
  setAnnotationParent,
  type Arrow,
  type Project,
} from '../../src/model';
import { multiProject } from './multiSelectionFixtures';

// Arrows project (ME4): the `multiProject` (see tests/model/multiSelectionFixtures.ts) with a
// marking `b2` in container B and the arrow `r1` from a1 to a3 (both in container A), with two
// free annotations on it: `ra1` (layer L1) and `ra2` (layer L2, linked to `ra1`).
//
//   Canvas (canvas units)               container → rectangle on the canvas
//   A  (0,0) 1000×1000, scale 1         a1 (100,100,300,300)  a2 (150,150,100,100)
//   B  (2000,0) 500×500, scale 2        a3 (600,600,200,200)
//   C  (4000,0) 1000×1000               b1 (2100,100,200,200)  b2 (2600,600,200,200)
//   H  (400,1300,200,100) on the canvas c1 (4900,900,100,100)
//   N  (100,1300,200,100) floating      e1 (9050,50,100,100)

/** `multiProject` with marking `b2` (300,300,100,100 in B), on the canvas at (2600,600,200,200). */
export function arrowBase(): Project {
  return createMarking(multiProject(), {
    id: 'b2',
    containerId: 'B',
    rect: { x: 300, y: 300, width: 100, height: 100 },
  });
}

/** The arrow `id` between `from` and `to` (no points), created by the model operation. */
export function withArrow(
  p: Project,
  id: string,
  from: string,
  to: string,
  extra: Partial<Omit<Arrow, 'id' | 'from' | 'to'>> = {},
): Project {
  const { points, locked, ...args } = extra;
  void points;
  void locked;
  const next = createArrow(p, { id, from, to, ...args });
  const arrow = next.arrows.find((a) => a.id === id);
  if (!arrow) throw new Error('arrow not created');
  return {
    ...next,
    arrows: next.arrows.map((a) =>
      a.id === id
        ? { ...a, points: extra.points ?? [], locked: extra.locked ?? false }
        : a,
    ),
  };
}

export function arrowProject(): Project {
  let p = withArrow(arrowBase(), 'r1', 'a1', 'a3');
  p = addLayer(p, { id: 'L2', name: 'Events', color: '#1E88E5' });
  p = addAnnotation(p, { id: 'ra1', markingId: 'r1', layerId: 'L1', name: 'Route' });
  p = addAnnotation(p, { id: 'ra2', markingId: 'r1', layerId: 'L2', name: 'Event' });
  return setAnnotationParent(p, 'ra2', 'ra1');
}
