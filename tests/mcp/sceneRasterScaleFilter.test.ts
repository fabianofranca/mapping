// FG5: `scale` and `filter.grayscale` in the MCP raster. The scale draws around the box center,
// scale 0 draws nothing, a vector fill under grayscale has R = G = B, and an image fill keeps the
// placeholder (the raster has no image pixels).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { COMPONENT_FORMAT } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import {
  baseNode,
  translate,
  type FrameNode,
  type SceneNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import type { PackageImages } from '../../mcp/image/packageImages';
import { quadrants } from './images';

const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
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

function frame(children: SceneNode[]): FrameNode {
  return {
    ...baseNode({ id: 'root', name: 'root', width: 100, height: 100 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  };
}

function box(fills: object[], extra: Partial<SceneNode> = {}): SceneNode {
  return {
    ...baseNode({
      id: 'box',
      name: 'box',
      width: 40,
      height: 40,
      transform: translate(30, 30),
    }),
    type: 'rect',
    cornerRadius: 0,
    fills: fills as never,
    ...extra,
  } as SceneNode;
}

const red = [{ type: 'solid', color: '#ff0000' }];

describe('FG5: scale in the raster', () => {
  it('scale 0.5 paints the box around its center', () => {
    const scaled = canvas(100, 100);
    paint(scaled, frame([box(red, { scale: 0.5 })]));
    expect(pixel(scaled, 40, 40)).toEqual(RED);
    expect(pixel(scaled, 59, 59)).toEqual(RED);
    expect(pixel(scaled, 35, 35)).toEqual(WHITE);
    expect(pixel(scaled, 60, 60)).toEqual(WHITE);
    expect(pixel(scaled, 30, 50)).toEqual(WHITE);
    // Without the scale the same pixel is red, so the assertion above is not vacuous.
    const plain = canvas(100, 100);
    paint(plain, frame([box(red)]));
    expect(pixel(plain, 35, 35)).toEqual(RED);
  });

  it('scale 0 paints nothing', () => {
    const raster = canvas(100, 100);
    paint(raster, frame([box(red, { scale: 0 })]));
    expect(pixel(raster, 50, 50)).toEqual(WHITE);
    expect(raster.data.every((v) => v === 255)).toBe(true);
  });
});

describe('FG5: grayscale in the raster', () => {
  it('a vector fill under filter.grayscale 1 has R = G = B in every painted pixel', () => {
    const component = (filter?: object) => ({
      format: COMPONENT_FORMAT,
      formatVersion: 4,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 100 },
      template: {
        type: 'frame',
        layout: { type: 'row', align: 'center', justify: 'center' },
        children: [
          {
            type: 'rect',
            name: 'sw',
            width: 40,
            height: 40,
            fill: '#ff0000',
            ...(filter ? { filter } : {}),
          },
        ],
      },
    });
    const draw = (filter?: object) => {
      const out = instantiate(
        component(filter) as never,
        {},
        { x: 0, y: 0, width: 100, height: 100 },
        { measure: approximateMeasurer },
      );
      const raster = canvas(100, 100);
      paint(raster, out.root);
      return raster;
    };
    const colored = draw();
    expect(pixel(colored, 50, 50)).toEqual(RED);

    const gray = draw({ grayscale: 1 });
    let painted = 0;
    for (let i = 0; i < gray.data.length; i += 4) {
      const [r, g, b] = [gray.data[i]!, gray.data[i + 1]!, gray.data[i + 2]!];
      expect(g).toBe(r);
      expect(b).toBe(r);
      if (r !== 255) painted++;
    }
    expect(painted).toBeGreaterThan(0);
    expect(pixel(gray, 50, 50)).not.toEqual(RED);
  });

  it('an image fill with grayscale draws the same placeholder as without, and does not throw', () => {
    const draw = (fill: object) => {
      const raster = canvas(100, 100);
      expect(() => paint(raster, frame([box([fill])]))).not.toThrow();
      return raster;
    };
    const plain = draw({ type: 'image', url: 'https://x/y.png' });
    const gray = draw({ type: 'image', url: 'https://x/y.png', grayscale: 1 });
    expect(pixel(plain, 50, 50)).not.toEqual(WHITE);
    expect(Buffer.from(gray.data).equals(Buffer.from(plain.data))).toBe(true);
  });
});

describe('FG5: scale and the shadow and the culling in the raster', () => {
  const blue = { color: '#0000ff', offset: { x: 10, y: 0 }, blur: 0 };

  it('a node scale scales the shadow offset along with the node', () => {
    const small = box(red, {
      width: 10,
      height: 10,
      transform: translate(45, 45),
      effects: [blue],
    } as Partial<SceneNode>);
    const plain = canvas(100, 100);
    paint(plain, frame([small]));
    // Offset 10: the shadow covers x 55..65, so x = 80 stays white.
    expect(pixel(plain, 80, 50)).toEqual(WHITE);
    const doubled = canvas(100, 100);
    paint(doubled, frame([{ ...small, scale: 2 } as SceneNode]));
    // Scale 2 about the center: the box covers 40..60 and the shadow, offset 20, covers 60..80.
    expect(pixel(doubled, 70, 50)).toEqual([0, 0, 255, 255]);
    expect(pixel(doubled, 85, 50)).toEqual(WHITE);
  });

  it('a root with scale > 1 is not culled when only its overhang reaches the region', () => {
    const root = {
      ...baseNode({
        id: 'root',
        name: 'root',
        width: 40,
        height: 40,
        transform: translate(80, 0),
      }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      scale: 2,
      fills: red,
      children: [],
    } as unknown as SceneNode;
    const raster = canvas(160, 40);
    // The box covers x 80..120; scaled by 2 about its center (100, 20) it covers 60..140.
    paintScene(raster, [{ root }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 130, y: 0, width: 20, height: 40 },
    });
    expect(pixel(raster, 135, 20)).toEqual(RED);
    expect(pixel(raster, 145, 20)).toEqual(WHITE);
  });
});

describe('grayscale on a package image in the raster (#2359)', () => {
  const images: PackageImages = {
    get: (spec, asset) =>
      spec === 'lib' && asset === 'images/q.png' ? quadrants(40, 40) : undefined,
    notes: [],
  };
  const component = (filter?: object) => ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 40, height: 40 },
    template: {
      type: 'frame',
      ...(filter ? { filter } : {}),
      layout: { type: 'row', align: 'center', justify: 'center' },
      children: [
        {
          type: 'image',
          name: 'img',
          src: 'images/q.png',
          fit: 'cover',
          width: 40,
          height: 40,
        },
      ],
    },
  });
  const draw = (filter?: object) => {
    const out = instantiate(
      component(filter) as never,
      {},
      { x: 0, y: 0, width: 40, height: 40 },
      { measure: approximateMeasurer },
    );
    const raster = canvas(40, 40);
    paintScene(raster, [{ root: out.root, specId: 'lib' }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width: 40, height: 40 },
      images,
    });
    return raster;
  };

  it('amount 1: R = G = B in every pixel and the alpha is unchanged', () => {
    const colored = draw();
    expect(pixel(colored, 2, 2)).toEqual(RED);
    const gray = draw({ grayscale: 1 });
    for (let i = 0; i < gray.data.length; i += 4) {
      expect(gray.data[i + 1]).toBe(gray.data[i]);
      expect(gray.data[i + 2]).toBe(gray.data[i]);
      expect(gray.data[i + 3]).toBe(255);
    }
    expect(pixel(gray, 2, 2)).not.toEqual(RED);
  });
});
