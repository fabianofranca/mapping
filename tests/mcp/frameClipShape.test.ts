import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, type FrameNode } from '../../src/model/components/scene';

// CL1 / D3: o quadro com `clip` recorta pela forma (raio de canto), não pelo retângulo.

const book = createFontBook();
const measure = measurerFor(book);

function render(cornerRadius: number): ReturnType<typeof createRaster> {
  const raster = createRaster(40, 40);
  raster.data.fill(255);
  const child: FrameNode = {
    ...baseNode({
      id: 'c',
      name: 'c',
      width: 40,
      height: 40,
      fills: [{ type: 'solid', color: '#ff0000' }],
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [],
  };
  const root: FrameNode = {
    ...baseNode({ id: 'root', name: 'root', width: 40, height: 40 }),
    type: 'frame',
    clip: true,
    cornerRadius,
    children: [child],
  };
  paintScene(raster, [{ root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 40, height: 40 },
    fonts: book,
  });
  return raster;
}

const green = (r: ReturnType<typeof createRaster>, x: number, y: number): number =>
  r.data[(y * r.width + x) * 4 + 1]!;

describe('recorte do quadro pela forma', () => {
  it('com raio circular o canto fica sem tinta e o centro pintado', () => {
    const r = render(20);
    expect(green(r, 1, 1)).toBe(255);
    expect(green(r, 20, 20)).toBeLessThan(10);
  });
  it('sem raio o retângulo todo é pintado', () => {
    const r = render(0);
    expect(green(r, 1, 1)).toBeLessThan(10);
  });
});
