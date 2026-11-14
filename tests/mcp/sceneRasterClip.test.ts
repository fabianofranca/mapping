// L2 (#1078): the MCP raster clips the child of a slot with `clip` by the slot's box (the same
// one the canvas components layer uses); without `clip` the drawing is the usual one.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene, type SceneDrawing } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, translate, type FrameNode } from '../../src/model/components/scene';

const book = createFontBook();
const measure = measurerFor(book);

function red(x: number, width = 100): FrameNode {
  return {
    ...baseNode({ id: 'c', name: 'c', width, height: 40, transform: translate(x, 10) }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    fills: [{ type: 'solid', color: '#ff0000' }],
    children: [],
  };
}

function paint(drawings: SceneDrawing[], scale = 1): Raster {
  const raster = createRaster(Math.round(120 * scale), Math.round(60 * scale));
  raster.data.fill(255);
  paintScene(raster, drawings, measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    fonts: book,
  });
  return raster;
}

const green = (r: Raster, x: number, y: number): number =>
  r.data[(y * r.width + x) * 4 + 1]!;
const inked = (r: Raster, x: number, y: number): boolean => green(r, x, y) < 10;

const CLIP = { x: 20, y: 5, width: 30, height: 30 };

describe('clip of a slot child with clip (raster)', () => {
  it('only what is inside the slot box shows', () => {
    const r = paint([{ root: red(10), clip: CLIP }]);
    expect(inked(r, 30, 20)).toBe(true);
    expect(inked(r, 15, 20)).toBe(false); // the child starts at 10, the slot at 20
    expect(inked(r, 60, 20)).toBe(false); // goes past the slot (50)
    expect(inked(r, 30, 40)).toBe(false); // below the slot (35)
  });

  it('without clip the whole child shows', () => {
    const r = paint([{ root: red(10) }]);
    expect(inked(r, 15, 20)).toBe(true);
    expect(inked(r, 60, 20)).toBe(true);
    expect(inked(r, 105, 20)).toBe(true);
  });

  it('a child entirely outside the box disappears', () => {
    const r = paint([{ root: red(60, 40), clip: CLIP }]);
    for (let x = 0; x < r.width; x++) expect(inked(r, x, 20)).toBe(false);
  });

  it('the clip box follows the image scale (parity ≤ 0.5 px)', () => {
    const r = paint([{ root: red(10), clip: CLIP }], 2);
    const row = 40;
    let first = -1;
    let last = -1;
    for (let x = 0; x < r.width; x++)
      if (inked(r, x, row)) {
        if (first < 0) first = x;
        last = x + 1;
      }
    expect(Math.abs(first - 40)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(last - 100)).toBeLessThanOrEqual(0.5);
  });

  it('drawing in screen pixels ignores the clip', () => {
    const screen = {
      anchor: 'top-left' as const,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };
    const root = red(0);
    const r = paint([
      { root: { ...root, transform: translate(0, 0) }, screen, clip: CLIP },
    ]);
    expect(inked(r, 5, 20)).toBe(true);
    expect(inked(r, 80, 20)).toBe(true);
  });
});
