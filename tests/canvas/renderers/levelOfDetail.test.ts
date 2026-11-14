import { describe, expect, it } from 'vitest';
import {
  levelOfDetail,
  type LevelOfDetailInput,
} from '../../../src/canvas/renderers/levelOfDetail';

const base = { always: false, minFull: 24, hide: 2 } as const;
const lod = (
  screenWidth: number,
  screenHeight: number,
  extra: Partial<LevelOfDetailInput> = {},
) => levelOfDetail({ ...base, screenWidth, screenHeight, ...extra });

describe('levelOfDetail', () => {
  it('24×24 or larger is full', () => {
    expect(lod(24, 24)).toBe('full');
    expect(lod(500, 300)).toBe('full');
  });

  it('below 24 px in width or height: only the border', () => {
    expect(lod(23, 100)).toBe('border');
    expect(lod(100, 23)).toBe('border');
    expect(lod(23.9, 23.9)).toBe('border');
  });

  it('below 2 px in both measures: not drawn; in only one of them, border', () => {
    expect(lod(2, 1)).toBe('border');
    expect(lod(1, 2)).toBe('border');
    expect(lod(1, 1)).toBe('hidden');
    expect(lod(1.9, 1.9)).toBe('hidden');
    expect(lod(1, 300)).toBe('border');
  });

  it('selected, under the mouse or with a review mark: full at any size', () => {
    expect(lod(1, 1, { always: true })).toBe('full');
    expect(lod(10, 10, { always: true })).toBe('full');
  });
});
