import {
  chooseOutputFormat,
  isPngSource,
  planOutputSize,
  shouldUseEncoded,
  withExtension,
} from '../src/model';
import { decodeImage, encodeImage } from './image/codecs';
import { MIME } from './image/formats';
import { resize } from './image/raster';

/** Image ready for `images/`, with the same decisions as the app (`src/storage/imageImport.ts`). */
export interface PreparedImage {
  /** Suggested name (a collision in `images/` is resolved by the model). */
  readonly name: string;
  readonly data: Uint8Array;
  /** Dimensions with the EXIF orientation applied (the markings' coordinate system). */
  readonly width: number;
  readonly height: number;
  /** The file was re-encoded (WebP) or kept as it came. */
  readonly optimized: boolean;
  /** Dimensions of the received file (with the orientation applied), before downscaling. */
  readonly original: { readonly width: number; readonly height: number };
}

/**
 * Prepares the image that comes in through the MCP as the app does on import: applies the EXIF orientation,
 * limits the longest side to `MAX_IMAGE_SIDE` and re-encodes as WebP (PNG source: lossless; others:
 * lossy, quality 0.85), without the metadata. Without downscaling or rotation, it only uses the re-encoded one
 * if it ends up smaller than the original. Accepts PNG, JPEG and WebP (recognized by content, with the
 * limits and errors of `decodeImage`).
 */
export async function prepareImage(
  bytes: Uint8Array,
  name: string,
): Promise<PreparedImage> {
  // The EXIF orientation already comes applied; `orientation` says whether the photo needed rotating.
  const { format, raster: oriented, orientation } = await decodeImage(bytes);
  // By content, not by name: a `.png` that is actually a JPEG is treated as a photo.
  const source = { type: MIME[format], name: '' };
  const original = { width: oriented.width, height: oriented.height };

  const plan = planOutputSize(original);
  const output = chooseOutputFormat({ isPng: isPngSource(source) }, true);
  const resized = resize(oriented, plan.width, plan.height);
  // Quality 1 of `canvas.toBlob` (PNG source) is Chrome's lossless WebP.
  const lossless = (output.quality ?? 1) >= 1;
  const encoded = await encodeImage(resized, 'webp', {
    lossless,
    quality: lossless ? 100 : Math.round((output.quality ?? 1) * 100),
  });
  if (
    shouldUseEncoded({
      resized: plan.resized,
      needsRotation: orientation !== 1,
      originalBytes: bytes.byteLength,
      encodedBytes: encoded.byteLength,
    })
  ) {
    return {
      name: withExtension(name, output.extension),
      data: encoded,
      width: plan.width,
      height: plan.height,
      optimized: true,
      original,
    };
  }
  return { name, data: bytes, ...original, optimized: false, original };
}
