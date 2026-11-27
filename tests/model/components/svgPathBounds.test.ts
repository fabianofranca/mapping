// SG2 (stage #2847, decision 6): the tight box of an SVG path, the base of `objectBoundingBox`.
import { describe, expect, it } from 'vitest';
import { pathBounds } from '../../../src/model/components/svgPathBounds';

function expectBox(
  d: string,
  [x, y, width, height]: readonly [number, number, number, number],
): void {
  const box = pathBounds(d);
  expect(box).toBeDefined();
  expect(box?.x).toBeCloseTo(x, 6);
  expect(box?.y).toBeCloseTo(y, 6);
  expect(box?.width).toBeCloseTo(width, 6);
  expect(box?.height).toBeCloseTo(height, 6);
}

describe('pathBounds', () => {
  it('a rectangle', () => {
    expectBox('M2 2h10v6H2z', [2, 2, 10, 6]);
  });

  it('the relative commands give the same box as the absolute ones', () => {
    expectBox('m2 2l10 0l0 6l-10 0z', [2, 2, 10, 6]);
    expectBox('M2 2L12 2L12 8L2 8Z', [2, 2, 10, 6]);
    expectBox('M2 2h10v6h-10z', [2, 2, 10, 6]);
  });

  it('a cubic goes by its extreme, not by its control points', () => {
    expectBox('M0 0C0 10 10 10 10 0', [0, 0, 10, 7.5]);
  });

  it('a quadratic goes by its extreme', () => {
    expectBox('M0 0Q5 10 10 0', [0, 0, 10, 5]);
  });

  it('an arc reaches its top', () => {
    expectBox('M0 12A12 12 0 0 1 24 12', [0, 0, 24, 12]);
  });

  it('an arc the other way reaches the bottom', () => {
    expectBox('M0 12A12 12 0 0 0 24 12', [0, 12, 24, 12]);
  });

  it('an arc with radii too small is enlarged as SVG does', () => {
    expectBox('M0 12A1 1 0 0 1 24 12', [0, 0, 24, 12]);
  });

  it('a half circle through the side, and a large arc past its end points', () => {
    expectBox('M12 0A12 12 0 1 1 12 24', [12, 0, 12, 24]);
    // A large arc of radius 10 between (0, 0) and (10, 10) swings out past both end points.
    const large = pathBounds('M0 0A10 10 0 1 1 10 10');
    expect(large?.width).toBeGreaterThan(10);
    expect(large?.height).toBeGreaterThan(10);
  });

  it('a rotated ellipse arc', () => {
    // A full-size circle is the same at any rotation, with the flags glued to the numbers.
    expectBox('M0 12a12 12 45 0124 0', [0, 0, 24, 12]);
  });

  it('S reflects the previous cubic control point', () => {
    // C 0 10 10 10 10 0, then S: the first control is the reflection (10, -10).
    expectBox('M0 0C0 10 10 10 10 0S20 -10 20 0', [0, -7.5, 20, 15]);
  });

  it('T reflects the previous quadratic control point', () => {
    expectBox('M0 0Q5 10 10 0T20 0', [0, -5, 20, 10]);
  });

  it('S and T without a previous curve start from the current point', () => {
    expectBox('M0 0S10 10 10 0', [0, 0, 10, 4.444444]);
    expectBox('M0 0T10 0', [0, 0, 10, 0]);
  });

  it('an implicit lineto after M, and several sub-paths', () => {
    expectBox('M0 0 4 4M10 10 12 11', [0, 0, 12, 11]);
    expectBox('m0 0 4 4m6 6 2 1', [0, 0, 12, 11]);
  });

  it('Z returns to the start of the sub-path', () => {
    expectBox('M5 5l3 0l0 3zl-5 0', [0, 5, 8, 3]);
  });

  it('numbers written with signs, exponents and no separators', () => {
    expectBox('M-1.5-2e0L.5.5', [-1.5, -2, 2, 2.5]);
  });

  it('is undefined for invalid path data', () => {
    expect(pathBounds('')).toBeUndefined();
    expect(pathBounds('L1 1')).toBeUndefined();
    expect(pathBounds('M0 0L')).toBeUndefined();
    expect(pathBounds('M0 0L1')).toBeUndefined();
    expect(pathBounds('M0 0X1 1')).toBeUndefined();
    expect(pathBounds('M0 0A1 1 0 2 0 1 1')).toBeUndefined();
    expect(pathBounds('M0 0 foo')).toBeUndefined();
  });
});
