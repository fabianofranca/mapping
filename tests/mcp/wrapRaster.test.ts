// MC4 (decisão 13 da #898): o raster do MCP pinta cada filho de uma fileira com `wrap` onde o modelo
// o põe, a ≤ 0,5 px (5 filhos de 100 numa row de 320, `gap` 8, `lineGap` 12, as posições do
// `FlowRow`). O Konva tem o teste dele em `tests/canvas/components/wrapParity.test.ts`.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';

const book = createFontBook();
const measure = measurerFor(book);
const COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];

function component(layout: Record<string, unknown>) {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'flow',
    name: 'Flow',
    size: { width: 320, height: 200 },
    template: {
      type: 'frame',
      layout: { type: 'row', ...layout },
      children: COLORS.map((color, i) => ({
        type: 'rect',
        name: `k${i}`,
        width: 100,
        height: 20,
        fill: color,
      })),
    },
  };
}

/** O retângulo envolvente dos pixels de uma cor (RGB exato) no raster. */
function inkBox(raster: Raster, color: string) {
  const want = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < raster.height; y++)
    for (let x = 0; x < raster.width; x++) {
      const i = (y * raster.width + x) * 4;
      if (want.every((c, k) => raster.data[i + k] === c)) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;

describe.each([
  ['wrap', { wrap: 'wrap', gap: 8, lineGap: 12 }],
  ['wrap-reverse', { wrap: 'wrap-reverse', gap: 8, lineGap: 12 }],
  [
    'space-between por linha',
    { wrap: 'wrap', gap: 8, lineGap: 12, justify: 'space-between' },
  ],
])('wrap: raster × modelo (%s)', (_name, layout) => {
  const { root } = instantiate(
    component(layout) as never,
    {},
    { x: 0, y: 0, width: 320, height: 200 },
    { measure: approximateMeasurer },
  );
  const model = absoluteBoxes(root);
  const kids = [...walk(root)].filter((n) => /^k\d$/.test(n.name ?? ''));

  it.each([1, 2])('pinta cada filho onde o modelo o pôs, a zoom %s', (zoom) => {
    const raster = createRaster(320 * zoom, 200 * zoom);
    raster.data.fill(255);
    paintScene(raster, [{ root }], measure, {
      scaleX: zoom,
      scaleY: zoom,
      clip: { x: 0, y: 0, width: raster.width, height: raster.height },
      fonts: book,
    });
    expect(kids).toHaveLength(5);
    kids.forEach((n, i) => {
      const box = model.get(n.id);
      const ink = inkBox(raster, COLORS[i] as string);
      expect(close(ink.x / zoom, box?.x ?? 0), `k${i}.x`).toBe(true);
      expect(close(ink.y / zoom, box?.y ?? 0), `k${i}.y`).toBe(true);
      expect(close(ink.width / zoom, 100), `k${i}.width`).toBe(true);
      expect(close(ink.height / zoom, 20), `k${i}.height`).toBe(true);
    });
  });
});
