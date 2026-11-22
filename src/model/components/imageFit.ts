import type { ImageFit } from './componentFormat';

// Where an image goes in its box for each `fit` (the `image` node, `formatVersion` 4): the same
// arithmetic for the app's canvas (Konva) and the MCP raster. Pure: no DOM, no Node APIs.

interface Box {
  readonly width: number;
  readonly height: number;
}

/**
 * Position, size and crop of the `KonvaImage` for the `fit`: `cover` crops the center of the source
 * to cover the box, `contain` fits the whole source in the center, `fill` stretches.
 */
export function imageFit(
  fit: ImageFit,
  box: Box,
  source: { width: number; height: number },
): {
  x: number;
  y: number;
  width: number;
  height: number;
  crop?: { x: number; y: number; width: number; height: number };
} {
  if (fit === 'fill') return { x: 0, y: 0, width: box.width, height: box.height };
  if (fit !== 'cover' && fit !== 'contain') return placedFit(fit, box, source);
  if (fit === 'contain') {
    const scale = Math.min(box.width / source.width, box.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
  }
  const scale = Math.max(box.width / source.width, box.height / source.height);
  const cropWidth = box.width / scale;
  const cropHeight = box.height / scale;
  return {
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}

const EPSILON = 1e-9;

/**
 * `fill-width`, `fill-height`, `scale-down` and `none` (format 4): the image at the `fit` scale,
 * centered in the box and clipped where it exceeds it (the `ContentScale` `FillWidth`,
 * `FillHeight`,
 * `Inside` and `None`). `scale-down` never enlarges; `none` and `scale-down` use the natural size.
 */
function placedFit(
  fit: Exclude<ImageFit, 'cover' | 'contain' | 'fill'>,
  box: Box,
  source: { width: number; height: number },
): ReturnType<typeof imageFit> {
  if (box.width <= 0 || box.height <= 0 || source.width <= 0 || source.height <= 0)
    return { x: 0, y: 0, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  const scale =
    fit === 'fill-width'
      ? box.width / source.width
      : fit === 'fill-height'
        ? box.height / source.height
        : fit === 'none'
          ? 1
          : Math.min(1, box.width / source.width, box.height / source.height);
  const width = Math.min(source.width * scale, box.width);
  const height = Math.min(source.height * scale, box.height);
  const placed = {
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
    width,
    height,
  };
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  if (cropWidth >= source.width - EPSILON && cropHeight >= source.height - EPSILON)
    return placed;
  return {
    ...placed,
    crop: {
      x: (source.width - cropWidth) / 2,
      y: (source.height - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    },
  };
}
