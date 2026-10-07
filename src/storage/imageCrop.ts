import { planOutputSize, type Rect } from '../model';

/** Lado maior máximo do recorte copiado, em pixels. */
export const CROP_MAX_SIDE = 2048;

/**
 * Recorta `rect` (pixels da imagem original, já com o EXIF aplicado) de uma imagem do
 * projeto e devolve um PNG, reduzido a `CROP_MAX_SIDE` no lado maior (nunca amplia).
 */
export async function cropToPng(data: Blob, rect: Rect): Promise<Blob> {
  const bitmap = await createImageBitmap(data, { imageOrientation: 'from-image' });
  try {
    const out = planOutputSize(rect, CROP_MAX_SIDE);
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
