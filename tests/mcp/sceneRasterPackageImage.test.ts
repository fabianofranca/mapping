import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import type { ImageFit } from '../../src/model/components/componentFormat';
import {
  baseNode,
  type FrameNode,
  type Paint,
  type SceneNode,
} from '../../src/model/components/scene';
import type { PackageImages } from '../../mcp/image/packageImages';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { quadrants } from './images';

// Package images painted by the MCP raster (stage #1903, DX4, decision 17): the `image` paint with
// an `asset` is sampled into the shape, with the `fit` of the app's model, the node's corner
// radius, the fill behind, the opacity and bilinear sampling. A remote `url` stays the placeholder.

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const WHITE = [255, 255, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

function rgb(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 3)];
}

function near(actual: number[], expected: number[], tolerance = 2): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) =>
    expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(tolerance),
  );
}

const lib = (map: Record<string, Raster>, specId = 'lib'): PackageImages => ({
  get: (spec, asset) => (spec === specId ? map[asset] : undefined),
  notes: [],
});

const asset = (fit: ImageFit, extra: Partial<Paint & { type: 'image' }> = {}): Paint => ({
  type: 'image',
  asset: 'images/q.png',
  fit,
  ...extra,
});

function rect(
  size: { width: number; height: number },
  fills: Paint[],
  extra: Record<string, unknown> = {},
): SceneNode {
  return {
    ...baseNode({ id: 'img', name: 'img', ...size, fills }),
    type: 'rect',
    cornerRadius: 0,
    ...extra,
  } as SceneNode;
}

interface DrawOptions {
  readonly images?: PackageImages | undefined;
  readonly specId?: string;
  readonly scale?: number;
  readonly frame?: Partial<FrameNode>;
}

function draw(
  node: SceneNode,
  size: { width: number; height: number },
  options: DrawOptions = {},
): Raster {
  const scale = options.scale ?? 1;
  const root: FrameNode = {
    ...baseNode({ id: 'root', name: 'root', ...size }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [node],
    ...options.frame,
  };
  const raster = canvas(Math.round(size.width * scale), Math.round(size.height * scale));
  paintScene(raster, [{ root, specId: options.specId ?? 'lib' }], approximateMeasurer, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    ...(options.images === undefined ? {} : { images: options.images }),
  });
  return raster;
}

const Q = quadrants(40, 40);
const withQ = lib({ 'images/q.png': Q });

describe('package image: fit', () => {
  it('cover: the image fills a box of its own proportion', () => {
    const size = { width: 40, height: 40 };
    const out = draw(rect(size, [asset('cover')]), size, { images: withQ });
    near(rgb(out, 2, 2), RED);
    near(rgb(out, 37, 2), GREEN);
    near(rgb(out, 2, 37), BLUE);
    near(rgb(out, 37, 37), YELLOW);
  });

  it('cover: crops the center of the image to cover a wider box', () => {
    const size = { width: 80, height: 40 };
    const out = draw(rect(size, [asset('cover')]), size, { images: withQ });
    // 80 px wide: scale 2, so the box shows source rows 10 to 30, split at the middle.
    near(rgb(out, 10, 2), RED);
    near(rgb(out, 70, 2), GREEN);
    near(rgb(out, 10, 37), BLUE);
    near(rgb(out, 70, 37), YELLOW);
    near(rgb(out, 10, 16), RED);
    near(rgb(out, 10, 24), BLUE);
  });

  it('contain: the whole image, centered, with the fill behind the bars', () => {
    const size = { width: 80, height: 40 };
    const out = draw(
      rect(size, [{ type: 'solid', color: '#808080' }, asset('contain')]),
      size,
      {
        images: withQ,
      },
    );
    near(rgb(out, 5, 20), [128, 128, 128]);
    near(rgb(out, 75, 20), [128, 128, 128]);
    near(rgb(out, 22, 2), RED);
    near(rgb(out, 57, 2), GREEN);
    near(rgb(out, 22, 37), BLUE);
    near(rgb(out, 57, 37), YELLOW);
  });

  it('fill: stretches the image to the box', () => {
    const size = { width: 80, height: 40 };
    const out = draw(rect(size, [asset('fill')]), size, { images: withQ });
    near(rgb(out, 38, 2), RED);
    near(rgb(out, 42, 2), GREEN);
    near(rgb(out, 2, 18), RED);
    near(rgb(out, 2, 22), BLUE);
    near(rgb(out, 77, 37), YELLOW);
  });

  it('fill-width: the image takes the box width and is cropped in height', () => {
    const size = { width: 80, height: 40 };
    const out = draw(rect(size, [asset('fill-width')]), size, { images: withQ });
    near(rgb(out, 10, 2), RED);
    near(rgb(out, 10, 37), BLUE);
    near(rgb(out, 70, 2), GREEN);
  });

  it('fill-height: the image takes the box height and is cropped in width', () => {
    const size = { width: 20, height: 40 };
    const out = draw(rect(size, [asset('fill-height')]), size, { images: withQ });
    // Scale 1: the box shows source columns 10 to 30, split at the middle.
    near(rgb(out, 2, 2), RED);
    near(rgb(out, 17, 2), GREEN);
    near(rgb(out, 2, 37), BLUE);
  });

  it('scale-down: never enlarges, so a small image stays at its natural size', () => {
    const size = { width: 100, height: 100 };
    const out = draw(rect(size, [asset('scale-down')]), size, { images: withQ });
    near(rgb(out, 5, 5), WHITE);
    near(rgb(out, 32, 32), RED);
    near(rgb(out, 67, 67), YELLOW);
    near(rgb(out, 72, 72), WHITE);
  });

  it('scale-down: reduces an image that does not fit', () => {
    const size = { width: 20, height: 20 };
    const out = draw(rect(size, [asset('scale-down')]), size, { images: withQ });
    near(rgb(out, 2, 2), RED);
    near(rgb(out, 17, 17), YELLOW);
  });

  it('none: the natural size, centered, cropped by the box', () => {
    const size = { width: 20, height: 20 };
    const out = draw(rect(size, [asset('none')]), size, { images: withQ });
    // Source 10 to 30 on each axis: the four quadrants meet at the box center.
    near(rgb(out, 2, 2), RED);
    near(rgb(out, 17, 2), GREEN);
    near(rgb(out, 2, 17), BLUE);
    near(rgb(out, 17, 17), YELLOW);
  });

  it('uses the natural size of the decoded image, not the box, for none', () => {
    const size = { width: 100, height: 100 };
    const out = draw(rect(size, [asset('none')]), size, { images: withQ });
    near(rgb(out, 5, 5), WHITE);
    near(rgb(out, 32, 32), RED);
  });
});

describe('package image: shape, fill and opacity', () => {
  it("the node's corner radius rounds the image", () => {
    const size = { width: 40, height: 40 };
    const out = draw(rect(size, [asset('cover')], { cornerRadius: 20 }), size, {
      images: withQ,
    });
    near(rgb(out, 0, 0), WHITE);
    near(rgb(out, 39, 39), WHITE);
    near(rgb(out, 10, 10), RED);
  });

  it("the radius rounds the image's own box, like the app's image", () => {
    const size = { width: 80, height: 40 };
    // contain: the image is the 40×40 box at x 20 to 60; its corners are the rounded ones.
    const out = draw(rect(size, [asset('contain')], { cornerRadius: 20 }), size, {
      images: withQ,
    });
    near(rgb(out, 21, 1), WHITE);
    near(rgb(out, 30, 10), RED);
  });

  it('draws the fill behind an image with transparency', () => {
    const half = createRaster(2, 1);
    half.data.set([255, 0, 0, 255, 0, 0, 0, 0]);
    const size = { width: 40, height: 20 };
    const out = draw(
      rect(size, [{ type: 'solid', color: '#0000ff' }, asset('fill')]),
      size,
      { images: lib({ 'images/q.png': half }) },
    );
    near(rgb(out, 5, 10), RED);
    near(rgb(out, 35, 10), BLUE);
  });

  it("the paint's opacity and the node's opacity multiply", () => {
    const size = { width: 40, height: 40 };
    const out = draw(
      rect(size, [asset('cover', { opacity: 0.5 })], { opacity: 0.5 }),
      size,
      { images: withQ },
    );
    // Red at 25% over white.
    near(rgb(out, 2, 2), [255, 191, 191], 2);
  });

  it('the grayscale of the paint desaturates the pixels', () => {
    const size = { width: 40, height: 40 };
    const out = draw(rect(size, [asset('cover', { grayscale: 1 })]), size, {
      images: withQ,
    });
    near(rgb(out, 2, 2), [54, 54, 54], 2);
  });

  it('is cut by the clip of the frame that contains it', () => {
    const size = { width: 40, height: 40 };
    const node = rect(size, [asset('cover')]);
    const out = draw(node, size, {
      images: withQ,
      frame: { clip: true, width: 20, height: 40 },
    });
    near(rgb(out, 2, 2), RED);
    near(rgb(out, 30, 2), WHITE);
  });

  it('scales with the view (twice the pixels, the same drawing)', () => {
    const size = { width: 40, height: 40 };
    const out = draw(rect(size, [asset('cover')]), size, { images: withQ, scale: 2 });
    expect([out.width, out.height]).toEqual([80, 80]);
    near(rgb(out, 4, 4), RED);
    near(rgb(out, 75, 75), YELLOW);
  });
});

describe('package image: sampling', () => {
  it('enlarged, the image is interpolated (bilinear), not blocky', () => {
    const tiny = createRaster(2, 2);
    tiny.data.set([...RED, 255, ...GREEN, 255, ...BLUE, 255, ...YELLOW, 255]);
    const size = { width: 40, height: 40 };
    const out = draw(rect(size, [asset('fill')]), size, {
      images: lib({ 'images/q.png': tiny }),
    });
    // The corners keep the pixel's own color, the center is the average of the four.
    near(rgb(out, 0, 0), RED, 6);
    near(rgb(out, 39, 39), YELLOW, 6);
    near(rgb(out, 19, 19), [128, 128, 64], 8);
    // Between the red and the green pixel centers: a mix, not one of the two.
    const mid = rgb(out, 20, 0);
    expect(mid[0]).toBeGreaterThan(60);
    expect(mid[0]).toBeLessThan(200);
    expect(mid[1]).toBeGreaterThan(60);
  });

  it('reduced, the image is interpolated too', () => {
    // 8×1 stripes (black, white, ...) in 4×1 pixels: each output pixel center falls between a
    // black and a white texel, so a mix comes out (nearest would give pure black or white).
    const stripes = createRaster(8, 1);
    for (let x = 0; x < 8; x++)
      stripes.data.set(x % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255], x * 4);
    const size = { width: 4, height: 1 };
    const out = draw(rect(size, [asset('fill')]), size, {
      images: lib({ 'images/q.png': stripes }),
    });
    for (let x = 0; x < 4; x++) near(rgb(out, x, 0), [128, 128, 128], 4);
  });
});

describe('package image: what stays the placeholder', () => {
  const PLACEHOLDER = [207, 207, 207];

  it('an image the package does not hold', () => {
    const size = { width: 20, height: 20 };
    const out = draw(rect(size, [asset('cover')]), size, { images: lib({}) });
    near(rgb(out, 10, 10), PLACEHOLDER, 2);
  });

  it('a drawing painted without images', () => {
    const size = { width: 20, height: 20 };
    const out = draw(rect(size, [asset('cover')]), size);
    near(rgb(out, 10, 10), PLACEHOLDER, 2);
  });

  it('a remote image, even when the package has an image of the same text', () => {
    const size = { width: 20, height: 20 };
    const paint: Paint = { type: 'image', url: 'images/q.png', fit: 'cover' };
    const out = draw(rect(size, [paint]), size, { images: withQ });
    near(rgb(out, 10, 10), PLACEHOLDER, 2);
  });

  it('the image of another specialization', () => {
    const size = { width: 20, height: 20 };
    const out = draw(rect(size, [asset('cover')]), size, {
      images: lib({ 'images/q.png': Q }, 'other'),
    });
    near(rgb(out, 10, 10), PLACEHOLDER, 2);
  });
});
