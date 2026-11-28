// DG3: in the MCP raster, partial `sides` follow the corner arcs (the model's band polygons) and
// `stroke.cornerRadius` gives the outline its own radius. Probes: the Divider and the Link ring.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

/** The red channel of a pixel: 31 is the stroke (#1F2937), 255 the white background. */
function red(raster: Raster, x: number, y: number): number {
  return raster.data[(y * raster.width + x) * 4]!;
}
const INK = 'ink';
const WHITE = 'white';

/** `ink` (mostly the stroke) or `white` (mostly bare); a pixel in between reads as `edge`. */
function pixel(raster: Raster, x: number, y: number): string {
  const r = red(raster, x, y);
  return r < 90 ? INK : r > 240 ? WHITE : 'edge';
}

/** Paints `node` (a rect of `width` × `height`, at (`pad`, `pad`)) on a white canvas. */
function paintRect(
  node: Record<string, unknown>,
  width: number,
  height: number,
  pad = 0,
): Raster {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'probe',
    name: 'Probe',
    size: { width: width + 2 * pad, height: height + 2 * pad },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'rect',
          anchors: { centerX: true, centerY: true },
          width,
          height,
          ...node,
        },
      ],
    },
  };
  const w = width + 2 * pad;
  const h = height + 2 * pad;
  const out = instantiate(
    component as never,
    {},
    { x: 0, y: 0, width: w, height: h },
    { measure: approximateMeasurer },
  );
  const raster = createRaster(w, h);
  raster.data.fill(255);
  paintScene(raster, [{ root: out.root as SceneNode }], approximateMeasurer, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: w, height: h },
  });
  return raster;
}

describe('partial sides follow the radius (the Divider)', () => {
  // A 200 × 16 pill, width 2, only the bottom side.
  const divider = (extra: Record<string, unknown> = {}): Raster =>
    paintRect(
      {
        cornerRadius: 8,
        stroke: {
          color: '#1F2937',
          width: 2,
          align: 'inside',
          sides: ['bottom'],
          ...extra,
        },
      },
      200,
      16,
    );

  it('the bottom middle is the stroke color, the side middle and the top are not', () => {
    const raster = divider();
    expect(pixel(raster, 100, 15)).toEqual(INK);
    expect(pixel(raster, 100, 14)).toEqual(INK);
    expect(pixel(raster, 100, 13)).toEqual(WHITE);
    expect(pixel(raster, 0, 8)).toEqual(WHITE);
    expect(pixel(raster, 199, 8)).toEqual(WHITE);
    expect(pixel(raster, 100, 0)).toEqual(WHITE);
  });

  it('the stroke follows the bottom arcs: it covers them, tapering toward the side', () => {
    const raster = divider();
    // At 135° on the bottom-left arc, between the circle (r 8) and the tapered inner curve.
    expect(pixel(raster, 2, 13)).toEqual(INK);
    expect(pixel(raster, 197, 13)).toEqual(INK);
    // A straight line would have left the arc, past x = 8, bare.
    expect(pixel(raster, 1, 10)).toEqual(WHITE);
  });

  it('`dash` keeps the straight segments (today)', () => {
    const raster = divider({ dash: [1000] });
    expect(pixel(raster, 100, 15)).toEqual(INK);
    expect(pixel(raster, 2, 13)).toEqual(WHITE);
  });
});

describe('stroke.cornerRadius (the Link ring)', () => {
  // A 40 × 20 box with radius 0 and a 2 px inside ring 2 px away: 4 outside, 2 inside.
  const ring = (cornerRadius: number | undefined): Raster =>
    paintRect(
      {
        cornerRadius: 0,
        stroke: {
          color: '#1F2937',
          width: 2,
          align: 'inside',
          offset: 2,
          ...(cornerRadius === undefined ? {} : { cornerRadius }),
        },
      },
      40,
      20,
      10,
    );

  it('rounds the ring: the outer corner tip is bare, the straight sides are painted', () => {
    const rounded = ring(4);
    expect(pixel(rounded, 8, 8)).toEqual(WHITE); // the square tip is gone
    expect(pixel(rounded, 30, 8)).toEqual(INK); // the top of the ring, 2 px above the box
    expect(pixel(rounded, 9, 9)).toEqual(INK); // on the arc, between radius 2 and 4
  });

  it('without it the ring corner is square, as before', () => {
    expect(pixel(ring(undefined), 8, 8)).toEqual(INK);
  });
});
