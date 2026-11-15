// Owner decision 23: in the raster too, the child of a slot with `clip` is cut by the rounded
// shapes of `clipShape`; without it the bytes are the usual ones.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene, type SceneDrawing } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, translate, type FrameNode } from '../../src/model/components/scene';

const book = createFontBook();
const measure = measurerFor(book);

const SLOT = { x: 10, y: 10, width: 100, height: 40 };

function red(): FrameNode {
  return {
    ...baseNode({
      id: 'c',
      name: 'c',
      width: 100,
      height: 40,
      transform: translate(10, 10),
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    fills: [{ type: 'solid', color: '#ff0000' }],
    children: [],
  };
}

function paint(drawing: SceneDrawing, scale = 1): Raster {
  const raster = createRaster(Math.round(120 * scale), Math.round(60 * scale));
  raster.data.fill(255);
  paintScene(raster, [drawing], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    fonts: book,
  });
  return raster;
}

const inked = (r: Raster, x: number, y: number): boolean =>
  r.data[(y * r.width + x) * 4 + 1]! < 10;

const base = (clipShape: NonNullable<SceneDrawing['clipShape']>): SceneDrawing => ({
  root: red(),
  clip: SLOT,
  clipShape,
});

describe('clipShape in the raster', () => {
  it('child filling a radius-16 slot: corner has no ink, center is painted', () => {
    const r = paint(base([{ box: SLOT, radius: 16 }]));
    expect(inked(r, 11, 11)).toBe(false);
    expect(inked(r, 108, 48)).toBe(false);
    expect(inked(r, 60, 30)).toBe(true);
    expect(inked(r, 30, 11)).toBe(true);
  });

  it('per-corner radii [16,0,0,16]: only top-left and bottom-left are cut', () => {
    const r = paint(base([{ box: SLOT, radius: [16, 0, 0, 16] }]));
    expect(inked(r, 11, 11)).toBe(false);
    expect(inked(r, 11, 48)).toBe(false);
    expect(inked(r, 108, 11)).toBe(true);
    expect(inked(r, 108, 48)).toBe(true);
  });

  it('a radius larger than half the smaller side is capped (pill)', () => {
    const r = paint(base([{ box: SLOT, radius: 500 }]));
    expect(inked(r, 11, 11)).toBe(false);
    expect(inked(r, 30, 30)).toBe(true);
    expect(inked(r, 11, 30)).toBe(true); // the middle of the left end is on the pill
  });

  it('two shapes: both cut', () => {
    const inner = { x: 30, y: 10, width: 60, height: 40 };
    const r = paint(
      base([
        { box: SLOT, radius: 16 },
        { box: inner, radius: 20 },
      ]),
    );
    expect(inked(r, 60, 30)).toBe(true);
    expect(inked(r, 31, 11)).toBe(false); // the inner corner
    expect(inked(r, 20, 30)).toBe(false); // outside the inner box
  });

  it('without clipShape the bytes are those of the rectangular clip', () => {
    const plain = paint({ root: red(), clip: SLOT });
    const empty = paint({ root: red(), clip: SLOT, clipShape: [] });
    const square = paint(base([{ box: SLOT, radius: 0 }]));
    expect(Buffer.from(empty.data).equals(Buffer.from(plain.data))).toBe(true);
    expect(Buffer.from(square.data).equals(Buffer.from(plain.data))).toBe(true);
    expect(inked(plain, 11, 11)).toBe(true);
  });

  it('a screen drawing ignores the clip shape', () => {
    const screen = {
      anchor: 'top-left' as const,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };
    const r = paint({ ...base([{ box: SLOT, radius: 16 }]), screen });
    expect(inked(r, 11, 11)).toBe(true);
  });

  it('the silhouette follows the scale (parity <= 0.5 px at scale 2)', () => {
    const r = paint(base([{ box: SLOT, radius: 16 }]), 2);
    // Row 1 px below the top of the box (raster y = 22): the span starts where the arc is.
    const row = 22;
    let first = -1;
    for (let x = 0; x < r.width; x++)
      if (inked(r, x, row)) {
        first = x;
        break;
      }
    // Circle of radius 32 centered at (52, 52): at y = 22 the left edge is 52 - sqrt(32^2 - 30^2).
    const expected = 52 - Math.sqrt(32 * 32 - 30 * 30);
    expect(Math.abs(first - expected)).toBeLessThanOrEqual(1);
  });
});
