// MF2 in the MCP PNG: the shadow list (the first on top), `shadow.spread` (shape, radii and
// negative) and the outline with a rounded gap (`stroke.gaps`).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { baseNode, type SceneNode, type Shadow } from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

const solid = (color: string) => ({ type: 'solid' as const, color });
const WHITE = [255, 255, 255, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}
const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

function paint(raster: Raster, root: SceneNode): void {
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    scaleX: 1,
    scaleY: 1,
  });
}

/** A 20×20 rectangle at (20,20), without fill: only the shadow shows. */
const ghost = (effects: Shadow[], radius = 0): SceneNode => ({
  ...baseNode({ id: 'r', name: 'r', width: 20, height: 20, effects }),
  type: 'rect',
  cornerRadius: radius,
  transform: [1, 0, 0, 1, 20, 20],
});

const sharp = (color: string, spread?: number, x = 0, y = 0): Shadow => ({
  color,
  offset: { x, y },
  blur: 0,
  ...(spread === undefined ? {} : { spread }),
});

describe('shadow.spread in the raster', () => {
  it('the spread grows the shadow shape on each side', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4)]));
    expect(pixel(raster, 17, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 15, 30)).toEqual(WHITE);
    expect(pixel(raster, 43, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 45, 30)).toEqual(WHITE);
  });

  it('the corner radius grows with the spread (corner of radius 4 + 4 = 8)', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4)], 4));
    // The shadow shape goes from (16,16) to (44,44): the square corner would be at (16,16).
    expect(pixel(raster, 17, 17)).toEqual(WHITE);
    expect(pixel(raster, 24, 24)).toEqual([255, 0, 0, 255]);
  });

  it('o spread negativo encolhe a sombra', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', -4)]));
    expect(pixel(raster, 22, 30)).toEqual(WHITE);
    expect(pixel(raster, 25, 30)).toEqual([255, 0, 0, 255]);
  });

  it('without spread the shadow is the node shape', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', undefined, 2, 0)]));
    expect(pixel(raster, 21, 30)).toEqual(WHITE);
    expect(pixel(raster, 23, 30)).toEqual([255, 0, 0, 255]);
  });
});

describe('shadow list in the raster', () => {
  it('the first shadow in the list is on top of the second', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 4), sharp('#0000ff', 4)]));
    expect(pixel(raster, 17, 30)).toEqual([255, 0, 0, 255]);
  });

  it('both show where they do not overlap', () => {
    const raster = canvas(60, 60);
    paint(raster, ghost([sharp('#ff0000', 2), sharp('#0000ff', 6)]));
    expect(pixel(raster, 19, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 17, 30)).toEqual([0, 0, 255, 255]);
  });
});

describe('outline with a gap (stroke.gaps) in the raster', () => {
  const outlined = (): SceneNode => ({
    ...baseNode({ id: 'o', name: 'o', width: 40, height: 24 }),
    type: 'rect',
    cornerRadius: 6,
    transform: [1, 0, 0, 1, 10, 10],
    stroke: {
      paints: [solid('#ff0000')],
      width: 2,
      align: 'center',
      gaps: [{ side: 'top', from: 16, to: 30 }],
    },
  });

  it('the top side disappears in the gap span and stays outside it', () => {
    const raster = canvas(60, 50);
    paint(raster, outlined());
    expect(pixel(raster, 10 + 22, 10)).toEqual(WHITE); // in the gap
    expect(pixel(raster, 10 + 34, 10)).toEqual([255, 0, 0, 255]); // after the gap
    expect(pixel(raster, 10 + 10, 10)).toEqual([255, 0, 0, 255]); // before the gap
  });

  it('the four corners follow the radius and the other sides stay whole', () => {
    const raster = canvas(60, 50);
    paint(raster, outlined());
    expect(pixel(raster, 10, 10)).toEqual(WHITE); // o canto reto ficaria aqui
    const k = Math.round(6 * (1 - Math.SQRT1_2));
    expect(pixel(raster, 10 + k, 10 + k)[1]).toBeLessThan(200); // o arco passa por aqui
    expect(pixel(raster, 10, 22)).toEqual([255, 0, 0, 255]); // lado esquerdo
    expect(pixel(raster, 49, 22)).toEqual([255, 0, 0, 255]); // lado direito
    expect(pixel(raster, 30, 33)).toEqual([255, 0, 0, 255]); // embaixo
    expect(pixel(raster, 10 + 40 - k - 1, 10 + 24 - k - 1)[1]).toBeLessThan(200); // bottom corner
  });
});

describe('shadow list on a node that is not a frame, rect or ellipse', () => {
  it('draws only the first shadow, like the app', () => {
    const line: SceneNode = {
      ...baseNode({
        id: 'p',
        name: 'p',
        width: 20,
        height: 20,
        effects: [sharp('#ff0000', undefined, 0, 0), sharp('#0000ff', undefined, 8, 0)],
        fills: [],
      }),
      type: 'path',
      d: 'M0 0H20V20H0Z',
      fillRule: 'nonzero',
      transform: [1, 0, 0, 1, 10, 10],
    };
    const raster = canvas(60, 40);
    paint(raster, line);
    expect(pixel(raster, 15, 20)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 35, 20)).toEqual(WHITE);
  });
});
