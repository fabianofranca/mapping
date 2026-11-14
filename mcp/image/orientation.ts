import type { ExifOrientation } from '../../src/model';
import { createRaster, type Raster } from './raster';

// EXIF orientation in plain TypeScript: the JPEG decoder hands over the pixels as they are in the
// file, and the app (and the markings' coordinates) use the already-rotated image.

/**
 * Applies the EXIF orientation (1 to 8): returns the pixels as the image should be seen, like the app's
 * `createImageBitmap(…, { imageOrientation: 'from-image' })`. 5 to 8 swap the axes.
 */
export function orient(source: Raster, orientation: ExifOrientation): Raster {
  if (orientation === 1) return source;
  const { width: w, height: h, data } = source;
  const swap = orientation >= 5;
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const out = createRaster(outW, outH);
  // For each output pixel (x, y), the source pixel (sx, sy).
  const from: (x: number, y: number) => [number, number] = {
    2: (x: number, y: number): [number, number] => [w - 1 - x, y],
    3: (x: number, y: number): [number, number] => [w - 1 - x, h - 1 - y],
    4: (x: number, y: number): [number, number] => [x, h - 1 - y],
    5: (x: number, y: number): [number, number] => [y, x],
    6: (x: number, y: number): [number, number] => [y, h - 1 - x],
    7: (x: number, y: number): [number, number] => [w - 1 - y, h - 1 - x],
    8: (x: number, y: number): [number, number] => [w - 1 - y, x],
  }[orientation];
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = from(x, y);
      const s = (sy * w + sx) * 4;
      const d = (y * outW + x) * 4;
      out.data[d] = data[s]!;
      out.data[d + 1] = data[s + 1]!;
      out.data[d + 2] = data[s + 2]!;
      out.data[d + 3] = data[s + 3]!;
    }
  }
  return out;
}
