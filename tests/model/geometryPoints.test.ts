import { describe, expect, it } from 'vitest';
import { IDENTITY_PLACEMENT, fromCanvasPoint, toCanvasPoint } from '../../src/model';

// Point conversion between a container's space (its pixels) and the canvas's, used by the
// arrow route (`arrowRoute`).

describe('toCanvasPoint e fromCanvasPoint', () => {
  const placement = { x: 2000, y: 300, scale: 2 };

  it('converts from the container space to the canvas', () => {
    expect(toCanvasPoint(placement, { x: 100, y: 50 })).toEqual({ x: 2200, y: 400 });
    expect(toCanvasPoint(placement, { x: 0, y: 0 })).toEqual({ x: 2000, y: 300 });
    expect(toCanvasPoint(placement, { x: -10, y: -5 })).toEqual({ x: 1980, y: 290 });
  });

  it('the inverse returns the point, without rounding', () => {
    expect(fromCanvasPoint(placement, { x: 2200, y: 400 })).toEqual({ x: 100, y: 50 });
    expect(fromCanvasPoint(placement, { x: 2001, y: 301 })).toEqual({ x: 0.5, y: 0.5 });
    const point = { x: 123.25, y: -7.5 };
    expect(fromCanvasPoint(placement, toCanvasPoint(placement, point))).toEqual(point);
  });

  it('the canvas space is the identity', () => {
    const point = { x: 12.5, y: -40 };
    expect(toCanvasPoint(IDENTITY_PLACEMENT, point)).toEqual(point);
    expect(fromCanvasPoint(IDENTITY_PLACEMENT, point)).toEqual(point);
  });

  it('fractional scale', () => {
    const half = { x: 0, y: 0, scale: 0.5 };
    expect(toCanvasPoint(half, { x: 200, y: 100 })).toEqual({ x: 100, y: 50 });
    expect(fromCanvasPoint(half, { x: 100, y: 50 })).toEqual({ x: 200, y: 100 });
  });
});
