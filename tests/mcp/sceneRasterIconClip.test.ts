import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import type { IconSet } from '../../src/model/components/icons';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

// The clip of an icon (icons file formatVersion 4) in the MCP raster: the group's children go through
// the mask of the flattened `clip` path, under the fill rule and the `viewBox` matrix (mirrored in `rtl`).

const SQUARE = 'M0 0h24v24H0z';
const CIRCLE = 'M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24z';

const icons: IconSet = {
  viewBox: [24, 24],
  icons: {
    round: { clip: { d: CIRCLE }, paths: [{ d: SQUARE, fill: true }] },
    holed: {
      clip: { d: `${SQUARE}M8 8h8v8H8z`, fillRule: 'evenodd' },
      paths: [{ d: SQUARE, fill: true }],
    },
    nonzeroHole: {
      clip: { d: `${SQUARE}M8 8h8v8H8z` },
      paths: [{ d: SQUARE, fill: true }],
    },
    left: { clip: { d: 'M0 0h12v24H0z' }, paths: [{ d: SQUARE, fill: true }] },
    ramp: {
      clip: { d: CIRCLE },
      paths: [
        {
          d: SQUARE,
          fill: {
            type: 'linear',
            from: [0, 0],
            to: [24, 0],
            stops: [
              { offset: 0, color: '#FF0000' },
              { offset: 1, color: '#0000FF' },
            ],
          },
        },
      ],
    },
    empty: { clip: { d: 'M0 0' }, paths: [{ d: SQUARE, fill: true }] },
    stroked: {
      clip: { d: 'M0 0h12v24H0z' },
      paths: [{ d: 'M0 12h24', stroke: true, width: 4 }],
    },
  },
};

const component = (children: unknown[]): ComponentFile =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 48, height: 48 },
    template: { type: 'frame', clip: false, children },
  }) as unknown as ComponentFile;

function draw(
  name: string,
  extra: Record<string, unknown> = {},
  direction?: 'rtl',
): Raster {
  const { root, warnings } = instantiate(
    component([
      { type: 'icon', name, color: '#00AA77', width: 48, height: 48, ...extra },
    ]),
    {},
    { x: 0, y: 0, width: 48, height: 48 },
    { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) },
  );
  expect(warnings).toEqual([]);
  const raster = createRaster(48, 48);
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 48, height: 48 },
  });
  return raster;
}

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
};

function near(actual: number[], expected: number[], tolerance = 4): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) =>
    expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(tolerance),
  );
}

describe('MCP raster: icon clip', () => {
  it('paints the path inside the circle and leaves the outside transparent', () => {
    const raster = draw('round');
    near(pixel(raster, 24, 24), [0, 170, 119, 255]);
    expect(pixel(raster, 2, 2)[3]).toBe(0);
    expect(pixel(raster, 45, 45)[3]).toBe(0);
    near(pixel(raster, 24, 4), [0, 170, 119, 255]);
  });

  it('an evenodd clip with a hole leaves the hole empty', () => {
    const raster = draw('holed');
    expect(pixel(raster, 24, 24)[3]).toBe(0);
    near(pixel(raster, 4, 4), [0, 170, 119, 255]);
    near(pixel(raster, 44, 24), [0, 170, 119, 255]);
  });

  it('the same clip under nonzero has no hole (same winding)', () => {
    near(pixel(draw('nonzeroHole'), 24, 24), [0, 170, 119, 255]);
  });

  it('the rtl mirror flips an off-center clip', () => {
    const ltr = draw('left', { mirror: true });
    near(pixel(ltr, 10, 24), [0, 170, 119, 255]);
    expect(pixel(ltr, 38, 24)[3]).toBe(0);
    const rtl = draw('left', { mirror: true }, 'rtl');
    expect(pixel(rtl, 10, 24)[3]).toBe(0);
    near(pixel(rtl, 38, 24), [0, 170, 119, 255]);
  });

  it('a gradient path under the clip paints the ramp', () => {
    const raster = draw('ramp');
    near(pixel(raster, 12, 24), [191, 0, 64, 255]);
    near(pixel(raster, 36, 24), [64, 0, 191, 255]);
    expect(pixel(raster, 2, 2)[3]).toBe(0);
  });

  it('a clip with no area clips everything (like the app), without NaN regions', () => {
    const raster = draw('empty');
    expect(pixel(raster, 24, 24)[3]).toBe(0);
    expect(pixel(raster, 2, 2)[3]).toBe(0);
  });

  it('clips the stroke of a path too', () => {
    const raster = draw('stroked');
    near(pixel(raster, 10, 24), [0, 170, 119, 255]);
    expect(pixel(raster, 38, 24)[3]).toBe(0);
  });
});
