import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** PNG RGB sólido de `width` × `height` (basta para os testes: nada de binário no repositório). */
export function solidPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number] = [200, 220, 240],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits por canal
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Bloco retangular de uma tela de exemplo (pixels da imagem, cor RGB). */
export interface PngBlock {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rgb: readonly [number, number, number];
}

/**
 * PNG RGB com fundo sólido e blocos retangulares por cima: o bastante para parecer uma
 * tela (cabeçalho, lista, botão) nas propostas de exemplo e nos testes de ponta a ponta.
 */
export function blocksPng(
  width: number,
  height: number,
  background: readonly [number, number, number],
  blocks: readonly PngBlock[],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(background, y * stride + 1 + x * 3);
  }
  for (const b of blocks) {
    for (let y = Math.max(0, b.y); y < Math.min(height, b.y + b.height); y++) {
      for (let x = Math.max(0, b.x); x < Math.min(width, b.x + b.width); x++) {
        raw.set(b.rgb, y * stride + 1 + x * 3);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
