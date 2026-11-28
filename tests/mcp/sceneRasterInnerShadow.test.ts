// DX2 in the MCP PNG: the inner shadow (CSS `inset`) — clipped by the outline, above the fill and
// below the stroke, with offset, `spread` and blur, in list order (the first on top).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { baseNode, type SceneNode, type Shadow } from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];

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

/** A 20×20 shape at (20,20) with a white fill, so only the inner shadow changes it. */
function shape(
  type: 'rect' | 'ellipse' | 'frame',
  effects: Shadow[],
  extra: Record<string, unknown> = {},
): SceneNode {
  return {
    ...baseNode({
      id: 'r',
      name: 'r',
      width: 20,
      height: 20,
      effects,
      fills: [{ type: 'solid', color: '#ffffff' }],
      ...extra,
    }),
    type,
    cornerRadius: 0,
    transform: [1, 0, 0, 1, 20, 20],
    ...(type === 'frame' ? { clip: false, children: [] } : {}),
  } as SceneNode;
}

const inner = (extra: Partial<Shadow> = {}): Shadow => ({
  color: '#ff0000',
  offset: { x: 0, y: 0 },
  blur: 0,
  inner: true,
  ...extra,
});

describe('inner shadow in the raster', () => {
  it('spread makes a sharp ring inside the shape, never outside', () => {
    const raster = canvas(60, 60);
    paint(raster, shape('rect', [inner({ spread: 3 })]));
    expect(pixel(raster, 21, 30)).toEqual(RED);
    expect(pixel(raster, 22, 30)).toEqual(RED);
    expect(pixel(raster, 24, 30)).toEqual(WHITE);
    expect(pixel(raster, 30, 30)).toEqual(WHITE);
    // Outside the shape nothing is painted.
    expect(pixel(raster, 18, 30)).toEqual(WHITE);
    expect(pixel(raster, 15, 30)).toEqual(WHITE);
  });

  it('the offset moves the hole: only the sides it leaves uncovered are shaded', () => {
    const raster = canvas(60, 60);
    paint(raster, shape('rect', [inner({ spread: 0, offset: { x: 4, y: 0 } })]));
    // The hole moved right by 4: the left strip (x 20..24) is shaded; the right side is not.
    expect(pixel(raster, 21, 30)).toEqual(RED);
    expect(pixel(raster, 23, 30)).toEqual(RED);
    expect(pixel(raster, 26, 30)).toEqual(WHITE);
    expect(pixel(raster, 38, 30)).toEqual(WHITE);
  });

  it('the blur softens the edge of the ring (a partial color, only inside the shape)', () => {
    const raster = canvas(60, 60);
    paint(raster, shape('rect', [inner({ spread: 2, blur: 8 })]));
    const [r, g] = pixel(raster, 23, 30) as [number, number];
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(255);
    expect(pixel(raster, 18, 30)).toEqual(WHITE);
    expect(pixel(raster, 41, 30)).toEqual(WHITE);
  });

  it('the first of the list stays on top', () => {
    const raster = canvas(60, 60);
    paint(
      raster,
      shape('rect', [
        inner({ color: '#0000ff', spread: 3 }),
        inner({ color: '#ff0000', spread: 3 }),
      ]),
    );
    expect(pixel(raster, 21, 30)).toEqual([0, 0, 255, 255]);
  });

  it('it goes above the fill and below the stroke', () => {
    const raster = canvas(60, 60);
    const stroke = {
      paints: [{ type: 'solid' as const, color: '#00ff00' }],
      width: 2,
      align: 'inside' as const,
    };
    paint(raster, shape('rect', [inner({ spread: 4 })], { stroke }));
    expect(pixel(raster, 20, 30)).toEqual([0, 255, 0, 255]);
    expect(pixel(raster, 23, 30)).toEqual(RED);
  });

  it('the ellipse is shaded along its outline (a corner of the box stays white)', () => {
    const raster = canvas(60, 60);
    paint(raster, shape('ellipse', [inner({ spread: 3 })]));
    expect(pixel(raster, 21, 30)).toEqual(RED);
    expect(pixel(raster, 30, 30)).toEqual(WHITE);
    expect(pixel(raster, 21, 21)).toEqual(WHITE);
  });

  it('a spread that closes the hole shades the whole shape', () => {
    const raster = canvas(60, 60);
    paint(raster, shape('rect', [inner({ spread: 12 })]));
    expect(pixel(raster, 30, 30)).toEqual(RED);
  });

  it('outer shadows still draw below the node (existing behavior untouched)', () => {
    const raster = canvas(60, 60);
    const outer: Shadow = {
      color: '#0000ff',
      offset: { x: 0, y: 0 },
      blur: 0,
      spread: 4,
    };
    paint(raster, shape('rect', [outer, inner({ spread: 3 })]));
    expect(pixel(raster, 17, 30)).toEqual([0, 0, 255, 255]);
    expect(pixel(raster, 21, 30)).toEqual(RED);
  });

  /** A 48×48 ring (outer square 4..44, hole 14..34, `evenodd`) at (6,6). */
  function ring(effects: Shadow[], type: 'path' | 'icon' = 'path'): SceneNode {
    const d = 'M4 4H44V44H4Z M14 14H34V34H14Z';
    const path = {
      ...baseNode({
        id: 'p',
        name: 'p',
        width: 48,
        height: 48,
        effects: type === 'path' ? effects : [],
        fills: [{ type: 'solid', color: '#ffffff' }],
      }),
      type: 'path',
      d,
      fillRule: 'evenodd',
      transform: type === 'path' ? [1, 0, 0, 1, 6, 6] : [1, 0, 0, 1, 0, 0],
    } as unknown as SceneNode;
    if (type === 'path') return path;
    return {
      ...baseNode({ id: 'g', name: 'g', width: 48, height: 48, effects }),
      type: 'group',
      transform: [1, 0, 0, 1, 6, 6],
      children: [path],
    } as unknown as SceneNode;
  }

  it.each(['path', 'icon'] as const)(
    'a %s ring is darker at the edges of its band than at the middle; hole and outside stay',
    (type) => {
      const raster = canvas(60, 60);
      paint(raster, ring([inner({ color: '#000000', blur: 4 })], type));
      const red = (x: number, y: number) => pixel(raster, x, y)[0]!;
      // The band is 4..14 in the path: x 10..20 on the raster; its middle is x 15.
      expect(red(11, 30)).toBeLessThan(red(15, 30));
      expect(red(19, 30)).toBeLessThan(red(15, 30));
      // The hole (x 20..40) and the outside (x < 10) are not shaded.
      expect(pixel(raster, 30, 30)).toEqual(WHITE);
      expect(pixel(raster, 5, 30)).toEqual(WHITE);
    },
  );

  it('an icon with two separate paths shades each glyph, never the gap', () => {
    const glyph = (id: string, x: number) =>
      ({
        ...baseNode({
          id,
          name: id,
          width: 20,
          height: 20,
          fills: [{ type: 'solid', color: '#ffffff' }],
        }),
        type: 'path',
        d: 'M0 0H10V20H0Z',
        fillRule: 'nonzero',
        transform: [1, 0, 0, 1, x, 0],
      }) as unknown as SceneNode;
    const root = {
      ...baseNode({
        id: 'g',
        name: 'g',
        width: 30,
        height: 20,
        effects: [inner({ offset: { x: 4, y: 0 }, spread: 3 })],
      }),
      type: 'group',
      transform: [1, 0, 0, 1, 10, 20],
      children: [glyph('a', 0), glyph('b', 20)],
    } as unknown as SceneNode;
    const raster = canvas(60, 60);
    paint(raster, root);
    // The hole moved right by 4: each glyph's left strip is shaded (spread is ignored).
    expect(pixel(raster, 11, 30)).toEqual(RED);
    expect(pixel(raster, 31, 30)).toEqual(RED);
    expect(pixel(raster, 16, 30)).toEqual(WHITE);
    // The gap between the glyphs (x 20..30) is not shaded.
    expect(pixel(raster, 25, 30)).toEqual(WHITE);
  });

  it('a list on a path draws the first outer shadow and every inner one', () => {
    const outer: Shadow = {
      color: '#0000ff',
      offset: { x: 0, y: 0 },
      blur: 0,
      spread: 4,
    };
    const raster = canvas(60, 60);
    paint(raster, ring([outer, inner({ offset: { x: 4, y: 0 } })]));
    // The outer one casts the path's own silhouette (no spread): nothing appears outside the ring.
    expect(pixel(raster, 8, 30)).toEqual(WHITE);
    // The inner one shades the band edge the hole's offset leaves uncovered.
    expect(pixel(raster, 11, 30)).toEqual(RED);
  });
});
