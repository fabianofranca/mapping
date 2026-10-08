// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readExifOrientation, swapsAxes } from '../../src/model/exif';

/** JPEG mínimo: SOI + (APP0 opcional) + APP1 Exif com a tag de orientação + SOS. */
function jpegWithOrientation(
  orientation: number,
  options: { littleEndian?: boolean; withApp0?: boolean } = {},
): ArrayBuffer {
  const little = options.littleEndian ?? false;
  const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4));
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, little);
  tiff.setUint32(4, 8, little);
  tiff.setUint16(8, 1, little); // uma entrada
  tiff.setUint16(10, 0x0112, little); // Orientation
  tiff.setUint16(12, 3, little); // SHORT
  tiff.setUint32(14, 1, little);
  tiff.setUint16(18, orientation, little);

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0, 0];
  const app1Length = 2 + exifHeader.length + tiff.byteLength;
  const bytes: number[] = [0xff, 0xd8];
  if (options.withApp0) bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
  bytes.push(0xff, 0xe1, app1Length >> 8, app1Length & 0xff, ...exifHeader);
  bytes.push(...new Uint8Array(tiff.buffer));
  bytes.push(0xff, 0xda, 0x00, 0x02);
  return new Uint8Array(bytes).buffer;
}

describe('readExifOrientation', () => {
  it('lê a orientação em big-endian e little-endian', () => {
    expect(readExifOrientation(jpegWithOrientation(6))).toBe(6);
    expect(readExifOrientation(jpegWithOrientation(3, { littleEndian: true }))).toBe(3);
  });

  it('pula outros segmentos antes do APP1', () => {
    expect(readExifOrientation(jpegWithOrientation(8, { withApp0: true }))).toBe(8);
  });

  it('devolve 1 sem EXIF, para não-JPEG, dados truncados e valores inválidos', () => {
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda]).buffer)).toBe(1);
    expect(readExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBe(1);
    expect(readExifOrientation(jpegWithOrientation(6).slice(0, 20))).toBe(1);
    expect(readExifOrientation(jpegWithOrientation(42))).toBe(1);
    expect(readExifOrientation(new ArrayBuffer(0))).toBe(1);
  });

  it('identifica as orientações que trocam largura e altura', () => {
    expect([1, 2, 3, 4].map((o) => swapsAxes(o as 1 | 2 | 3 | 4))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(swapsAxes(5)).toBe(true);
    expect(swapsAxes(8)).toBe(true);
  });
});
