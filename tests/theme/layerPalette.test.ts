import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_COLOR, LAYER_PALETTE } from '../../src/model';
import { LAYER_COLORS } from '../../src/theme/tokens';

describe('layer palette', () => {
  it('src/model/layers.ts mirrors the tokens layer-01…layer-10', () => {
    expect(LAYER_PALETTE.map((c) => c.toLowerCase())).toEqual([...LAYER_COLORS]);
  });

  it('is written in uppercase, as nextLayerColor compares', () => {
    for (const color of LAYER_PALETTE) expect(color).toBe(color.toUpperCase());
  });

  it('the layer of a new project uses the first color', () => {
    expect(DEFAULT_LAYER_COLOR).toBe(LAYER_PALETTE[0]);
  });
});
