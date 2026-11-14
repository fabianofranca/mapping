import decodeJpeg, { init as initJpegDecoder } from '@jsquash/jpeg/decode.js';
import encodeJpeg, { init as initJpegEncoder } from '@jsquash/jpeg/encode.js';
import decodePng, { init as initPngDecoder } from '@jsquash/png/decode.js';
import encodePng, { init as initPngEncoder } from '@jsquash/png/encode.js';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import { defaultOptions as webpDefaults } from '@jsquash/webp/meta.js';
import { initEmscriptenModule } from '@jsquash/webp/utils.js';
import webpEncoderFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import pngWasm from 'wasm:png';
import jpegDecoderWasm from 'wasm:jpeg-decoder';
import jpegEncoderWasm from 'wasm:jpeg-encoder';
import webpDecoderWasm from 'wasm:webp-decoder';
import webpEncoderWasm from 'wasm:webp-encoder';
import { readExifOrientation, type ExifOrientation } from '../../src/model';
import { ToolError } from '../errors';
import {
  MAX_FILE_BYTES,
  MAX_PIXELS,
  detectFormat,
  readSize,
  type ImageFormat,
} from './formats';
import { orient } from './orientation';
import { flattenOnWhite, type Raster } from './raster';

// WebAssembly codecs (@jsquash: libpng, mozjpeg and libwebp), embedded in the single file and
// instantiated on demand from the bytes: nothing is read from disk or the network at runtime.
// When decoding a JPEG, the EXIF orientation is applied (`orientation.ts`), as the browser
// does in the app.

type Wasm = WebAssembly.Module;
const modules = new Map<Uint8Array, Wasm>();
const compiled = (bytes: Uint8Array): Wasm => {
  let module = modules.get(bytes);
  if (!module) {
    module = new WebAssembly.Module(bytes as BufferSource);
    modules.set(bytes, module);
  }
  return module;
};

const ready = new Map<string, Promise<unknown>>();
function once<T>(key: string, start: () => Promise<T>): Promise<T> {
  let promise = ready.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = start();
    ready.set(key, promise);
  }
  return promise;
}

/**
 * The bytes as an `ArrayBuffer` (what the @jsquash decoders accept). When the
 * `Uint8Array` fills the whole buffer (a large `readFile`), the buffer itself will do, with no copy;
 * otherwise (a `Buffer` from Node's pool, which has other data's bytes around it) it copies only the bytes.
 */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer instanceof ArrayBuffer &&
  bytes.byteOffset === 0 &&
  bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : (new Uint8Array(bytes).buffer as ArrayBuffer);

type Encoded = { data: Uint8ClampedArray; width: number; height: number };
// The packages' types reference the DOM's `ImageData`, which the `mcp/` tsconfig does not have.
const asImageData = (r: Raster) => r as unknown as Parameters<typeof encodePng>[0];

/** Refuses an image file above `MAX_FILE_BYTES` (checked before reading, by `stat`, and when decoding). */
export function assertFileSize(size: number): void {
  if (size > MAX_FILE_BYTES) {
    throw new ToolError(
      'image-too-large',
      `image file too large (${size} bytes; maximum ${MAX_FILE_BYTES})`,
    );
  }
}

/**
 * Decodes PNG, JPEG or WebP to RGBA, refusing files that are too large or have too many pixels. For
 * JPEG, it applies the EXIF orientation (mozjpeg hands over the pixels as they are in the file), as the
 * browser does in the app: the `raster` is in the markings' coordinate system.
 * `orientation` is the one read from the file (1 = no rotation; always 1 for PNG and WebP).
 */
export async function decodeImage(
  bytes: Uint8Array,
): Promise<{ format: ImageFormat; raster: Raster; orientation: ExifOrientation }> {
  assertFileSize(bytes.length);
  const format = detectFormat(bytes);
  if (!format) {
    throw new ToolError(
      'unsupported-image',
      'unsupported image format: only PNG, JPEG and WebP',
    );
  }
  const size = readSize(bytes, format);
  if (!size) {
    throw new ToolError('invalid-image', `unreadable ${format.toUpperCase()} header`);
  }
  if (size.width * size.height > MAX_PIXELS) {
    throw new ToolError(
      'image-too-large',
      `image with too many pixels (${size.width}×${size.height}; maximum ${MAX_PIXELS})`,
    );
  }
  try {
    const buffer = toArrayBuffer(bytes);
    let decoded: Encoded;
    if (format === 'png') {
      await once('png', () => initPngDecoder(compiled(pngWasm)));
      decoded = (await decodePng(buffer)) as Encoded;
    } else if (format === 'jpeg') {
      await once('jpeg-dec', async () => initJpegDecoder(compiled(jpegDecoderWasm)));
      decoded = (await decodeJpeg(buffer)) as Encoded;
    } else {
      await once('webp-dec', async () => initWebpDecoder(compiled(webpDecoderWasm)));
      decoded = (await decodeWebp(buffer)) as Encoded;
    }
    const raster = { width: decoded.width, height: decoded.height, data: decoded.data };
    const orientation = format === 'jpeg' ? readExifOrientation(buffer) : 1;
    return { format, raster: orient(raster, orientation), orientation };
  } catch (error) {
    throw new ToolError(
      'invalid-image',
      `could not decode the ${format.toUpperCase()} image: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface EncodeOptions {
  /** Quality (1–100) of JPEG and of lossy WebP. */
  readonly quality?: number;
  /** Lossless WebP (the project images from a PNG source use this one). */
  readonly lossless?: boolean;
}

export const DEFAULT_QUALITY = 85;

/** Encodes the raster in the requested format. JPEG has no transparency: it flattens onto white. */
export async function encodeImage(
  raster: Raster,
  format: ImageFormat,
  options: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = options.quality ?? DEFAULT_QUALITY;
  if (format === 'png') {
    await once('png', () => initPngEncoder(compiled(pngWasm)));
    return new Uint8Array(await encodePng(asImageData(raster)));
  }
  if (format === 'jpeg') {
    await once('jpeg-enc', async () => initJpegEncoder(compiled(jpegEncoderWasm)));
    const flat = flattenOnWhite(raster);
    return new Uint8Array(await encodeJpeg(asImageData(flat), { quality }));
  }
  // WebP is instantiated directly from the codec's factory (no SIMD): the package's `init` picks the
  // variant with a dynamic `import()` that the single file does not load.
  const encoder = await once('webp-enc', () =>
    initEmscriptenModule(webpEncoderFactory, compiled(webpEncoderWasm)),
  );
  const out = encoder.encode(raster.data, raster.width, raster.height, {
    ...webpDefaults,
    quality,
    lossless: options.lossless ? 1 : 0,
  });
  if (!out) throw new ToolError('encode-failed', 'failed to encode the WebP image');
  return new Uint8Array(out);
}
