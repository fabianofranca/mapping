// L3 (decisions 10 to 12 of #1078): the pure functions of the grid.
import { describe, expect, it } from 'vitest';
import {
  alignInCell,
  clampSpan,
  placeCells,
  spanExtent,
  trackCount,
  trackOffset,
  trackSize,
} from '../../../src/model/components/gridLayout';

describe('trackCount', () => {
  it('fixed columns', () => {
    expect(trackCount({ count: 3 }, 400, 8)).toBe(3);
  });
  it('minColumnWidth 120 in a width of 400 with gap 8 gives 3 columns', () => {
    expect(trackCount({ min: 120 }, 400, 8)).toBe(3);
  });
  it('minColumnWidth without a known width: one column; width smaller than the minimum: one', () => {
    expect(trackCount({ min: 120 }, null, 8)).toBe(1);
    expect(trackCount({ min: 120 }, 50, 8)).toBe(1);
  });
});

describe('trackSize and spanExtent', () => {
  it('3 columns of 400 with gap 8: (400 − 16) / 3', () => {
    expect(trackSize(400, 3, 8)).toBeCloseTo(128);
    expect(spanExtent(128, 2, 8)).toBeCloseTo(264);
    expect(trackOffset(2, 128, 8)).toBeCloseTo(272);
  });
});

describe('placeCells', () => {
  it('3 columns with 7 children: 3 lines, the last with 1', () => {
    const { cells, lines } = placeCells(Array(7).fill(1), 3);
    expect(lines).toBe(3);
    expect(cells.map((c) => [c.line, c.track])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ]);
  });
  it('a span 2 that does not fit at the end of the line goes to the next one and leaves the hole', () => {
    const { cells } = placeCells([1, 1, 2, 1], 3);
    expect(cells.map((c) => [c.line, c.track, c.span])).toEqual([
      [0, 0, 1],
      [0, 1, 1],
      [1, 0, 2],
      [1, 2, 1],
    ]);
  });
  it('a span larger than the tracks is limited', () => {
    expect(clampSpan(5, 3)).toBe(3);
    expect(placeCells([5, 1], 3).cells.map((c) => [c.line, c.track, c.span])).toEqual([
      [0, 0, 3],
      [1, 0, 1],
    ]);
  });
  it('without children, zero lines', () => {
    expect(placeCells([], 3)).toEqual({ cells: [], lines: 0 });
  });
});

describe('alignInCell', () => {
  it('start, center, end and stretch', () => {
    expect(alignInCell('start', 100, 40)).toEqual({ pos: 0, size: 40 });
    expect(alignInCell('center', 100, 40)).toEqual({ pos: 30, size: 40 });
    expect(alignInCell('end', 100, 40)).toEqual({ pos: 60, size: 40 });
    expect(alignInCell('stretch', 100, 40)).toEqual({ pos: 0, size: 100 });
  });
});
