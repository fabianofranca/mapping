// Image format detection and dimensions read from the header bytes (before decoding: a small
// PNG on disk can declare billions of pixels). Pure: no DOM and no Node APIs.

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** `expected` bytes at `offset`; the caller has already checked the buffer is long enough. */
function hasBytes(b: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((byte, k) => b[offset + k] === byte);
}

const isPng = (b: Uint8Array): boolean =>
  b.length >= 8 && hasBytes(b, 0, [0x89, 0x50, 0x4e, 0x47]);
const isJpeg = (b: Uint8Array): boolean =>
  b.length >= 3 && hasBytes(b, 0, [0xff, 0xd8, 0xff]);
const isWebp = (b: Uint8Array): boolean =>
  b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP';

/** Signature checks in order; the first match wins. */
const SIGNATURES: readonly (readonly [ImageFormat, (b: Uint8Array) => boolean])[] = [
  ['png', isPng],
  ['jpeg', isJpeg],
  ['webp', isWebp],
];

/** Format by the first bytes; `null` if it is not PNG, JPEG or WebP. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  return SIGNATURES.find(([, matches]) => matches(bytes))?.[0] ?? null;
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

/** One reader per format; each returns `null` when the header is unreadable. */
const READERS: Record<ImageFormat, (b: Uint8Array) => Size | null> = {
  png: pngSize,
  jpeg: jpegSize,
  webp: webpSize,
};

/** Dimensions (without applying the EXIF orientation) read from the header; `null` if unreadable. */
export function readSize(bytes: Uint8Array, format: ImageFormat): Size | null {
  const size = READERS[format](bytes);
  return size && size.width > 0 && size.height > 0 ? size : null;
}

function pngSize(b: Uint8Array): Size | null {
  // Signature (8) + block size (4) + "IHDR" (4) + width + height.
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** Markers without a size: RSTn, SOI, EOI, TEM. */
const isStandaloneMarker = (marker: number): boolean =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);

/** SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC). */
const isSofMarker = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

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
    if (isStandaloneMarker(marker)) {
      i += 2;
      continue;
    }
    if (isSofMarker(marker)) {
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
