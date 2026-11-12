// A mídia do `card` (140 de altura) é recortada pelo canto arredondado do Card, mesmo quando o card
// tem sombra (o recorte ampliado do quadro com sombra é reto) e mesmo cortado por uma lazy-column
// (a caixa do Card, 200 × 40, é menor que a mídia).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, createDrawingCache } from '../../src/model';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { base, catalog, put } from '../support/material3Adoption';

function rasterOf(values: Record<string, string>) {
  let p = put(base(), {
    markingId: 'C',
    typeId: 'lazy-column',
    rect: { x: 20, y: 20, width: 200, height: 140 },
  });
  p = put(p, {
    markingId: 'K',
    typeId: 'card',
    parentId: 'C',
    rect: { x: 20, y: 20, width: 200, height: 40 },
    values: { title: 'T', media: 'https://example.com/a.jpg', ...values },
  });
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('K')!;
  const book = createFontBook();
  const raster = createRaster(260, 100);
  raster.data.fill(255);
  paintScene(
    raster,
    [{ root: drawing.root, ...(drawing.clip ? { clip: drawing.clip } : {}) }],
    measurerFor(book),
    {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 260, height: 100 },
      fonts: book,
    },
  );
  return (x: number, y: number) =>
    [0, 1, 2].map((c) => raster.data[(y * 260 + x) * 4 + c]!);
}

const white = [255, 255, 255];

describe('card: a mídia respeita o canto arredondado', () => {
  const cases: Record<string, string>[] = [
    { style: 'filled' },
    { style: 'elevated' },
    { style: 'outlined' },
    { style: 'filled', interaction: 'hovered' },
    { style: 'elevated', interaction: 'dragged' },
  ];
  for (const values of cases) {
    it(`${values.style} ${values.interaction ?? ''}`, () => {
      const px = rasterOf(values);
      // O canto de cima (raio 12): o pixel do canto exato não é da mídia.
      expect(px(20, 20)).not.toEqual(px(120, 30));
      expect(px(219, 20)).not.toEqual(px(120, 30));
      // Dentro do Card a mídia aparece.
      expect(px(120, 30)).not.toEqual(white);
      // Abaixo da caixa do Card (40) a mídia não vaza (a sombra é pálida, a mídia não).
      const below = px(120, 62);
      expect(below.every((c, i) => Math.abs(c - px(120, 30)[i]!) > 8)).toBe(true);
    });
  }
});
