// L5 (#1101): o raster do MCP recorta a filha de um `lazy-column` pela caixa do slot dele (a mesma
// que a camada de componentes da app usa), como o `clipToBounds` do Compose.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, createDrawingCache } from '../../src/model';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { catalog, clipProject } from '../support/material3Adoption';

describe('lazy-column: a filha que passa da caixa é recortada no raster', () => {
  it('a parte da filha fora do slot não é pintada', () => {
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
    expect(inked(120, 70)).toBe(true); // dentro do slot (20..160 × 20..90)
    expect(inked(180, 70)).toBe(false); // passa da direita
    expect(inked(120, 100)).toBe(false); // passa de baixo
  });
});
