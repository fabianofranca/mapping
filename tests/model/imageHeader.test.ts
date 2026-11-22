// Reading the image format and dimensions from the header bytes (pure, no decoding).
import { describe, expect, it } from 'vitest';
import { detectFormat, readSize } from '../../src/model/imageHeader';

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const u32be = (n: number): number[] => [
  n >>> 24,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const u16be = (n: number): number[] => [n >> 8, n & 255];
const u16le = (n: number): number[] => [n & 255, n >> 8];
const u24le = (n: number): number[] => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

function png(width: number, height: number): Uint8Array {
  return Uint8Array.from([
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
  ]);
}

function jpeg(marker: number, width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...u16be(4),
    0,
    0,
    0xff,
    marker,
    ...u16be(11),
    8,
    ...u16be(height),
    ...u16be(width),
    3,
    0,
    0,
    0,
  ]);
}

function riff(chunk: string, payload: number[]): Uint8Array {
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...u32be(0),
    ...ascii('WEBP'),
    ...ascii(chunk),
    ...u32be(payload.length),
    ...payload,
  ]);
}

/** SOI + APP0 (length 4), then `between`, then a SOF-shaped segment with `marker`. */
function jpegAfter(between: number[], marker: number, width: number, height: number) {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...u16be(4),
    0,
    0,
    ...between,
    0xff,
    marker,
    ...u16be(11),
    8,
    ...u16be(height),
    ...u16be(width),
    3,
    0,
    0,
    0,
  ]);
}

/** A segment shaped like a SOF (`ff <marker> 00 0b`, 13 bytes) whose bytes at 5 and 7 read as 7 x 9. */
const decoySegment = (marker: number): number[] => [
  0xff,
  marker,
  ...u16be(11),
  8,
  ...u16be(7),
  ...u16be(9),
  3,
  0,
  0,
  0,
];

describe('detectFormat', () => {
  it('recognizes PNG, JPEG and WebP', () => {
    expect(detectFormat(png(1, 1))).toBe('png');
    expect(detectFormat(jpeg(0xc0, 1, 1))).toBe('jpeg');
    expect(detectFormat(riff('VP8X', new Array<number>(10).fill(0)))).toBe('webp');
  });

  it('returns null for something that is not an image', () => {
    expect(detectFormat(Uint8Array.from(ascii('hello world, not an image')))).toBeNull();
    expect(detectFormat(new Uint8Array(0))).toBeNull();
  });

  it('needs 8 bytes for PNG even though it checks 4', () => {
    expect(detectFormat(png(1, 1).slice(0, 8))).toBe('png');
    expect(detectFormat(png(1, 1).slice(0, 7))).toBeNull();
  });

  it('returns null for the PNG magic with a wrong 4th byte', () => {
    const bytes = png(1, 1);
    bytes[3] = 0x48;
    expect(detectFormat(bytes)).toBeNull();
  });

  it('needs exactly the three signature bytes for JPEG', () => {
    expect(detectFormat(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('jpeg');
    expect(detectFormat(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });

  it('needs 12 bytes for WebP', () => {
    const bytes = riff('VP8X', [0, 0, 0, 0]);
    expect(detectFormat(bytes.slice(0, 12))).toBe('webp');
    expect(detectFormat(bytes.slice(0, 11))).toBeNull();
  });

  it('returns null for a RIFF container that is not WebP', () => {
    const bytes = riff('VP8X', new Array<number>(10).fill(0));
    bytes.set(ascii('AVI '), 8);
    expect(detectFormat(bytes)).toBeNull();
  });
});

describe('readSize', () => {
  it('reads a PNG', () => {
    expect(readSize(png(640, 480), 'png')).toEqual({ width: 640, height: 480 });
  });

  it('reads a baseline JPEG (SOF0)', () => {
    expect(readSize(jpeg(0xc0, 300, 200), 'jpeg')).toEqual({ width: 300, height: 200 });
  });

  it('reads a progressive JPEG (SOF2)', () => {
    expect(readSize(jpeg(0xc2, 1024, 768), 'jpeg')).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('reads a lossy WebP (VP8)', () => {
    const payload = [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(320), ...u16le(240), 0, 0];
    expect(readSize(riff('VP8 ', payload), 'webp')).toEqual({ width: 320, height: 240 });
  });

  it('reads a lossless WebP (VP8L)', () => {
    const bits = ((100 - 1) | ((50 - 1) << 14)) >>> 0;
    const payload = [
      0x2f,
      bits & 255,
      (bits >>> 8) & 255,
      (bits >>> 16) & 255,
      bits >>> 24,
      0,
      0,
      0,
      0,
      0,
    ];
    expect(readSize(riff('VP8L', payload), 'webp')).toEqual({ width: 100, height: 50 });
  });

  it('reads an extended WebP (VP8X)', () => {
    const payload = [0, 0, 0, 0, ...u24le(799), ...u24le(599), 0, 0];
    expect(readSize(riff('VP8X', payload), 'webp')).toEqual({ width: 800, height: 600 });
  });

  it('returns null for truncated bytes and for zero dimensions', () => {
    expect(readSize(png(10, 10).slice(0, 20), 'png')).toBeNull();
    expect(readSize(jpeg(0xc0, 10, 10).slice(0, 8), 'jpeg')).toBeNull();
    expect(readSize(riff('VP8X', [0, 0, 0, 0]), 'webp')).toBeNull();
    expect(readSize(png(0, 10), 'png')).toBeNull();
  });

  it('returns null when the bytes are not of the declared format', () => {
    expect(
      readSize(Uint8Array.from(ascii('definitely not a png file at all')), 'png'),
    ).toBeNull();
  });
  it('returns null for a zero height, like a zero width', () => {
    expect(readSize(png(10, 0), 'png')).toBeNull();
  });

  describe('JPEG segment walker', () => {
    const read = (bytes: Uint8Array) => readSize(bytes, 'jpeg');

    it('skips a 0xff fill byte before the SOF marker', () => {
      expect(read(jpegAfter([0xff], 0xc0, 30, 20))).toEqual({ width: 30, height: 20 });
    });

    it('skips a stray non-0xff byte between two segments', () => {
      expect(read(jpegAfter([0x00], 0xc0, 30, 20))).toEqual({ width: 30, height: 20 });
    });

    it.each([
      ['RST0', [0xff, 0xd0]],
      ['TEM', [0xff, 0x01]],
    ])('skips the standalone marker %s before the SOF', (_name, marker) => {
      expect(read(jpegAfter(marker, 0xc0, 30, 20))).toEqual({ width: 30, height: 20 });
    });

    it.each([
      ['DHT', 0xc4],
      ['JPG', 0xc8],
      ['DAC', 0xcc],
    ])('does not take a %s segment for a SOF', (_name, marker) => {
      expect(read(jpegAfter(decoySegment(marker), 0xc0, 30, 20))).toEqual({
        width: 30,
        height: 20,
      });
    });

    it.each([
      ['SOF0', 0xc0],
      ['SOF1', 0xc1],
      ['SOF2', 0xc2],
      ['SOF3', 0xc3],
      ['SOF15', 0xcf],
    ])('reads the size of a %s segment', (_name, marker) => {
      expect(read(jpeg(marker, 30, 20))).toEqual({ width: 30, height: 20 });
    });

    it('returns null when a segment length jumps past the end', () => {
      const bytes = Uint8Array.from([
        ...jpegAfter([0xff, 0xe1, 0xff, 0xff], 0xe2, 30, 20),
      ]);
      expect(read(bytes)).toBeNull();
    });

    it('does not loop forever on a segment length of 0 and still finds the SOF', () => {
      expect(read(jpegAfter([0xff, 0xe1, 0x00, 0x00], 0xc0, 30, 20))).toEqual({
        width: 30,
        height: 20,
      });
    });

    it('needs the walker bound (i + 9 < length), even with the size bytes present', () => {
      const bytes = jpeg(0xc0, 30, 20);
      expect(read(bytes.slice(0, 17))).toBeNull();
      expect(read(bytes.slice(0, 18))).toEqual({ width: 30, height: 20 });
    });

    it('returns null for a stream with only an EOI after the SOI', () => {
      const bytes = Uint8Array.from([
        0xff,
        0xd8,
        0xff,
        0xd9,
        ...new Array<number>(20).fill(0),
      ]);
      expect(read(bytes)).toBeNull();
    });
  });

  describe('WebP chunks', () => {
    it('returns null for a VP8L chunk with a wrong signature byte', () => {
      expect(
        readSize(riff('VP8L', [0x2e, ...new Array<number>(9).fill(1)]), 'webp'),
      ).toBeNull();
    });

    it('returns null for a VP8 chunk with a wrong start code', () => {
      const payload = [0, 0, 0, 0x9d, 0x01, 0x2b, ...u16le(320), ...u16le(240), 0, 0];
      expect(readSize(riff('VP8 ', payload), 'webp')).toBeNull();
    });

    it('returns null for an unknown chunk of at least 30 bytes', () => {
      const bytes = riff('ALPH', new Array<number>(10).fill(0));
      expect(bytes.length).toBeGreaterThanOrEqual(30);
      expect(readSize(bytes, 'webp')).toBeNull();
    });
  });
});
