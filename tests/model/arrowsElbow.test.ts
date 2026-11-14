import { describe, expect, it } from 'vitest';
import {
  arrowRoute,
  createArrow,
  createMarking,
  ELBOW_STUB,
  setArrowRoute,
  type ArrowPoint,
  type ArrowSide,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// The elbow router (`elbow` style, ME4): only horizontal and vertical segments, departure and arrival
// perpendicular to the sides, the waypoints as the middle segments. The markings are on the
// canvas (no container), so the waypoints are canvas units too.

const r = (x: number, y: number, width = 100, height = 100): Rect => ({
  x,
  y,
  width,
  height,
});

function scene(
  from: Rect,
  to: Rect,
  extra: {
    fromSide?: ArrowSide;
    toSide?: ArrowSide;
    points?: readonly ArrowPoint[];
  } = {},
): Project {
  let p: Project = emptyProject();
  p = createMarking(p, { id: 'A', containerId: null, rect: from });
  p = createMarking(p, { id: 'B', containerId: null, rect: to });
  p = createArrow(p, {
    id: 'r',
    from: 'A',
    to: 'B',
    style: 'elbow',
    fromSide: extra.fromSide ?? null,
    toSide: extra.toSide ?? null,
  });
  return extra.points ? setArrowRoute(p, 'r', extra.points) : p;
}

function route(p: Project) {
  const arrow = p.arrows[0];
  if (!arrow) throw new Error('arrow');
  const result = arrowRoute(p, arrow);
  if (!result) throw new Error('route');
  return result;
}

/** Every segment is horizontal or vertical. */
function orthogonal(points: readonly ArrowPoint[]): boolean {
  return points.every((pt, i) => {
    const prev = points[i - 1];
    return !prev || prev.x === pt.x || prev.y === pt.y;
  });
}

/** The direction (unit vector) of segment `i`, or `null` if it has zero length. */
function direction(points: readonly ArrowPoint[], i: number): ArrowPoint | null {
  const a = points[i] as ArrowPoint;
  const b = points[i + 1] as ArrowPoint;
  if (a.x === b.x && a.y === b.y) return null;
  return { x: Math.sign(b.x - a.x) + 0, y: Math.sign(b.y - a.y) + 0 };
}

const NORMALS: Record<ArrowSide, ArrowPoint> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** Leaves in the direction of the origin side and arrives opposite to the destination side. */
function leavesAndArrivesPerpendicular(p: Project): void {
  const { points, fromSide, toSide } = route(p);
  expect(orthogonal(points)).toBe(true);
  expect(direction(points, 0)).toEqual(NORMALS[fromSide]);
  const last = direction(points, points.length - 2);
  expect(last).toEqual({
    x: 0 - NORMALS[toSide].x,
    y: 0 - NORMALS[toSide].y,
  });
}

describe('elbow: default route', () => {
  it('automatic horizontal sides: a Z with the lane in the middle', () => {
    const p = scene(r(0, 0), r(400, 300));
    const { points, lanes, fromSide, toSide } = route(p);
    expect([fromSide, toSide]).toEqual(['right', 'left']);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 350 },
      { x: 400, y: 350 },
    ]);
    expect(lanes).toEqual([{ axis: 'x', value: 250 }]);
    leavesAndArrivesPerpendicular(p);
  });

  it('automatic vertical sides: the same Z transposed', () => {
    const p = scene(r(0, 0), r(300, 400));
    const { points, lanes, fromSide, toSide } = route(p);
    expect([fromSide, toSide]).toEqual(['bottom', 'top']);
    expect(points).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 250 },
      { x: 350, y: 250 },
      { x: 350, y: 400 },
    ]);
    expect(lanes).toEqual([{ axis: 'y', value: 250 }]);
    leavesAndArrivesPerpendicular(p);
  });

  it('to the left and upward also leave and arrive on the right side', () => {
    leavesAndArrivesPerpendicular(scene(r(400, 300), r(0, 0)));
    leavesAndArrivesPerpendicular(scene(r(300, 400), r(0, 0)));
  });

  it('different sides (L): a single bend, no lanes', () => {
    // Leaves from the right of A and arrives at the top of B.
    const p = scene(r(0, 0), r(300, 300), { fromSide: 'right', toSide: 'top' });
    const { points, lanes } = route(p);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 350, y: 50 },
      { x: 350, y: 300 },
    ]);
    expect(lanes).toEqual([]);
    leavesAndArrivesPerpendicular(p);
  });

  it('the L does not fit (the arrival endpoint is on the wrong side): four segments', () => {
    // Leaves from the right of A, but B is on the left and it arrives at the top, with A below B.
    const p = scene(r(300, 400), r(0, 0), { fromSide: 'right', toSide: 'top' });
    const { points, lanes } = route(p);
    expect(lanes).toHaveLength(2);
    expect(points).toHaveLength(5);
    leavesAndArrivesPerpendicular(p);
    // The first bend respects the minimum departure segment.
    expect((points[1] as ArrowPoint).x - (points[0] as ArrowPoint).x).toBe(ELBOW_STUB);
  });

  it('both on the same side (C): the lane passes beyond both markings', () => {
    const p = scene(r(0, 0), r(0, 300), { fromSide: 'right', toSide: 'right' });
    const { points, lanes } = route(p);
    expect(lanes).toEqual([{ axis: 'x', value: 100 + ELBOW_STUB }]);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 100 + ELBOW_STUB, y: 50 },
      { x: 100 + ELBOW_STUB, y: 350 },
      { x: 100, y: 350 },
    ]);
    leavesAndArrivesPerpendicular(p);
    const left = scene(r(0, 0), r(40, 300), { fromSide: 'left', toSide: 'left' });
    expect(route(left).lanes).toEqual([{ axis: 'x', value: -ELBOW_STUB }]);
    leavesAndArrivesPerpendicular(left);
  });

  it('markings stuck together, facing each other: five segments with the minimum at the ends', () => {
    // No room for the Z (less than twice the minimum segment between them).
    const p = scene(r(0, 0), r(110, 200), { fromSide: 'right', toSide: 'left' });
    const { points, lanes } = route(p);
    expect(lanes.map((l) => l.axis)).toEqual(['x', 'y', 'x']);
    expect(points).toHaveLength(6);
    leavesAndArrivesPerpendicular(p);
  });

  it('always orthogonal, leaving and arriving on the right side, in all side combinations', () => {
    const sides: ArrowSide[] = ['top', 'right', 'bottom', 'left'];
    const targets = [r(400, 300), r(-400, 300), r(30, -300), r(110, 20), r(-30, 150)];
    for (const to of targets) {
      for (const fromSide of sides) {
        for (const toSide of sides) {
          leavesAndArrivesPerpendicular(scene(r(0, 0), to, { fromSide, toSide }));
        }
      }
    }
  });
});

describe('elbow: waypoints are middle segments', () => {
  it('a given lane: the vertical segment goes to the x of the point (the y is ignored)', () => {
    const p = scene(r(0, 0), r(400, 300), { points: [{ x: 180, y: 9999 }] });
    const { points, lanes } = route(p);
    expect(points).toEqual([
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 350 },
      { x: 400, y: 350 },
    ]);
    expect(lanes).toEqual([{ axis: 'x', value: 180 }]);
  });

  it('on the vertical axis the lane pins the y', () => {
    const p = scene(r(0, 0), r(300, 400), { points: [{ x: 9999, y: 180 }] });
    expect(route(p).points).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 180 },
      { x: 350, y: 180 },
      { x: 350, y: 400 },
    ]);
  });

  it('moving a marking stretches only the first or the last segment', () => {
    const lane = [{ x: 180, y: 200 }];
    const before = route(scene(r(0, 0), r(400, 300), { points: lane })).points;
    // A goes up and B goes down: the middle lane stays at x = 180, only the ends stretch.
    const after = route(scene(r(0, -60), r(400, 340), { points: lane })).points;
    expect(after).toHaveLength(before.length);
    expect(after[1]).toEqual({ x: 180, y: -10 });
    expect(after[2]).toEqual({ x: 180, y: 390 });
    expect((after[1] as ArrowPoint).x).toBe((before[1] as ArrowPoint).x);
    expect((after[2] as ArrowPoint).x).toBe((before[2] as ArrowPoint).x);
    expect(orthogonal(after)).toBe(true);
    // Moved in the direction of the segment, the first leg shrinks: the lane stays where it was.
    const closer = route(scene(r(40, 0), r(400, 300), { points: lane })).points;
    expect(closer[0]).toEqual({ x: 140, y: 50 });
    expect(closer[1]).toEqual({ x: 180, y: 50 });
  });

  it('three lanes (five segments), alternating vertical, horizontal, vertical', () => {
    const p = scene(r(0, 0), r(400, 300), {
      points: [
        { x: 120, y: 0 },
        { x: 0, y: 200 },
        { x: 330, y: 0 },
      ],
    });
    expect(route(p).points).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 120, y: 200 },
      { x: 330, y: 200 },
      { x: 330, y: 350 },
      { x: 400, y: 350 },
    ]);
  });

  it('perpendicular sides: two lanes (horizontal and vertical)', () => {
    const p = scene(r(0, 0), r(300, 300), {
      fromSide: 'right',
      toSide: 'top',
      points: [
        { x: 200, y: 0 },
        { x: 0, y: 150 },
      ],
    });
    expect(route(p).points).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 350, y: 150 },
      { x: 350, y: 300 },
    ]);
  });

  it('points that do not match the sides (wrong quantity) are ignored: default route', () => {
    const base = route(scene(r(0, 0), r(400, 300))).points;
    const twoLanes = scene(r(0, 0), r(400, 300), {
      points: [
        { x: 120, y: 0 },
        { x: 0, y: 200 },
      ],
    });
    expect(route(twoLanes).points).toEqual(base);
  });

  it('the automatic side does not depend on the points', () => {
    // The far point below does not turn the departure side downwards, as it would on the straight style.
    const p = scene(r(0, 0), r(400, 300), { points: [{ x: 180, y: 5000 }] });
    expect(route(p)).toMatchObject({ fromSide: 'right', toSide: 'left' });
  });

  it('straight and curve keep the previous polyline and no lanes', () => {
    const p = scene(r(0, 0), r(400, 300));
    const straight = {
      ...p,
      arrows: p.arrows.map((a) => ({ ...a, style: 'straight' as const })),
    };
    expect(route(straight)).toEqual({
      points: [
        { x: 100, y: 50 },
        { x: 400, y: 350 },
      ],
      fromSide: 'right',
      toSide: 'left',
      lanes: [],
    });
  });
});
