import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import {
  baseNode,
  translate,
  type FrameNode,
  type Matrix,
  type Paint,
  type SceneNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';

// Gradients painted per pixel by the MCP raster (stage DX1): linear, radial and angular, with the
// interpolation in non-premultiplied sRGB, like canvas 2D. The stroke keeps its first color.

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
}

function rectWith(
  fill: Paint,
  size: { width: number; height: number; transform?: Matrix },
): SceneNode {
  return {
    ...baseNode({ id: 'g', name: 'g', ...size, fills: [fill] }),
    type: 'rect',
    cornerRadius: 0,
  };
}

function drawn(node: SceneNode, size: { width: number; height: number }, scale = 1) {
  const root: FrameNode = {
    ...baseNode({ id: 'root', name: 'root', ...size }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [node],
  };
  const raster = canvas(Math.round(size.width * scale), Math.round(size.height * scale));
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
  });
  return raster;
}

/** Each channel within `tolerance` of the expected value. */
function near(actual: number[], expected: number[], tolerance = 3): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) =>
    expect(Math.abs(value - expected[i]!)).toBeLessThanOrEqual(tolerance),
  );
}

const RED_BLUE = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];

describe('linear gradient', () => {
  it('paints the color at the start, the middle and the end of the line', () => {
    const node = rectWith(
      { type: 'linear', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, stops: RED_BLUE },
      { width: 100, height: 10 },
    );
    const raster = drawn(node, { width: 100, height: 10 });
    near(pixel(raster, 0, 5), [253, 0, 2, 255]);
    near(pixel(raster, 49, 5), [128, 0, 127, 255]);
    near(pixel(raster, 99, 5), [2, 0, 253, 255]);
  });

  it('follows the stops: a hard edge and a continued last color', () => {
    const node = rectWith(
      {
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 0.5, color: '#ff0000' },
          { offset: 0.5, color: '#00ff00' },
          { offset: 0.75, color: '#00ff00' },
        ],
      },
      { width: 100, height: 10 },
    );
    const raster = drawn(node, { width: 100, height: 10 });
    near(pixel(raster, 20, 5), [255, 0, 0, 255], 0);
    near(pixel(raster, 60, 5), [0, 255, 0, 255], 0);
    near(pixel(raster, 95, 5), [0, 255, 0, 255], 0);
  });

  it('interpolates the alpha without premultiplying', () => {
    const node = rectWith(
      {
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
        stops: [
          { offset: 0, color: '#00000000' },
          { offset: 1, color: '#ff0000' },
        ],
      },
      { width: 100, height: 10 },
    );
    const raster = drawn(node, { width: 100, height: 10 });
    // Halfway: the color is (127, 0, 0) with alpha 0.5 over white, not a premultiplied darker mix.
    near(pixel(raster, 49, 5), [191, 127, 127, 255], 3);
  });

  it('follows the node matrix (a translated rect) and the view scale', () => {
    const node = rectWith(
      { type: 'linear', start: { x: 0, y: 0 }, end: { x: 40, y: 0 }, stops: RED_BLUE },
      { width: 40, height: 10, transform: translate(20, 0) },
    );
    const raster = drawn(node, { width: 80, height: 10 }, 2);
    near(pixel(raster, 40, 10), [252, 0, 3, 255]); // x = 20 in the image
    near(pixel(raster, 119, 10), [2, 0, 253, 255]); // x = 59.75
  });
});

describe('radial gradient', () => {
  const radial = (extra: Partial<Extract<Paint, { type: 'radial' }>> = {}): Paint => ({
    type: 'radial',
    center: { x: 20, y: 20 },
    radius: 20,
    stops: RED_BLUE,
    ...extra,
  });

  it('paints the first stop at the center, the mix at half the radius and the last beyond it', () => {
    const raster = drawn(rectWith(radial(), { width: 40, height: 40 }), {
      width: 40,
      height: 40,
    });
    near(pixel(raster, 20, 20), [250, 0, 5, 255], 6);
    near(pixel(raster, 30, 20), [128, 0, 127, 255], 8);
    near(pixel(raster, 39, 20), [12, 0, 243, 255], 8);
    // The corner is beyond the radius: the last color continues.
    near(pixel(raster, 1, 1), [0, 0, 255, 255], 0);
  });

  it('moves with the center', () => {
    const raster = drawn(
      rectWith(radial({ center: { x: 0, y: 0 }, radius: 40 }), { width: 40, height: 40 }),
      { width: 40, height: 40 },
    );
    near(pixel(raster, 0, 0), [252, 0, 3, 255], 6);
    near(pixel(raster, 39, 39), [0, 0, 255, 255], 0);
  });
});

describe('angular gradient', () => {
  const angular = (angle: number): Paint => ({
    type: 'angular',
    center: { x: 20, y: 20 },
    angle,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 0.5, color: '#00ff00' },
      { offset: 1, color: '#0000ff' },
    ],
  });

  it('starts pointing right and grows clockwise (down on screen)', () => {
    const raster = drawn(rectWith(angular(0), { width: 40, height: 40 }), {
      width: 40,
      height: 40,
    });
    // Just below the start ray (3 o'clock): the first stop.
    near(pixel(raster, 38, 21), [255, 0, 0, 255], 12);
    // 6 o'clock is a quarter turn: halfway between the first and the middle stop.
    near(pixel(raster, 20, 38), [128, 128, 0, 255], 12);
    // 9 o'clock is half a turn: the middle stop.
    near(pixel(raster, 1, 20), [0, 255, 0, 255], 12);
    // 12 o'clock is three quarters: halfway between the middle and the last stop.
    near(pixel(raster, 20, 1), [0, 128, 128, 255], 12);
    // Just above the start ray: the last stop (the seam).
    near(pixel(raster, 38, 18), [0, 0, 255, 255], 12);
  });

  it('turns the seam to the start angle', () => {
    const raster = drawn(rectWith(angular(90), { width: 40, height: 40 }), {
      width: 40,
      height: 40,
    });
    // The first stop is now just after 6 o'clock (counterclockwise side of it is the last stop).
    near(pixel(raster, 18, 38), [255, 0, 0, 255], 12);
    near(pixel(raster, 22, 38), [0, 0, 255, 255], 12);
  });
});

describe('what stays as it was', () => {
  it('a solid fill is painted as before and the stroke keeps its first color', () => {
    const node = {
      ...rectWith(
        { type: 'radial', center: { x: 10, y: 10 }, radius: 10, stops: RED_BLUE },
        { width: 20, height: 20 },
      ),
      stroke: {
        paints: [
          {
            type: 'linear' as const,
            start: { x: 0, y: 0 },
            end: { x: 20, y: 0 },
            stops: [
              { offset: 0, color: '#00ff00' },
              { offset: 1, color: '#ffff00' },
            ],
          },
        ],
        width: 4,
        align: 'inside' as const,
      },
    } as SceneNode;
    const raster = drawn(node, { width: 20, height: 20 });
    // The ring of the stroke is the first color (green) all around, even on the far side.
    near(pixel(raster, 18, 10), [0, 255, 0, 255], 0);
    near(pixel(raster, 1, 10), [0, 255, 0, 255], 0);
  });

  it('a gradient with no usable stop paints nothing', () => {
    const node = rectWith(
      { type: 'radial', center: { x: 5, y: 5 }, radius: 5, stops: [] },
      { width: 10, height: 10 },
    );
    near(pixel(drawn(node, { width: 10, height: 10 }), 5, 5), [255, 255, 255, 255], 0);
  });
});
