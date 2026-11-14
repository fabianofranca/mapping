// CL2 (#896, finding 4.2 of CL1): the `cap-middle` metrics must not come rounded to whole
// px. The browser canvas returns integer ascent, descent and `H` at small sizes
// (16 px: 14, 3 and 12, when they are 14.5, 3.4 and 11.25), and the ~0.5 unit deviation left the text
// 2 to 3 screen px below the center at 420%.
import type { Text as KonvaText } from 'konva/lib/shapes/Text';
import { describe, expect, it } from 'vitest';
import { capMetricsOf } from '../../../src/canvas/components/capMiddle';

/** A font with proportions 0.906 / 0.213 / 0.703 that the browser measures rounding to the pixel. */
function roundingSample(initial: number): KonvaText {
  let size = initial;
  const sample = {
    fontSize: (value?: number) => {
      if (value === undefined) return size;
      size = value;
      return sample;
    },
    measureSize: (text: string) => ({
      width: 0,
      fontBoundingBoxAscent: Math.round(0.906 * size),
      fontBoundingBoxDescent: Math.round(0.213 * size),
      actualBoundingBoxAscent: Math.round((text === 'H' ? 0.703 : 0.75) * size),
      actualBoundingBoxDescent: 0,
    }),
  };
  return sample as unknown as KonvaText;
}

describe('capMetricsOf', () => {
  it('measures at a large size and returns the fractional metrics at the node size', () => {
    const metrics = capMetricsOf(roundingSample(16), 16);
    expect(metrics.ascent).toBeCloseTo(0.906 * 16, 1);
    expect(metrics.descent).toBeCloseTo(0.213 * 16, 1);
    expect(metrics.capHeight).toBeCloseTo(0.703 * 16, 1);
  });

  it('returns the node at the size it had', () => {
    const sample = roundingSample(16);
    capMetricsOf(sample, 16);
    expect(sample.fontSize()).toBe(16);
  });
});
