import { describe, expect, it } from 'vitest';
import {
  fromMinimap,
  minimapLayout,
  toMinimap,
  unionRect,
  visibleRect,
} from '../../src/canvas/minimap';

// Contas do minimapa (proposta P3).

const BOX = { width: 100, height: 100 };

describe('minimapa', () => {
  it('a parte visível vem do viewport', () => {
    expect(
      visibleRect({ x: -100, y: -50, scale: 2 }, { width: 400, height: 200 }),
    ).toEqual({ x: 50, y: 25, width: 200, height: 100 });
  });

  it('a união contém os dois retângulos', () => {
    expect(
      unionRect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 10, height: 10 },
      ),
    ).toEqual({ x: 0, y: -5, width: 30, height: 15 });
  });

  it('enquadra o conteúdo na caixa, na proporção', () => {
    const bounds = { x: 0, y: 0, width: 200, height: 100 };
    const layout = minimapLayout(bounds, bounds, BOX);
    if (!layout) throw new Error('sem layout');
    expect(layout.scale).toBe(0.5);
    expect(layout.size).toEqual({ width: 100, height: 50 });
    expect(toMinimap(layout, { x: 100, y: 50, width: 20, height: 20 })).toEqual({
      x: 50,
      y: 25,
      width: 10,
      height: 10,
    });
  });

  it('o clique no minimapa volta para o ponto do canvas', () => {
    const bounds = { x: 100, y: 100, width: 200, height: 200 };
    const layout = minimapLayout(bounds, bounds, BOX);
    if (!layout) throw new Error('sem layout');
    expect(fromMinimap(layout, { x: 25, y: 50 })).toEqual({ x: 150, y: 200 });
  });

  it('sem área (canvas vazio) não há minimapa', () => {
    const empty = { x: 0, y: 0, width: 0, height: 0 };
    expect(minimapLayout(empty, empty, BOX)).toBeNull();
  });
});
