import {
  chooseOutputFormat,
  encodedAsRequested,
  isJpegSource,
  isPngSource,
  readExifOrientation,
  planOutputSize,
  shouldUseEncoded,
  withExtension,
  type OutputMime,
} from '../model';
import { reportError } from '../utils/report';

/** JPEG background (it has no transparency): white paper, not a design color. */
const JPEG_BACKGROUND = '#fff';

/** Longer side of the bitmap used to display the image (the coordinates do not change). */
export const DISPLAY_MAX_SIDE = 2048;

export interface PreparedImage {
  /** Suggested name for `images/` (a collision is resolved by the model). */
  readonly name: string;
  readonly data: Blob;
  /** Dimensions with the EXIF orientation already applied. */
  readonly width: number;
  readonly height: number;
}

export class ImageDecodeError extends Error {
  constructor(readonly fileName: string) {
    super(`cannot decode image: ${fileName}`);
    this.name = 'ImageDecodeError';
  }
}

function decode(data: Blob, options: ImageBitmapOptions = {}): Promise<ImageBitmap> {
  return createImageBitmap(data, { imageOrientation: 'from-image', ...options });
}

function drawToCanvas(
  source: ImageBitmap,
  width: number,
  height: number,
  mime?: OutputMime,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  if (mime === 'image/jpeg') {
    // JPEG has no transparency: without a background, it would turn black.
    ctx.fillStyle = JPEG_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: OutputMime,
  quality: number | undefined,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

let webpSupport: Promise<boolean> | null = null;

/** Detects at runtime whether `canvas.toBlob` produces WebP (otherwise it returns PNG). */
function supportsWebp(): Promise<boolean> {
  webpSupport ??= (async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const blob = await canvasToBlob(canvas, 'image/webp', 0.5);
      return blob !== null && encodedAsRequested('image/webp', blob.type);
    } catch {
      // Feature detection: without WebP the app uses JPEG, not a failure to report.
      return false;
    }
  })();
  return webpSupport;
}

/**
 * Prepares and optimizes an image that enters through the app (file, camera, paste,
 * drag, swap): applies the EXIF orientation, limits the longer side to
 * `MAX_IMAGE_SIDE` and re-encodes to WebP (PNG source: lossless; without WebP
 * support: JPEG or PNG), removing the metadata. Without a reduction, it only uses the
 * re-encoded one if it ends up smaller (or if the photo needs rotating). If
 * re-encoding fails (e.g. a photo larger than the iOS canvas limit), it keeps the
 * original file: the coordinates stay correct because the coordinate system is
 * that of the image with EXIF applied.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new ImageDecodeError(file.name);
  }
  const { width, height } = bitmap;
  try {
    const orientation = isJpegSource(file)
      ? readExifOrientation(await file.arrayBuffer())
      : 1;
    try {
      const plan = planOutputSize({ width, height });
      const format = chooseOutputFormat(
        { isPng: isPngSource(file) },
        await supportsWebp(),
      );
      const canvas = drawToCanvas(bitmap, plan.width, plan.height, format.mime);
      const encoded = await canvasToBlob(canvas, format.mime, format.quality);
      if (
        encoded &&
        encodedAsRequested(format.mime, encoded.type) &&
        shouldUseEncoded({
          resized: plan.resized,
          needsRotation: orientation !== 1,
          originalBytes: file.size,
          encodedBytes: encoded.size,
        })
      ) {
        return {
          name: withExtension(file.name, format.extension),
          data: encoded,
          width: plan.width,
          height: plan.height,
        };
      }
    } catch (e) {
      // Falls back to the original file below.
      reportError('image.optimize', e);
    }
    return { name: file.name, data: file, width, height };
  } finally {
    bitmap.close();
  }
}

/** Dimensions (with EXIF applied) of an image already saved in the project. */
export async function readImageSize(
  data: Blob,
  name: string,
): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await decode(data);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    throw new ImageDecodeError(name);
  }
}

/** Size of the display bitmap for an image of `width` × `height`. */
export function displaySize(
  width: number,
  height: number,
): { width: number; height: number } {
  const factor = Math.min(1, DISPLAY_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

/**
 * Reduced bitmap (longer side up to `DISPLAY_MAX_SIDE`) to display on the canvas.
 * With the original size known (`size`, coming from the project), it asks the decoder
 * for the final size directly, without decoding the whole photo. If the browser
 * ignores `resizeWidth`, it reduces by drawing on a canvas.
 */
export async function createDisplayBitmap(
  data: Blob,
  size?: { width: number; height: number },
): Promise<ImageBitmap> {
  let original = size;
  if (!original) {
    const probe = await decode(data);
    original = { width: probe.width, height: probe.height };
    if (Math.max(probe.width, probe.height) <= DISPLAY_MAX_SIDE) return probe;
    probe.close();
  }
  const target = displaySize(original.width, original.height);
  if (target.width === original.width && target.height === original.height) {
    return decode(data);
  }
  const resized = await decode(data, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
  if (resized.width === target.width && resized.height === target.height) return resized;
  try {
    return await createImageBitmap(drawToCanvas(resized, target.width, target.height));
  } finally {
    resized.close();
  }
}
