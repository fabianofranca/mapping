import {
  clampRect,
  crop,
  fitSize,
  outlineRect,
  resize,
  type PixelRect,
  type Raster,
  type Rgb,
} from './raster';

// Builds the images the tools return: crop of the marking (with margin), whole image with
// the marking highlighted and outline of the children. All in pixels of the original image; the downscaling
// comes before the outlines, so the line thickness is the same at any size.

export const DEFAULT_MAX_SIZE = 1568;
export const MIN_MAX_SIZE = 64;
export const MAX_MAX_SIZE = 4096;

/** Outline color of the marking itself in `context` mode. */
export const MARKING_OUTLINE = '#FF00FF';
/** Colors of the children (Okabe-Ito plus a purple): distinguishable from each other and by colorblind people. */
export const CHILD_COLORS = [
  '#E69F00',
  '#56B4E9',
  '#009E73',
  '#F0E442',
  '#0072B2',
  '#D55E00',
  '#CC79A7',
  '#7B3294',
] as const;
/** How many children are outlined (the rest are counted in the response). */
export const MAX_OUTLINED_CHILDREN = 24;

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface Outline {
  readonly rect: PixelRect;
  readonly color: string;
}

export interface Composition {
  readonly raster: Raster;
  /** The region of the original image that became the output. */
  readonly region: PixelRect;
  /** Downscaling factor (1 = original size). */
  readonly scale: number;
  /** Each outline drawn, in output pixels. */
  readonly outlines: (Outline & { readonly output: PixelRect })[];
}

/**
 * Crops `region` (in image pixels), scales the longest side down to `maxSize` and draws the
 * requested outlines, in this order (the last ones end up on top).
 */
export function compose(
  source: Raster,
  region: PixelRect,
  outlines: readonly Outline[],
  maxSize: number,
): Composition {
  const bounds = clampRect(region, source);
  if (!bounds) throw new Error('the region is outside the image');
  const cropped =
    bounds.width === source.width && bounds.height === source.height
      ? source
      : crop(source, bounds);
  const target = fitSize(bounds.width, bounds.height, maxSize);
  const out = resize(cropped, target.width, target.height);
  // `resize` returns the same raster when there is nothing to downscale: the outline must not alter the original.
  const canvas = out === source ? { ...out, data: new Uint8ClampedArray(out.data) } : out;

  const drawn = outlines.map((outline) => {
    const scaleX = target.width / bounds.width;
    const scaleY = target.height / bounds.height;
    const x0 = Math.round((outline.rect.x - bounds.x) * scaleX);
    const y0 = Math.round((outline.rect.y - bounds.y) * scaleY);
    const x1 = Math.round((outline.rect.x + outline.rect.width - bounds.x) * scaleX);
    const y1 = Math.round((outline.rect.y + outline.rect.height - bounds.y) * scaleY);
    const output = {
      x: x0,
      y: y0,
      width: Math.max(1, x1 - x0),
      height: Math.max(1, y1 - y0),
    };
    outlineRect(canvas, output, hexToRgb(outline.color));
    return { ...outline, output };
  });
  return { raster: canvas, region: bounds, scale: target.scale, outlines: drawn };
}
