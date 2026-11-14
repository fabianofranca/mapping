import { describe, expect, it } from 'vitest';
import {
  ARROW_HANDLE_HIT_RADIUS,
  ARROW_MID_HANDLE_MIN,
  arrowHandleAt,
  arrowHandles,
  arrowStrokes,
  elbowLanePoints,
  arrowShape,
  arrowsAt,
  curvePath,
  distanceToPath,
  distanceToSegment,
  flatPoints,
  headDirection,
  headPoints,
  isOnLinkHandle,
  linkHandlePoint,
  nearestSide,
  pathMidpoint,
  thinPath,
  trimPathEnd,
  visibleArrowShapes,
} from '../../src/canvas/arrowGeometry';
import {
  createMarking,
  setArrowRoute,
  setArrowStyle,
  type Project,
} from '../../src/model';
import { arrowProject, withArrow } from '../model/arrowFixtures';

// r1: a1 (100,100,300,300) → a3 (600,600,200,200), as duas no container A (escala 1, em 0,0).
// Automatic side: exit through the right of a1 (400,250) and arrival through the left of a3 (600,700).
const NONE = new Map();

function shapeOf(p: Project, id = 'r1') {
  const arrow = p.arrows.find((a) => a.id === id);
  if (!arrow) throw new Error('seta');
  const shape = arrowShape(p, arrow);
  if (!shape) throw new Error('forma');
  return shape;
}

describe('distances', () => {
  it('ponto ao segmento: perpendicular, ponta e segmento degenerado', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('point to the stroke: the smallest of the segments', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(distanceToPath({ x: 12, y: 5 }, path)).toBe(2);
    expect(distanceToPath({ x: 5, y: -1 }, path)).toBe(1);
    expect(distanceToPath({ x: 1, y: 1 }, [])).toBe(Infinity);
  });
});

describe('stroke', () => {
  it('straight and corner: the route points; the anchors are the middle of the sides', () => {
    const p = setArrowStyle(arrowProject(), 'r1', 'straight');
    const shape = shapeOf(p);
    expect(shape.path).toEqual([
      { x: 400, y: 250 },
      { x: 600, y: 700 },
    ]);
    expect(shape.mids).toEqual([{ x: 500, y: 475 }]);
    expect(shape.bounds).toEqual({ x: 400, y: 250, width: 200, height: 450 });
  });

  it('corner: the orthogonal polyline of the router (Z with the track in the middle), midpoints per stretch', () => {
    const elbow = shapeOf(setArrowStyle(arrowProject(), 'r1', 'elbow'));
    expect(elbow.path).toEqual([
      { x: 400, y: 250 },
      { x: 500, y: 250 },
      { x: 500, y: 700 },
      { x: 600, y: 700 },
    ]);
    expect(elbow.route.lanes).toEqual([{ axis: 'x', value: 500 }]);
    expect(elbow.mids).toEqual([
      { x: 450, y: 250 },
      { x: 500, y: 475 },
      { x: 550, y: 700 },
    ]);
    expect(elbow.bounds).toEqual({ x: 400, y: 250, width: 200, height: 450 });
  });

  it('curve: leaves perpendicular to the side, passes through the points and ends at the anchor', () => {
    const shape = shapeOf(arrowProject());
    expect(shape.arrow.style).toBe('curve');
    const { path } = shape;
    expect(path[0]).toEqual({ x: 400, y: 250 });
    expect(path[path.length - 1]).toEqual({ x: 600, y: 700 });
    // Exit through the right (+x) and arrival through the left: both tangents are horizontal.
    expect(path[1]?.x).toBeGreaterThan(400);
    expect(Math.abs((path[1]?.y ?? 0) - 250)).toBeLessThan(10);
    expect(headDirection(path).x).toBeGreaterThan(0.95);
    // The middle of the curve is the Bezier one: (500, 475), symmetric around the center of the chord.
    expect(shape.mids[0]?.x).toBeCloseTo(500);
    expect(shape.mids[0]?.y).toBeCloseTo(475);
    expect(shape.label.x).toBeCloseTo(500, 0);
    expect(shape.label.y).toBeCloseTo(475, 0);
  });

  it('curve with waypoints: passes through them', () => {
    const p = setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]);
    const shape = shapeOf(p);
    expect(shape.route.points[1]).toEqual({ x: 700, y: 300 });
    expect(shape.path.some((pt) => pt.x === 700 && pt.y === 300)).toBe(true);
    expect(shape.mids).toHaveLength(2);
    const ends = curvePath(shape.route.points, 'right', 'left');
    expect(ends.mids).toHaveLength(2);
  });

  it('middle of the stroke by length', () => {
    expect(pathMidpoint([])).toEqual({ x: 0, y: 0 });
    expect(
      pathMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
      ]),
    ).toEqual({ x: 10, y: 10 });
  });

  it('tip: direction of the last stretch and a triangle with the tip at the destination', () => {
    expect(
      headDirection([
        { x: 0, y: 0 },
        { x: 0, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toEqual({ x: 0, y: 1 });
    const pts = headPoints({ x: 10, y: 10 }, { x: 1, y: 0 }, 10);
    expect(pts.slice(0, 2)).toEqual([10, 10]);
    expect(pts[2]).toBe(0);
    expect(pts[4]).toBe(0);
    expect(pts[3]).toBe(-(pts[5] as number) + 20);
    expect(
      flatPoints([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it('thins the stroke: points less than `spacing` from the previous one are dropped; the ends stay', () => {
    const path = [0, 1, 2, 3, 10, 11, 20].map((x) => ({ x, y: 0 }));
    expect(thinPath(path, 5).map((p) => p.x)).toEqual([0, 10, 20]);
    expect(thinPath(path, 0).map((p) => p.x)).toEqual([0, 1, 2, 3, 10, 11, 20]);
    expect(thinPath([{ x: 1, y: 1 }], 5)).toEqual([{ x: 1, y: 1 }]);
    expect(thinPath([], 5)).toEqual([]);
  });

  it('trims the end of the stroke by the tip length', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(trimPathEnd(path, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
    ]);
    expect(trimPathEnd(path, 12)).toEqual([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
    ]);
    expect(trimPathEnd(path, 100)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('project shapes', () => {
  it('the shape of an arrow is kept while the arrow and the ends are the same', () => {
    const p = arrowProject();
    const first = shapeOf(p);
    expect(shapeOf(p)).toBe(first);
    // Another project version, the same arrow and the same markings and containers: same shape.
    expect(shapeOf({ ...p })).toBe(first);
    // Mudar a seta (estilo) refaz a forma.
    expect(shapeOf(setArrowStyle(p, 'r1', 'straight'))).not.toBe(first);
  });

  it('an arrow with a nonexistent end has no shape', () => {
    const p = arrowProject();
    const broken = { ...p, markings: p.markings.filter((m) => m.id !== 'a3') };
    expect(arrowShape(broken, p.arrows[0] as never)).toBeNull();
  });

  it('only the arrows with both ends in view; the same array while nothing changes', () => {
    const p = arrowProject();
    const all = visibleArrowShapes(p, NONE);
    expect(all.map((s) => s.arrow.id)).toEqual(['r1']);
    expect(visibleArrowShapes(p, NONE)).toBe(all);
    expect(visibleArrowShapes(p, new Map([['a3', 'hidden' as const]]))).toEqual([]);
    expect(visibleArrowShapes(p, new Map([['a1', 'dim' as const]]))).toHaveLength(1);
    expect(visibleArrowShapes(null, NONE)).toEqual([]);
    const base = visibleArrowShapes(p, NONE);
    // An edit that does not touch the arrows returns the same array (the layer is not redone).
    const renamed = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'a2' ? { ...m, name: 'x' } : m)),
    };
    expect(visibleArrowShapes(renamed, new Map())).toBe(base);
  });

  it('the project order is the drawing order', () => {
    const p = withArrow(arrowProject(), 'r2', 'a3', 'b2');
    expect(visibleArrowShapes(p, NONE).map((s) => s.arrow.id)).toEqual(['r1', 'r2']);
  });
});

describe('toque', () => {
  const straight = () => setArrowStyle(arrowProject(), 'r1', 'straight');

  it('picks the arrow up to 7 screen px from the stroke and not beyond', () => {
    const shapes = visibleArrowShapes(straight(), NONE);
    // A reta de (400,250) a (600,700): passa por (500,475).
    expect(arrowsAt(shapes, { x: 500, y: 475 }, 1)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 505, y: 475 }, 1)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 520, y: 475 }, 1)).toHaveLength(0);
    // With zoom 4, the same offset in canvas units is already far; in screen px, near.
    expect(arrowsAt(shapes, { x: 501, y: 475 }, 4)).toHaveLength(1);
    expect(arrowsAt(shapes, { x: 506, y: 475 }, 4)).toHaveLength(0);
    expect(arrowsAt(shapes, { x: 0, y: 0 }, 1)).toHaveLength(0);
  });

  it('the closest first; on a tie, the top one', () => {
    const p = withArrow(straight(), 'r2', 'a1', 'a3', { style: 'straight' });
    const shapes = visibleArrowShapes(p, NONE);
    expect(arrowsAt(shapes, { x: 500, y: 475 }, 1).map((s) => s.arrow.id)).toEqual([
      'r2',
      'r1',
    ]);
    const q = withArrow(straight(), 'r3', 'a1', 'b2', { style: 'straight' });
    // r3 passes at a different distance from the same point: the one with the smallest distance comes first.
    const near = arrowsAt(visibleArrowShapes(q, NONE), { x: 500, y: 475 }, 1);
    expect(near.map((s) => s.arrow.id)).toContain('r1');
  });
});

describe('corner handles', () => {
  // r1 on a corner: (400,250) → (500,250) → (500,700) → (600,700); the track is the vertical stretch.
  const elbow = (points: { x: number; y: number }[] = []): Project =>
    setArrowStyle(setArrowRoute(arrowProject(), 'r1', points), 'r1', 'elbow');

  it('the ends and the middle of the middle segment; without waypoints nor loose midpoints', () => {
    const handles = arrowHandles(shapeOf(elbow()), 1);
    expect(handles.map((h) => h.kind)).toEqual(['end', 'end', 'segment']);
    expect(handles[0]).toMatchObject({ end: 'from', at: { x: 400, y: 250 } });
    expect(handles[1]).toMatchObject({ end: 'to', at: { x: 600, y: 700 } });
    expect(handles[2]).toEqual({
      kind: 'segment',
      index: 0,
      axis: 'x',
      at: { x: 500, y: 475 },
    });
  });

  it('the segment that is short on the screen does not get the middle handle, but still catches the touch', () => {
    const shape = shapeOf(elbow());
    expect(arrowHandles(shape, (ARROW_MID_HANDLE_MIN - 1) / 450)).toHaveLength(2);
    expect(arrowHandleAt(shape, { x: 503, y: 300 }, 1)).toMatchObject({
      kind: 'segment',
      index: 0,
      axis: 'x',
    });
  });

  it('the whole segment catches the touch; the tip has priority; outside it, nothing', () => {
    const shape = shapeOf(elbow());
    expect(arrowHandleAt(shape, { x: 496, y: 600 }, 1)).toMatchObject({
      kind: 'segment',
    });
    expect(arrowHandleAt(shape, { x: 402, y: 252 }, 1)).toMatchObject({
      kind: 'end',
      end: 'from',
    });
    // The first and the last stretch are not middle segments: no handle.
    expect(arrowHandleAt(shape, { x: 450, y: 250 }, 1)).toBeNull();
    expect(arrowHandleAt(shape, { x: 520, y: 475 }, 1)).toBeNull();
    // The reach is in screen px: with zoom 2 it is half in canvas units.
    expect(arrowHandleAt(shape, { x: 500 + 5, y: 600 }, 2)).toBeNull();
    expect(arrowHandleAt(shape, { x: 500 + 3, y: 600 }, 2)).not.toBeNull();
  });

  it('a zero-length segment neither catches the touch nor gets a handle', () => {
    // a1 and z at the same height: the Z becomes a straight line and the track has no length.
    const base = createMarking(arrowProject(), {
      id: 'z',
      containerId: null,
      rect: { x: 800, y: 200, width: 100, height: 100 },
    });
    const shape = shapeOf(
      setArrowStyle(withArrow(base, 'rz', 'a1', 'z'), 'rz', 'elbow'),
      'rz',
    );
    expect(shape.route.lanes).toEqual([{ axis: 'x', value: 600 }]);
    expect(arrowHandles(shape, 1).map((h) => h.kind)).toEqual(['end', 'end']);
    expect(arrowHandleAt(shape, { x: 600, y: 250 }, 1)).toBeNull();
  });

  it('corner waypoints: the recorded ones when they match, otherwise the middle of each segment', () => {
    const container = { x: 0, y: 0, scale: 1 };
    expect(elbowLanePoints(shapeOf(elbow()), container)).toEqual([{ x: 500, y: 475 }]);
    const stored = [{ x: 520, y: 400 }];
    expect(elbowLanePoints(shapeOf(elbow(stored)), container)).toEqual(stored);
    // A quantity that does not match the sides is ignored: the route is the default.
    const odd = elbow([
      { x: 520, y: 400 },
      { x: 530, y: 410 },
    ]);
    expect(elbowLanePoints(shapeOf(odd), container)).toEqual([{ x: 500, y: 475 }]);
    // In a scaled space, the middle of the segment goes back to the container pixels.
    expect(elbowLanePoints(shapeOf(elbow()), { x: 100, y: 50, scale: 2 })).toEqual([
      { x: 200, y: 213 },
    ]);
  });

  it('the drawing separates the corner arrows (sharp corners) from the others', () => {
    const mixed = visibleArrowShapes(
      setArrowStyle(withArrow(arrowProject(), 'r2', 'a3', 'b2'), 'r2', 'elbow'),
      NONE,
    );
    const strokes = arrowStrokes(mixed, 1, 10);
    expect(strokes.bodies).toHaveLength(1); // a curva r1
    expect(strokes.corners).toHaveLength(1); // o canto r2
    // The corner is not thinned: all the corners of the route are on the stroke.
    expect((strokes.corners[0] as number[]).length).toBeGreaterThanOrEqual(8);
  });
});

describe('handles', () => {
  it('ends, waypoints and stretch midpoints, in that order', () => {
    const p = setArrowStyle(
      setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]),
      'r1',
      'straight',
    );
    const handles = arrowHandles(shapeOf(p), 1);
    expect(handles.map((h) => h.kind)).toEqual(['end', 'end', 'point', 'mid', 'mid']);
    expect(handles[0]).toMatchObject({ end: 'from', at: { x: 400, y: 250 } });
    // With the waypoint above a3, the arrow arrives through the top side: (700, 600).
    expect(handles[1]).toMatchObject({ end: 'to', at: { x: 700, y: 600 } });
    expect(handles[2]).toMatchObject({ index: 0, at: { x: 700, y: 300 } });
    // The midpoint of the first stretch goes at position 0; that of the second, at 1.
    expect(handles[3]).toMatchObject({ index: 0, at: { x: 550, y: 275 } });
    expect(handles[4]).toMatchObject({ index: 1, at: { x: 700, y: 450 } });
  });

  it('the midpoint of a stretch that is short on the screen does not get a handle', () => {
    const shape = shapeOf(setArrowStyle(arrowProject(), 'r1', 'straight'));
    const length = Math.hypot(200, 450);
    expect(arrowHandles(shape, (ARROW_MID_HANDLE_MIN - 1) / length)).toHaveLength(2);
    expect(arrowHandles(shape, ARROW_MID_HANDLE_MIN / length)).toHaveLength(3);
  });

  it('finds the handle under the point: end before point, before midpoint', () => {
    const p = setArrowStyle(
      setArrowRoute(arrowProject(), 'r1', [{ x: 700, y: 300 }]),
      'r1',
      'straight',
    );
    const shape = shapeOf(p);
    expect(arrowHandleAt(shape, { x: 403, y: 252 }, 1)).toMatchObject({
      kind: 'end',
      end: 'from',
    });
    expect(arrowHandleAt(shape, { x: 700, y: 303 }, 1)).toMatchObject({
      kind: 'point',
      index: 0,
    });
    expect(arrowHandleAt(shape, { x: 550, y: 275 }, 1)).toMatchObject({
      kind: 'mid',
      index: 0,
    });
    expect(arrowHandleAt(shape, { x: 500, y: 100 }, 1)).toBeNull();
    // The radius is in screen px: with zoom 2 the reach in canvas units is half.
    const reach = ARROW_HANDLE_HIT_RADIUS;
    expect(arrowHandleAt(shape, { x: 700 + reach / 2 - 1, y: 300 }, 2)).not.toBeNull();
    expect(arrowHandleAt(shape, { x: 700 + reach / 2 + 1, y: 300 }, 2)).toBeNull();
  });

  it('link handle: outside the right edge, at the middle of the side', () => {
    const rect = { x: 100, y: 100, width: 300, height: 300 };
    expect(linkHandlePoint(rect, 1)).toEqual({ x: 414, y: 250 });
    expect(linkHandlePoint(rect, 2)).toEqual({ x: 407, y: 250 });
    expect(isOnLinkHandle(rect, { x: 410, y: 255 }, 1)).toBe(true);
    expect(isOnLinkHandle(rect, { x: 380, y: 250 }, 1)).toBe(false);
  });

  it('closest side to the pointer, from inside and from outside', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    expect(nearestSide(rect, { x: 50, y: -20 })).toBe('top');
    expect(nearestSide(rect, { x: 140, y: 25 })).toBe('right');
    expect(nearestSide(rect, { x: 50, y: 80 })).toBe('bottom');
    expect(nearestSide(rect, { x: -30, y: 25 })).toBe('left');
    // Inside: the closest border side.
    expect(nearestSide(rect, { x: 90, y: 25 })).toBe('right');
    expect(nearestSide(rect, { x: 50, y: 5 })).toBe('top');
  });
});
