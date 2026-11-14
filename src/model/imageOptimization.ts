// Decisions of image optimization on import (docs/ARCHITECTURE.md, "Image intake and
// optimization"). Pure functions: the re-encoding itself (canvas, toBlob) lives in
// `src/storage/imageImport.ts`.

/** Maximum longest side of an imported image, in pixels. */
export const MAX_IMAGE_SIDE = 2560;
/** Quality of lossy WebP/JPEG. */
export const LOSSY_QUALITY = 0.85;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

export interface OutputPlan extends Dimensions {
  /** The image had to be shrunk to fit in `MAX_IMAGE_SIDE`. */
  readonly resized: boolean;
}

/** Final dimensions: longest side capped at `MAX_IMAGE_SIDE`; never enlarges. */
export function planOutputSize(size: Dimensions, maxSide = MAX_IMAGE_SIDE): OutputPlan {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxSide) return { ...size, resized: false };
  const factor = maxSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * factor)),
    height: Math.max(1, Math.round(size.height * factor)),
    resized: true,
  };
}

export type OutputMime = 'image/webp' | 'image/jpeg' | 'image/png';

export interface OutputFormat {
  readonly mime: OutputMime;
  /** `undefined` for lossless formats (lossless WebP uses quality 1). */
  readonly quality: number | undefined;
  readonly extension: 'webp' | 'jpg' | 'png';
}

/**
 * Output format. PNG source (screenshots, text): lossless WebP, or PNG if the
 * browser cannot produce WebP. Others (photos): lossy WebP, or JPEG.
 */
export function chooseOutputFormat(
  source: { readonly isPng: boolean },
  webpSupported: boolean,
): OutputFormat {
  if (source.isPng) {
    return webpSupported
      ? { mime: 'image/webp', quality: 1, extension: 'webp' }
      : { mime: 'image/png', quality: undefined, extension: 'png' };
  }
  return webpSupported
    ? { mime: 'image/webp', quality: LOSSY_QUALITY, extension: 'webp' }
    : { mime: 'image/jpeg', quality: LOSSY_QUALITY, extension: 'jpg' };
}

/** `true` if the browser actually produced the requested format (`toBlob` falls back to PNG when it does not know it). */
export function encodedAsRequested(requested: OutputMime, actual: string): boolean {
  return actual === requested;
}

/**
 * Use the re-encoded file? Always, if it was shrunk or if the original needs
 * correction (EXIF orientation); otherwise, only if it ended up smaller than the original.
 */
export function shouldUseEncoded(args: {
  readonly resized: boolean;
  readonly needsRotation: boolean;
  readonly originalBytes: number;
  readonly encodedBytes: number;
}): boolean {
  if (args.resized || args.needsRotation) return true;
  return args.encodedBytes < args.originalBytes;
}

/** Replaces the file name's extension (`photo.png` + `webp` → `photo.webp`; without an extension, appends one). */
export function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

/** Is the source a PNG (by MIME type or extension)? It defines the output format in `chooseOutputFormat`. */
export function isPngSource(file: {
  readonly type: string;
  readonly name: string;
}): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name);
}

/** Is the source a JPEG (by MIME type or extension)? Only JPEG has an EXIF orientation to correct. */
export function isJpegSource(file: {
  readonly type: string;
  readonly name: string;
}): boolean {
  return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `img-YYYYMMDD-HHMMSS.<ext>` (local time), for pasted images. */
export function pastedFileName(date: Date, extension: string): string {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `img-${day}-${time}.${extension}`;
}

/** File extension for an image's MIME type (`png` if unknown). */
export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    case 'image/bmp':
      return 'bmp';
    default:
      return 'png';
  }
}
