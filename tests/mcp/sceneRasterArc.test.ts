// FG6: an `ellipse` with `sweepAngle` in the MCP raster. The spinner's 60% arc with round caps
// paints the arc and leaves the rest of the ring with the background.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

const WHITE = [255, 255, 255, 255];
const BLUE = [37, 99, 235, 255];

function canvas(size: number): Raster {
  const raster = createRaster(size, size);
  raster.data.fill(255);
  return raster;
}

function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
}

function paint(raster: Raster, root: SceneNode) {
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
  });
}

/** A 100 × 100 ring: the spinner's arc (216 degrees from the top), 8 px wide, `inside`. */
function ring(cap: 'round' | 'butt', extra: Record<string, unknown> = {}): Raster {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'spinner',
    name: 'Spinner',
    size: { width: 100, height: 100 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'ellipse',
          width: 'fill',
          height: 'fill',
          startAngle: -90,
          sweepAngle: 216,
          stroke: { color: '#2563EB', width: 8, align: 'inside', cap },
          ...extra,
        },
      ],
    },
  };
  const out = instantiate(
    component as never,
    {},
    { x: 0, y: 0, width: 100, height: 100 },
    { measure: approximateMeasurer },
  );
  const raster = canvas(100);
  paint(raster, out.root);
  return raster;
}

describe('FG6: arc in the raster', () => {
  it('paints the arc clockwise from the top and leaves the rest of the ring in the background', () => {
    const raster = ring('round');
    // On the ring (radius 46): top, right and bottom are inside the 216° sweep...
    expect(pixel(raster, 50, 4)).toEqual(BLUE);
    expect(pixel(raster, 96, 50)).toEqual(BLUE);
    expect(pixel(raster, 50, 96)).toEqual(BLUE);
    // ...the left side (180°) and the upper-left (225°) are not.
    expect(pixel(raster, 4, 50)).toEqual(WHITE);
    expect(pixel(raster, 17, 17)).toEqual(WHITE);
    // The inside of the ring is empty (no fill, no stroke through the center).
    expect(pixel(raster, 50, 50)).toEqual(WHITE);
  });

  it('the round cap rounds the start of the arc, a butt cap stops at the start point', () => {
    // 3 px behind the start (50, 4) toward the left: only the round cap reaches it.
    expect(pixel(ring('round'), 47, 4)).toEqual(BLUE);
    expect(pixel(ring('butt'), 47, 4)).toEqual(WHITE);
  });

  it('a negative sweep goes counterclockwise and 0 draws nothing', () => {
    const left = ring('round', { sweepAngle: -216 });
    expect(pixel(left, 4, 50)).toEqual(BLUE);
    expect(pixel(left, 96, 50)).toEqual(WHITE);
    expect(ring('round', { sweepAngle: 0 }).data.every((v) => v === 255)).toBe(true);
  });
});
