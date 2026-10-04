import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_COLOR, LAYER_PALETTE } from '../../src/model';
import { LAYER_COLORS } from '../../src/theme/tokens';

describe('paleta de camadas', () => {
  it('src/model/layers.ts espelha os tokens layer-01…layer-10', () => {
    expect(LAYER_PALETTE.map((c) => c.toLowerCase())).toEqual([...LAYER_COLORS]);
  });

  it('é escrita em maiúsculas, como nextLayerColor compara', () => {
    for (const color of LAYER_PALETTE) expect(color).toBe(color.toUpperCase());
  });

  it('a camada de um projeto novo usa a primeira cor', () => {
    expect(DEFAULT_LAYER_COLOR).toBe(LAYER_PALETTE[0]);
  });
});
