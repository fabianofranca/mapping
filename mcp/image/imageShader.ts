import { grayscaleRgb } from '../../src/model/components/grayscale';
import { imageFit } from '../../src/model/components/imageFit';
import type { Matrix, Paint } from '../../src/model/components/scene';
import { invert, type Shader } from './gradientShader';
import type { Raster } from './raster';

// The per-pixel color of a package image for the MCP raster (stage #1903, DX4). The `fit` comes
// from `imageFit` (the app's model), so the raster and the app's canvas place the image the same;
// the pixels are sampled bilinearly (the browser's own filter), in premultiplied alpha so a
// transparent edge does not bleed its color. Pure: no disk.

type ImagePaint = Extract<Paint, { type: 'image' }>;

/** Where the image sits in the node's box, in the node's own units. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageSource {
  readonly shader: Shader;
  /** The rectangle the image covers inside the node's box: the shape that the shader paints. */
  readonly placed: Placement;
}

/**
 * The shader of `paint`'s `image` (`raster` is its decoded pixels) for a node of `box` size and the
 * local → raster `matrix`, with `opacity` multiplying the alpha. `null` when the image paints nothing: an
 * empty box or image, or a collapsed matrix.
 */
export function imageShader(
  paint: ImagePaint,
  raster: Raster,
  box: { width: number; height: number },
  matrix: Matrix,
  opacity: number,
): ImageSource | null {
  const inverse = invert(matrix);
  if (inverse === null || raster.width <= 0 || raster.height <= 0) return null;
  const placed = imageFit(paint.fit ?? 'cover', box, raster);
  if (!(placed.width > 0) || !(placed.height > 0)) return null;
  const crop = placed.crop ?? { x: 0, y: 0, width: raster.width, height: raster.height };
  const stepX = crop.width / placed.width;
  const stepY = crop.height / placed.height;
  const [a, b, c, d, e, f] = inverse;
  const factor = opacity * (paint.opacity ?? 1);
  const gray = paint.grayscale ?? 0;
  const maxX = raster.width - 1;
  const maxY = raster.height - 1;
  const { data, width } = raster;
  const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);
  const shader: Shader = (px, py) => {
    // The pixel center in the node's space, then in the source's texel space (centers at +0.5).
    const u = crop.x + (a * px + c * py + e - placed.x) * stepX - 0.5;
    const v = crop.y + (b * px + d * py + f - placed.y) * stepY - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const xa = clamp(x0, maxX);
    const xb = clamp(x0 + 1, maxX);
    const ya = clamp(y0, maxY);
    const yb = clamp(y0 + 1, maxY);
    // The four taps, premultiplied by their alpha, with no closure or array per pixel.
    const i00 = (ya * width + xa) * 4;
    const i10 = (ya * width + xb) * 4;
    const i01 = (yb * width + xa) * 4;
    const i11 = (yb * width + xb) * 4;
    const w00 = (1 - fx) * (1 - fy) * data[i00 + 3]!;
    const w10 = fx * (1 - fy) * data[i10 + 3]!;
    const w01 = (1 - fx) * fy * data[i01 + 3]!;
    const w11 = fx * fy * data[i11 + 3]!;
    const alpha = w00 + w10 + w01 + w11;
    const r = data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11;
    const g =
      data[i00 + 1]! * w00 +
      data[i10 + 1]! * w10 +
      data[i01 + 1]! * w01 +
      data[i11 + 1]! * w11;
    const bl =
      data[i00 + 2]! * w00 +
      data[i10 + 2]! * w10 +
      data[i01 + 2]! * w01 +
      data[i11 + 2]! * w11;
    if (alpha <= 0) return { rgb: [0, 0, 0], alpha: 0 };
    const rgb =
      gray > 0
        ? grayscaleRgb(r / alpha, g / alpha, bl / alpha, gray)
        : [r / alpha, g / alpha, bl / alpha];
    return { rgb: [rgb[0]!, rgb[1]!, rgb[2]!], alpha: (alpha / 255) * factor };
  };
  return {
    shader,
    placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height },
  };
}
