// L5 (#1101): the MCP raster clips the child of a `lazy-column` by its slot's box (the same
// one the app's components layer uses), like Compose's `clipToBounds`.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, createDrawingCache } from '../../src/model';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { catalog, clipProject } from '../support/material3Adoption';

describe('lazy-column: the child that goes past the box is clipped in the raster', () => {
  it('the part of the child outside the slot is not painted', () => {
    const drawing = createDrawingCache()(
      clipProject(),
      catalog,
      approximateMeasurer,
      0,
    ).get('K')!;
    const book = createFontBook();
    const raster = createRaster(400, 300);
    raster.data.fill(255);
    paintScene(
      raster,
      [{ root: drawing.root, ...(drawing.clip ? { clip: drawing.clip } : {}) }],
      measurerFor(book),
      {
        scaleX: 1,
        scaleY: 1,
        clip: { x: 0, y: 0, width: 400, height: 300 },
        fonts: book,
      },
    );
    const inked = (x: number, y: number) =>
      raster.data[(y * raster.width + x) * 4 + 1]! < 200;
    expect(inked(120, 70)).toBe(true); // inside the slot (20..160 × 20..90)
    expect(inked(180, 70)).toBe(false); // goes past the right
    expect(inked(120, 100)).toBe(false); // goes past the bottom
  });
});
