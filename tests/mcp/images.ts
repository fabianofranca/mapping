import { deflateSync } from 'node:zlib';
import encodeJpeg, { init as initJpegEncode } from '@jsquash/jpeg/encode.js';
import jpegEncodeWasm from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?binary';
import { encodeWebp } from '../../mcp/imageCodec';
import type { Pixels } from '../../mcp/pixels';

// Imagens de fixture geradas na hora (PNG, JPEG com EXIF e WebP), com conteúdo conhecido.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Pixels de teste: cada quadrante com uma cor, para conferir a rotação. */
export function quadrants(width: number, height: number): Pixels {
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
export function pixelAt(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!];
}

/** PNG RGBA de 8 bits, sem compressão especial. */
export function encodePng(p: Pixels): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(p.width, 0);
  header.writeUInt32BE(p.height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((p.width * 4 + 1) * p.height);
  for (let y = 0; y < p.height; y++) {
    raw[y * (p.width * 4 + 1)] = 0;
    raw.set(
      p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4),
      y * (p.width * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

let jpegReady: Promise<unknown> | null = null;

/** JPEG (mozjpeg) e, com `orientation`, um segmento APP1 Exif com a tag de orientação. */
export async function encodeJpegWithExif(
  p: Pixels,
  orientation?: number,
): Promise<Buffer> {
  jpegReady ??= initJpegEncode(new WebAssembly.Module(jpegEncodeWasm));
  await jpegReady;
  const jpeg = Buffer.from(
    await encodeJpeg(
      {
        data: new Uint8ClampedArray(p.data),
        width: p.width,
        height: p.height,
        colorSpace: 'srgb',
      },
      { quality: 90 },
    ),
  );
  if (orientation === undefined) return jpeg;
  // TIFF big-endian: cabeçalho, IFD0 com uma entrada (0x0112, SHORT, 1, valor).
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
export async function encodeWebpFixture(p: Pixels, quality: number): Promise<Buffer> {
  return Buffer.from(await encodeWebp(p, quality));
}

/** Largura e altura de um WebP (VP8, VP8L ou VP8X), lidas do cabeçalho. */
export function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('não é WebP');
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
