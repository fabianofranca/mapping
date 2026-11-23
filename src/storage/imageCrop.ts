import { planOutputSize, type Rect } from '../model';

/** Maximum longer side of the copied crop, in pixels. */
export const CROP_MAX_SIDE = 2048;

/**
 * Crops `rect` (pixels of the original image, with EXIF already applied) from a project
 * image and returns a PNG, reduced to `maxSide` (default `CROP_MAX_SIDE`) on the longer side
 * (never enlarges). `maxSide` `null` means no reduction: the PNG has the rect's own size.
 */
export async function cropToPng(
  data: Blob,
  rect: Rect,
  maxSide: number | null = CROP_MAX_SIDE,
): Promise<Blob> {
  const bitmap = await createImageBitmap(data, { imageOrientation: 'from-image' });
  try {
    const out = planOutputSize(rect, maxSide ?? Number.POSITIVE_INFINITY);
    const canvas = document.createElement('canvas');
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      out.width,
      out.height,
    );
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!png) throw new Error('png encoding failed');
    return png;
  } finally {
    bitmap.close();
  }
}
