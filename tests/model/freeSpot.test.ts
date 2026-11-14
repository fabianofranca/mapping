import { describe, expect, it } from 'vitest';
import {
  FLOATING_GAP,
  IMAGE_GAP,
  PLACEMENT_GAP,
  floatingSpotNear,
  isFreeRect,
  nearestFreeSpot,
  nearestFreeSpotIn,
  placementNear,
  rectsOverlap,
  type Rect,
} from '../../src/model';
import { arrowBase } from './arrowFixtures';

// The "free spot" cores extracted from `placementNear` and `placeFloatingNear` (v16): they receive
// the obstacles and also serve the arrival of perspectives.

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('nearestFreeSpot', () => {
  it('with no obstacle, or with the requested spot free, it is the requested spot', () => {
    expect(nearestFreeSpot([], 50, 50, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
    expect(nearestFreeSpot([rect(500, 500, 10, 10)], 50, 50, { x: 7, y: 9 })).toEqual({
      x: 7,
      y: 9,
    });
  });

  it("occupied: the nearest free fit, next to an obstacle's edge with the gap", () => {
    const obstacle = rect(0, 0, 100, 100);
    const spot = nearestFreeSpot([obstacle], 50, 50, { x: 10, y: 10 });
    expect(rectsOverlap({ ...spot, width: 50, height: 50 }, obstacle)).toBe(false);
    // IMAGE_GAP gap: above the obstacle (10, -100) or to the left (-100, 10), the same distance.
    expect(spot).toEqual({ x: 10, y: -(IMAGE_GAP + 50) });
  });

  it('the gap is the given one', () => {
    const spot = nearestFreeSpot([rect(0, 0, 100, 100)], 50, 50, { x: 10, y: 10 }, 10);
    expect(spot).toEqual({ x: 10, y: -60 });
  });

  it('surrounded: goes to the right of all', () => {
    const ring = [rect(0, 0, 100, 100), rect(120, 0, 100, 100), rect(0, 120, 220, 100)];
    const spot = nearestFreeSpot(ring, 150, 150, { x: 60, y: 60 });
    for (const o of ring) {
      expect(rectsOverlap({ ...spot, width: 150, height: 150 }, o)).toBe(false);
    }
  });

  it('is the same result as placementNear', () => {
    const p = arrowBase();
    const size = { width: 800, height: 600 };
    const obstacles = p.containers.map((c) => ({
      x: c.placement.x,
      y: c.placement.y,
      width: c.width * c.placement.scale,
      height: c.height * c.placement.scale,
    }));
    for (const center of [
      { x: 500, y: 500 },
      { x: 2500, y: 400 },
      { x: 4600, y: 100 },
      { x: -300, y: 1800 },
    ]) {
      const wanted = { x: center.x - 400, y: center.y - 300 };
      expect(placementNear(p, size, 1, center)).toEqual({
        ...nearestFreeSpot(obstacles, 800, 600, wanted),
        scale: 1,
      });
    }
  });
});

describe('floatingSpotNear', () => {
  const size = { width: 20, height: 10 };
  const anchor = rect(0, 0, 100, 100);

  it('to the right of the target, at the top, with the gap', () => {
    expect(floatingSpotNear([], anchor, anchor, size)).toEqual({
      x: 100 + FLOATING_GAP,
      y: 0,
      ...size,
    });
  });

  it('stacks downward without overlapping the obstacles', () => {
    const first = floatingSpotNear([], anchor, anchor, size);
    const second = floatingSpotNear([first], anchor, anchor, size);
    expect(second).toEqual({ ...first, y: first.y + first.height + FLOATING_GAP });
  });

  it('starts at the height of `start` (the marking inside the container)', () => {
    const start = rect(10, 40, 30, 30);
    expect(floatingSpotNear([], anchor, start, size).y).toBe(40);
  });
});

describe('nearestFreeSpotIn (placement in free space, #1087)', () => {
  const area = rect(0, 0, 400, 300);

  it('the gap is PLACEMENT_GAP (8)', () => {
    expect(PLACEMENT_GAP).toBe(8);
  });

  it('the requested spot, free and inside the area, is the requested spot', () => {
    expect(nearestFreeSpotIn([], 100, 40, { x: 150, y: 130 }, area)).toEqual({
      x: 150,
      y: 130,
    });
    expect(
      nearestFreeSpotIn([rect(300, 0, 50, 50)], 100, 40, { x: 150, y: 130 }, area),
    ).toEqual({ x: 150, y: 130 });
  });

  it("occupied: the nearest fit next to the obstacle's edge, with the gap", () => {
    const wall = rect(100, 100, 200, 100);
    const spot = nearestFreeSpotIn([wall], 100, 40, { x: 150, y: 130 }, area);
    expect(spot).not.toBeNull();
    const placed = { ...spot!, width: 100, height: 40 };
    expect(rectsOverlap(placed, wall)).toBe(false);
    // Below (y = 200 + 8, 78 from the request) ties with above (y = 100 − 8 − 40 = 52): the first candidate wins.
    expect(spot).toEqual({ x: 150, y: 208 });
  });

  it("the area's edges are candidates, without a gap", () => {
    // The obstacle takes the whole width and leaves only a 40 strip glued to the bottom edge.
    const spot = nearestFreeSpotIn(
      [rect(0, 0, 400, 260)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(spot).toEqual({ x: 150, y: 260 });
    // With slack, the fit with the gap (250 + 8) is closer to the request than the area's edge (260).
    const tight = nearestFreeSpotIn(
      [rect(0, 0, 400, 250)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(tight).toEqual({ x: 150, y: 258 });
  });

  it('never returns a spot outside the area', () => {
    const spot = nearestFreeSpotIn(
      [rect(150, 100, 100, 100)],
      100,
      40,
      { x: 150, y: 100 },
      area,
    );
    expect(spot).not.toBeNull();
    const placed = { ...spot!, width: 100, height: 40 };
    expect(placed.x).toBeGreaterThanOrEqual(area.x);
    expect(placed.y).toBeGreaterThanOrEqual(area.y);
    expect(placed.x + placed.width).toBeLessThanOrEqual(area.x + area.width);
    expect(placed.y + placed.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it('no candidate in the area: null (without the "to the right of all")', () => {
    expect(
      nearestFreeSpotIn([rect(0, 0, 400, 300)], 100, 40, { x: 150, y: 100 }, area),
    ).toBeNull();
    // A piece bigger than the area does not fit either.
    expect(nearestFreeSpotIn([], 500, 40, { x: 0, y: 0 }, area)).toBeNull();
  });

  it('no area: there is always room (to the right of all if needed) and the coordinates are integers', () => {
    const ring = [rect(0, 0, 100, 100), rect(120, 0, 100, 100), rect(0, 120, 220, 100)];
    const spot = nearestFreeSpotIn(ring, 150, 150, { x: 60, y: 60 }, null);
    expect(spot).not.toBeNull();
    for (const o of ring) {
      expect(rectsOverlap({ ...spot!, width: 150, height: 150 }, o)).toBe(false);
    }
    const fractional = nearestFreeSpotIn(
      [rect(0.4, 0.4, 100.3, 100.3)],
      50,
      50,
      { x: 10, y: 10 },
      null,
    );
    expect(Number.isInteger(fractional!.x) && Number.isInteger(fractional!.y)).toBe(true);
    expect(
      rectsOverlap(
        { ...fractional!, width: 50, height: 50 },
        rect(0.4, 0.4, 100.3, 100.3),
      ),
    ).toBe(false);
  });

  it('nearestFreeSpot without an area does not change: the same result as before', () => {
    expect(nearestFreeSpot([rect(0, 0, 100, 100)], 50, 50, { x: 10, y: 10 })).toEqual({
      x: 10,
      y: -(IMAGE_GAP + 50),
    });
  });
});

describe('isFreeRect', () => {
  it('touching is not overlapping; outside the area is not free', () => {
    const area = rect(0, 0, 100, 100);
    expect(isFreeRect(rect(50, 0, 50, 50), [rect(0, 0, 50, 50)], area)).toBe(true);
    expect(isFreeRect(rect(49, 0, 50, 50), [rect(0, 0, 50, 50)], area)).toBe(false);
    expect(isFreeRect(rect(80, 0, 50, 50), [], area)).toBe(false);
    expect(isFreeRect(rect(80, 0, 50, 50), [], null)).toBe(true);
  });
});
