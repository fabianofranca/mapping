// The `card` media (140 tall) is clipped by the Card's rounded corner, even when the card
// has a shadow (the enlarged clip of the frame with a shadow is straight) and even when cut by a lazy-column
// (the Card box, 200 × 40, is smaller than the media).
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

describe('card: the media respects the rounded corner', () => {
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
      // The top corner (radius 12): the exact corner pixel is not the media's.
      expect(px(20, 20)).not.toEqual(px(120, 30));
      expect(px(219, 20)).not.toEqual(px(120, 30));
      // Inside the Card the media shows.
      expect(px(120, 30)).not.toEqual(white);
      // Below the Card box (40) the media does not leak (the shadow is pale, the media is not).
      const below = px(120, 62);
      expect(below.every((c, i) => Math.abs(c - px(120, 30)[i]!) > 8)).toBe(true);
    });
  }
});
