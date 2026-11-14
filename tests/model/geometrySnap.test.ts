import { describe, expect, it } from 'vitest';
import {
  snapCoordinate,
  snapNearInteger,
  snapPlacement,
  snapScale,
  touchDelta,
} from '../../src/model';

// Floating-point noise near an integer becomes the integer; a real fraction stays.
describe('snapNearInteger', () => {
  it('near an integer returns the integer', () => {
    expect(snapNearInteger(211.99999999999977)).toBe(212);
    expect(snapNearInteger(100.00000000000023)).toBe(100);
    expect(snapNearInteger(7)).toBe(7);
  });

  it('a real fraction stays as is', () => {
    expect(snapNearInteger(1868.13)).toBe(1868.13);
    expect(snapNearInteger(0.5)).toBe(0.5);
    expect(snapNearInteger(-3.25)).toBe(-3.25);
  });

  it('a negative near zero gives 0, not -0', () => {
    const v = snapNearInteger(-2.2737367544323206e-13);
    expect(Object.is(v, 0)).toBe(true);
    expect(JSON.stringify({ v })).toBe('{"v":0}');
    expect(Object.is(snapNearInteger(-0), 0)).toBe(true);
  });

  it('the tolerance is configurable and the limit is exclusive', () => {
    expect(snapNearInteger(1.05, 0.1)).toBe(1);
    expect(snapNearInteger(1.2, 0.1)).toBe(1.2);
    expect(snapNearInteger(1 + 2e-6)).toBe(1 + 2e-6);
  });

  it('a non-finite value passes as is', () => {
    expect(snapNearInteger(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(snapNearInteger(Number.NaN)).toBeNaN();
  });
});

// Rounding policy of `placement` (decision 1 of stage #1190): 6 decimals in x/y, 12
// significant digits in the scale; the integer still wins.
describe('snapCoordinate', () => {
  it('cuts the floating-point tail to 6 decimals', () => {
    expect(snapCoordinate(-188.75000000000006)).toBe(-188.75);
    expect(snapCoordinate(-739.6551724137931)).toBe(-739.655172);
    expect(snapCoordinate(1099.9999785087473)).toBe(1099.999979);
  });

  it('near an integer returns the integer', () => {
    expect(snapCoordinate(274.9999999)).toBe(275);
  });

  it('never returns -0', () => {
    for (const v of [-0.0000004, -0, -2.2737367544323206e-13]) {
      expect(Object.is(snapCoordinate(v), 0)).toBe(true);
    }
  });

  it('a fraction with up to 6 decimals stays as is', () => {
    expect(snapCoordinate(1868.13)).toBe(1868.13);
    expect(snapCoordinate(-0.000001)).toBe(-0.000001);
  });

  it('a non-finite value passes as is', () => {
    expect(snapCoordinate(Number.NaN)).toBeNaN();
    expect(snapCoordinate(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(snapCoordinate(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('snapScale', () => {
  it('cuts the scale to 12 significant digits', () => {
    expect(snapScale(17.24137931034483)).toBe(17.2413793103);
    expect(snapScale(0.5000000000000001)).toBe(0.5);
  });

  it('near an integer >= 1 returns the integer', () => {
    expect(snapScale(1.0000000000000002)).toBe(1);
    expect(snapScale(9.9999999)).toBe(10);
  });

  it('a small scale never becomes 0', () => {
    expect(snapScale(1e-9)).toBe(1e-9);
    expect(snapScale(0.4)).toBe(0.4);
    expect(snapScale(1.2345678901234e-9)).toBe(1.23456789012e-9);
  });

  it('a non-finite value passes as is', () => {
    expect(snapScale(Number.NaN)).toBeNaN();
    expect(snapScale(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('snapPlacement: the policy', () => {
  it('writes x and y with 6 decimals and the scale with 12 digits', () => {
    expect(
      snapPlacement({
        x: -188.75000000000006,
        y: -739.6551724137931,
        scale: 17.24137931034483,
      }),
    ).toEqual({ x: -188.75, y: -739.655172, scale: 17.2413793103 });
  });
});

// Decision 9 (#1187 items 2 and 4): `touchDelta`; the property test is in multiSelection.test.ts.
describe('touchDelta', () => {
  it('with nobody moving returns the request (rounded and truncated with `whole`)', () => {
    expect(touchDelta([], [], 3.4, -2.6, false)).toEqual({ dx: 3.4, dy: -2.6 });
    expect(touchDelta([], [], 3.4, -2.6, true)).toEqual({ dx: 3, dy: -3 });
  });

  it('touches and slides like slideToTouch', () => {
    const moving = [{ x: 0, y: 0, width: 100, height: 100 }];
    const fixed = [{ x: 150, y: 0, width: 100, height: 100 }];
    expect(touchDelta(moving, fixed, 200, 30, false)).toEqual({ dx: 50, dy: 30 });
  });
});
