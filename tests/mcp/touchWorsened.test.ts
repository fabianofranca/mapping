import { describe, expect, it } from 'vitest';
import type {
  AuditFinding,
  TouchTargetOverlapFinding,
  TouchTargetSmallFinding,
} from '../../src/model';
import { worsened } from '../../mcp/drawingProof';

// Phase A6 (R2): a touch finding the batch makes worse is reported again; an unchanged or better one is not.

const finding = (
  actual: [number, number],
  min: [number, number] = [44, 44],
): AuditFinding => ({
  code: 'touch-target-small',
  annotationId: 'A1',
  markingId: 'M1',
  actual: { width: actual[0], height: actual[1] },
  min: { width: min[0], height: min[1] },
  minPx: { width: min[0], height: min[1] },
  density: 1,
});

describe('worsened', () => {
  it('a finding with no earlier one is news', () => {
    expect(worsened(undefined, finding([20, 20]))).toBe(true);
  });

  it('40 × 44 shrunk to 20 × 20 is worse', () => {
    expect(worsened(finding([40, 44]), finding([20, 20]))).toBe(true);
  });

  it('a type change that raises the minimum is worse', () => {
    expect(worsened(finding([40, 44], [44, 44]), finding([40, 44], [48, 48]))).toBe(true);
  });

  it('the same or a larger actual, with the same minimum, is not repeated', () => {
    expect(worsened(finding([40, 44]), finding([40, 44]))).toBe(false);
    expect(worsened(finding([40, 44]), finding([42, 44]))).toBe(false);
  });
});

// Stage #1998 (TA2): an overlap is keyed by the other annotation; it is news when it is new or a side grew.
const overlap = (
  size: [number, number],
  other = 'A2',
  annotationId = 'A1',
): TouchTargetOverlapFinding => ({
  code: 'touch-target-overlap',
  annotationId,
  markingId: 'M1',
  other: { annotationId: other, markingId: `M_${other}` },
  overlap: { width: size[0], height: size[1] },
  overlapPx: { width: size[0], height: size[1] },
  density: 1,
});

describe('worsened: touch-target-overlap', () => {
  it('an overlap with no earlier one is news', () => {
    expect(worsened(undefined, overlap([4, 48]))).toBe(true);
  });

  it('an unchanged or smaller overlap is not repeated', () => {
    expect(worsened(overlap([4, 48]), overlap([4, 48]))).toBe(false);
    expect(worsened(overlap([4, 48]), overlap([2, 48]))).toBe(false);
  });

  it('a side that grew is news', () => {
    expect(worsened(overlap([4, 48]), overlap([6, 48]))).toBe(true);
    expect(worsened(overlap([4, 48]), overlap([4, 50]))).toBe(true);
  });

  it('a touch-target-small and an overlap never stand for each other', () => {
    expect(worsened(finding([40, 44]), overlap([4, 48]))).toBe(true);
    expect(worsened(overlap([4, 48]), finding([40, 44]))).toBe(true);
  });
});

// Stage #1998 (TA4): a spacing failure is a `touch-target-small` with a `spacing` neighbor; the rule is the same.
const spaced = (
  actual: [number, number],
  other = 'A2',
  min: [number, number] = [24, 24],
): AuditFinding => ({
  ...(finding(actual, min) as TouchTargetSmallFinding),
  spacing: { other: { annotationId: other, markingId: `M_${other}` } },
});

describe('worsened: touch-target-small with the spacing', () => {
  it('a spacing failure on an annotation that had no small finding is news', () => {
    expect(worsened(undefined, spaced([20, 20]))).toBe(true);
  });

  it('a spacing failure that is unchanged is not repeated', () => {
    expect(worsened(spaced([20, 20]), spaced([20, 20]))).toBe(false);
  });

  it('a side that shrank is news', () => {
    expect(worsened(spaced([22, 22]), spaced([20, 22]))).toBe(true);
    expect(worsened(spaced([22, 22]), spaced([22, 20]))).toBe(true);
  });

  it('a change of the named neighbor alone is not news', () => {
    expect(worsened(spaced([20, 20], 'A2'), spaced([20, 20], 'A3'))).toBe(false);
  });

  it('an undersized finding without spacing before and a spacing failure after, same size, is not repeated', () => {
    expect(worsened(finding([20, 20], [24, 24]), spaced([20, 20]))).toBe(false);
  });
});
