import { describe, expect, it } from 'vitest';
import type { AuditFinding } from '../../src/model';
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
