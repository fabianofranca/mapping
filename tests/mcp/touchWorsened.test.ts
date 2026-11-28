import { describe, expect, it } from 'vitest';
import type { AuditFinding, TouchTargetOverlapFinding } from '../../src/model';
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
