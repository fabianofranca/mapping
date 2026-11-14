// Image formats the server reads and writes, and reading the dimensions from the header
// (before decoding: a small PNG on disk can declare billions of pixels).

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Image files larger than this are refused. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/**
 * Images with more pixels than this (40 megapixels) are not decoded: the memory peak of
 * a decode (WASM heap, RGBA, orientation copy and downscaling) stays below ~1 GB.
 */
export const MAX_PIXELS = 40_000_000;
/**
 * Largest image accepted as `base64` in the operations (16 MB; larger ones go through `file`). Smaller than
 * `MAX_FILE_BYTES` because the whole message goes through stdin: the SDK's read buffer copies
 * the message on every chunk received (quadratic time in the size), and 87 MB took ~90 s.
 */
export const MAX_BASE64_FILE_BYTES = 16 * 1024 * 1024;
/** Size in base64 (without the `data:` prefix or line breaks) of a file of `MAX_BASE64_FILE_BYTES`. */
export const MAX_BASE64_LENGTH = Math.ceil(MAX_BASE64_FILE_BYTES / 3) * 4;
/**
 * Cap of the `base64` text in the schema: the content with room for the `data:` prefix and line breaks
 * (CRLF every 76 characters). The exact size is checked before decoding (`mcp/batch.ts`).
 */
export const MAX_BASE64_TEXT =
  MAX_BASE64_LENGTH + Math.ceil(MAX_BASE64_LENGTH / 38) + 256;
/**
 * Largest JSON-RPC message read from stdin (the transport's `maxBufferSize`, `mcp/main.ts`): a
 * `base64` at the schema's cap plus 1 MB for the rest of the message. Above that the server exits with
 * an error on stderr.
 */
export const MAX_MESSAGE_BYTES = MAX_BASE64_TEXT + 1024 * 1024;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Format by the first bytes; `null` if it is not PNG, JPEG or WebP. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]!);
  }
  return text;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);

/** Dimensions (without applying the EXIF orientation) read from the header; `null` if unreadable. */
export function readSize(bytes: Uint8Array, format: ImageFormat): Size | null {
  const size =
    format === 'png'
      ? pngSize(bytes)
      : format === 'jpeg'
        ? jpegSize(bytes)
        : webpSize(bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

function pngSize(b: Uint8Array): Size | null {
  // Signature (8) + block size (4) + "IHDR" (4) + width + height.
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array): Size | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Markers without a size: RSTn, SOI, EOI, TEM.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webpSize(b: Uint8Array): Size | null {
  if (b.length < 30) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    // Keyframe: 3 header bytes, start code 9d 01 2a, 14 bits of width and of height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26]! | (b[27]! << 8)) & 0x3fff,
      height: (b[28]! | (b[29]! << 8)) & 0x3fff,
    };
  }
  return null;
}
