// MC0 (decision 28 of #898): the single computation of the baseline and of `cap-middle`, pure and browser-free.
import { describe, expect, it } from 'vitest';
import {
  CAP_HEIGHT_RATIO,
  capMetricsFallback,
  capMiddleShift,
  lineBaseline,
} from '../../../src/model/components/baseline';

describe('capMetricsFallback', () => {
  it('is the 0.8 / 0.2 / 0.7 fallback of the body', () => {
    expect(capMetricsFallback(10)).toEqual({ ascent: 8, descent: 2, capHeight: 7 });
    expect(CAP_HEIGHT_RATIO).toBe(0.7);
  });
});

describe('lineBaseline', () => {
  it('is the center of the line plus half of (ascent − descent)', () => {
    // line of 20 starting at 100, ascent 10 and descent 3: 100 + 10 + 3.5
    expect(lineBaseline(100, 20, { ascent: 10, descent: 3 })).toBe(113.5);
  });

  it('with ascent = descent the baseline is the center of the line', () => {
    expect(lineBaseline(0, 12, { ascent: 5, descent: 5 })).toBe(6);
  });
});

describe('capMiddleShift', () => {
  const metrics = { ascent: 10, descent: 3, capHeight: 8 };
  const shift = (boxHeight: number, lines: number, lineHeight = 14) =>
    capMiddleShift({
      boxHeight,
      capHeight: metrics.capHeight,
      firstBaseline: lineBaseline(0, lineHeight, metrics),
      lastBaseline: lineBaseline((lines - 1) * lineHeight, lineHeight, metrics),
    });

  it('one line: the top of the capital and the base are centered in the box', () => {
    // baseline = 7 + 3.5 = 10.5; block = 8; (30 − 8)/2 + 8 − 10.5 = 8.5
    expect(shift(30, 1)).toBe(8.5);
  });

  it('with more lines the block grows by one line height per line', () => {
    // 2 lines: block = 14 + 8 = 22; (40 − 22)/2 + 8 − 10.5 = 6.5
    expect(shift(40, 2)).toBe(6.5);
  });

  it('is 0 with a box without height', () => {
    expect(shift(0, 1)).toBe(0);
    expect(shift(-4, 3)).toBe(0);
  });
});
