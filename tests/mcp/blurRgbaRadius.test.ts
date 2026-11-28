// `blurRgba` clamps the box radius to the region's size: with the edge pixels repeated, a larger radius
// gives the same result, so a huge `backdropBlur` must not cost O(radius) per line.
import { describe, expect, it } from 'vitest';
import { blurRgba, boxRadiusFor } from '../../mcp/image/effects';

describe('boxRadiusFor', () => {
  it('follows sigma for small values and never exceeds the max', () => {
    expect(boxRadiusFor(0, 40)).toBe(0);
    expect(boxRadiusFor(4, 40)).toBe(4);
    expect(boxRadiusFor(1e6, 40)).toBe(40);
  });
});

describe('blurRgba with a huge sigma', () => {
  it('finishes quickly and gives a near average', () => {
    const size = 40;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data.set(x < size / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * size + x) * 4);
      }
    }
    const started = Date.now();
    blurRgba(data, size, size, 1e6);
    expect(Date.now() - started).toBeLessThan(3000);
    const first = [...data.subarray(0, 4)];
    const last = [...data.subarray(data.length - 4)];
    for (let c = 0; c < 4; c++)
      expect(Math.abs(first[c]! - last[c]!)).toBeLessThanOrEqual(60);
    expect(first[0]).toBeGreaterThan(80);
    expect(first[0]).toBeLessThan(175);
  });
});
