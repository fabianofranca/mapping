// Icon `fillRule` (icons file formatVersion 3) in the MCP PNG: the hole of an `evenodd` icon.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { parseIconsFile } from '../../src/model/components/icons';
import type { IconSet } from '../../src/model/components/icons';
import { instantiate } from '../../src/model/components/instantiate';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

const WHITE = [255, 255, 255, 255];
const INK = [255, 0, 255, 255];

// Two concentric circles in one `d`, both drawn in the same direction: the inner one is a
// hole only with `evenodd`.
const RING =
  'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12z';
// A self-intersecting pentagram: its middle is wound twice (filled with `nonzero`, empty with
// `evenodd`).
const STAR = 'M12 2 L19 22 L2 9 H22 L5 22 Z';

function icons(rule: 'nonzero' | 'evenodd' | undefined): IconSet {
  const paths = (d: string) => [rule === undefined ? { d } : { d, fillRule: rule }];
  const result = parseIconsFile({
    format: 'mapping-icons',
    formatVersion: 3,
    viewBox: [24, 24],
    icons: { ring: { paths: paths(RING) }, star: { paths: paths(STAR) } },
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.set;
}

function draw(name: string, rule: 'nonzero' | 'evenodd' | undefined): Raster {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 24, height: 24 },
    template: {
      type: 'frame',
      children: [{ type: 'icon', name, color: '#FF00FF' }],
    },
  } as unknown as ComponentFile;
  const { root } = instantiate(
    component,
    {},
    { x: 0, y: 0, width: 24, height: 24 },
    { measure: approximateMeasurer, icons: icons(rule) },
  );
  const raster = createRaster(24, 24);
  raster.data.fill(255);
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: 24, height: 24 },
    scaleX: 1,
    scaleY: 1,
  });
  return raster;
}

const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

describe('icon fillRule in the raster', () => {
  it('a ring icon: the background color at the center with evenodd, the icon color with nonzero', () => {
    const evenodd = draw('ring', 'evenodd');
    expect(pixel(evenodd, 12, 12)).toEqual(WHITE);
    // The band between the two circles stays filled, and the outside stays empty.
    expect(pixel(evenodd, 12, 4)).toEqual(INK);
    expect(pixel(evenodd, 0, 0)).toEqual(WHITE);

    const nonzero = draw('ring', 'nonzero');
    expect(pixel(nonzero, 12, 12)).toEqual(INK);
    expect(pixel(nonzero, 12, 4)).toEqual(INK);
  });

  it('without the key the rule is nonzero', () => {
    expect(pixel(draw('ring', undefined), 12, 12)).toEqual(INK);
  });

  it('a self-intersecting star: the center is empty with evenodd and filled with nonzero', () => {
    expect(pixel(draw('star', 'evenodd'), 12, 12)).toEqual(WHITE);
    expect(pixel(draw('star', 'nonzero'), 12, 12)).toEqual(INK);
    // A point of the star's arm is filled in both rules.
    expect(pixel(draw('star', 'evenodd'), 12, 5)).toEqual(INK);
  });
});
