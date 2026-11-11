import { describe, expect, it } from 'vitest';
import { paintContainerDrawings } from '../../mcp/image/containerDrawing';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { setFieldValue } from '../../src/model';
import { add, baseProject, cat } from '../model/providedFixtures';

// MF3 (decisões 8 e 9): o PNG do MCP de uma filha sozinha (`render_marking`: `markingIds`) usa o
// valor oferecido pelo ancestral (o cache calcula o projeto inteiro), e sem ancestral vale o default.

function paint(project: ReturnType<typeof baseProject>, only: string): Raster {
  const raster = createRaster(1000, 800);
  raster.data.fill(255);
  paintContainerDrawings(
    raster,
    { project, catalog: cat },
    'I1',
    { scaleX: 1, scaleY: 1, clip: { x: 0, y: 0, width: 1000, height: 800 } },
    { markingIds: new Set([only]) },
  );
  return raster;
}

/** Quantos pixels têm o canal `channel` (0 = R, 2 = B) dominante sobre os outros dois. */
function dominant(raster: Raster, channel: 0 | 1 | 2): number {
  let count = 0;
  for (let i = 0; i < raster.data.length; i += 4) {
    const own = raster.data[i + channel]!;
    const others = [0, 1, 2].filter((c) => c !== channel).map((c) => raster.data[i + c]!);
    if (own > 150 && others.every((v) => v < 100)) count += 1;
  }
  return count;
}

describe('render_marking de uma filha com cor herdada', () => {
  it('a filha sozinha usa a cor do ancestral e acompanha a troca do campo dele', () => {
    let p = add(baseProject(), 'P', 'panel', {
      rect: { x: 100, y: 100, width: 300, height: 100 },
    });
    p = add(p, 'L', 'label', { parentId: 'P' });
    expect(dominant(paint(p, 'L'), 2)).toBeGreaterThan(0);
    expect(dominant(paint(p, 'L'), 0)).toBe(0);
    p = setFieldValue(p, 'A_P', 'ink', '#ff0000');
    expect(dominant(paint(p, 'L'), 0)).toBeGreaterThan(0);
    expect(dominant(paint(p, 'L'), 2)).toBe(0);
  });

  it('sem ancestral que ofereça vale o default (cinza: nem vermelho nem azul)', () => {
    const p = add(baseProject(), 'L', 'label');
    const raster = paint(p, 'L');
    expect(dominant(raster, 0)).toBe(0);
    expect(dominant(raster, 2)).toBe(0);
  });
});
