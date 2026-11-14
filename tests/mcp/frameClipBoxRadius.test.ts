import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, type FrameNode } from '../../src/model/components/scene';

// CL2 (1.6 of the retest): a frame with a shadow (enlarged clip, `clipBox`) and a rounded corner clips
// the content by the shape (the radius), not by the enlarged rectangle: the child's corner does not come out square.

const book = createFontBook();
const measure = measurerFor(book);
const PAD = 10;

function render(cornerRadius: number, clipBox: boolean) {
  const raster = createRaster(40 + 2 * PAD, 40 + 2 * PAD);
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
    ...baseNode({
      id: 'root',
      name: 'root',
      transform: [1, 0, 0, 1, PAD, PAD],
      width: 40,
      height: 40,
    }),
    type: 'frame',
    clip: true,
    ...(clipBox ? { clipBox: { x: -8, y: -8, width: 56, height: 56 } } : {}),
    cornerRadius,
    children: [child],
  };
  paintScene(raster, [{ root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    fonts: book,
  });
  return (x: number, y: number): number =>
    raster.data[((y + PAD) * raster.width + x + PAD) * 4 + 1]!;
}

describe('enlarged clip of a frame with a radius', () => {
  it("with a shadow (clipBox) and a radius the child's corner has no ink and the center is painted", () => {
    const green = render(20, true);
    expect(green(1, 1)).toBe(255);
    expect(green(20, 20)).toBeLessThan(10);
  });
  it('with clipBox and no radius the whole rectangle is painted', () => {
    expect(render(0, true)(1, 1)).toBeLessThan(10);
  });
});
