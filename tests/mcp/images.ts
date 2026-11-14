import { encodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';

// Fixture images generated on the fly (PNG, JPEG with EXIF and WebP), with known content.
// The colored quadrants show where the image was rotated to.

/** Test raster: each quadrant with its own color, to check the rotation. */
export function quadrants(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const q = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
      const i = (y * width + x) * 4;
      data.set([...colors[q]!, 255], i);
    }
  }
  return { data, width, height };
}

/** Cor RGB do pixel (x, y). */
export function pixelAt(p: Raster, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!];
}

/** PNG (libpng do @jsquash, o mesmo codec do servidor). */
export async function encodePng(p: Raster): Promise<Buffer> {
  return Buffer.from(await encodeImage(p, 'png'));
}

/** JPEG (mozjpeg) and, with `orientation`, an APP1 Exif segment with the orientation tag. */
export async function encodeJpegWithExif(
  p: Raster,
  orientation?: number,
): Promise<Buffer> {
  const jpeg = Buffer.from(await encodeImage(p, 'jpeg', { quality: 90 }));
  if (orientation === undefined) return jpeg;
  // Big-endian TIFF: header, IFD0 with one entry (0x0112, SHORT, 1, value).
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}

/** WebP com a qualidade pedida (0 a 1; 1 = sem perdas). */
export async function encodeWebpFixture(p: Raster, quality: number): Promise<Buffer> {
  return Buffer.from(
    await encodeImage(p, 'webp', {
      lossless: quality >= 1,
      quality: Math.round(quality * 100),
    }),
  );
}

/** Width and height of a WebP (VP8, VP8L or VP8X), read from the header. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP');
  }
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}
