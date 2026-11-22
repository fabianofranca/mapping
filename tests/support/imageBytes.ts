// Tiny hand-built image headers (PNG, JPEG, WebP) for the package-image tests: only the bytes the
// header readers look at, optionally zero-padded to a byte length.

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const u32be = (n: number): number[] => [
  n >>> 24,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const u16be = (n: number): number[] => [n >> 8, n & 255];
const u24le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

/** Pads with zeros up to `length` bytes (never shortens). */
export function padTo(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length >= length) return bytes;
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
}

export function pngBytes(width: number, height: number, length = 0): Uint8Array {
  return padTo(
    Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...u32be(13),
      ...ascii('IHDR'),
      ...u32be(width),
      ...u32be(height),
    ]),
    length,
  );
}

export function jpegBytes(width: number, height: number, length = 0): Uint8Array {
  return padTo(
    Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      ...u16be(4),
      0,
      0,
      0xff,
      0xc0,
      ...u16be(11),
      8,
      ...u16be(height),
      ...u16be(width),
      3,
      0,
      0,
      0,
    ]),
    length,
  );
}

export function webpBytes(width: number, height: number, length = 0): Uint8Array {
  const payload = [0, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1), 0, 0];
  return padTo(
    Uint8Array.from([
      ...ascii('RIFF'),
      ...u32be(0),
      ...ascii('WEBP'),
      ...ascii('VP8X'),
      ...u32be(payload.length),
      ...payload,
    ]),
    length,
  );
}
