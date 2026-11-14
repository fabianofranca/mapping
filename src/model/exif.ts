/**
 * Minimal reader of the EXIF orientation (tag 0x0112) of a JPEG.
 * It only looks at the IFD0 of the APP1 "Exif" segment. Anything unexpected → 1 (normal).
 */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const ORIENTATION_TAG = 0x0112;

function isOrientation(n: number): n is ExifOrientation {
  return Number.isInteger(n) && n >= 1 && n <= 8;
}

export function readExifOrientation(buffer: ArrayBuffer): ExifOrientation {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    // End of the metadata: start of the compressed image or an invalid marker.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1;
    const length = view.getUint16(offset + 2);
    if (marker === 0xffe1) {
      const found = readApp1(view, offset + 4, length - 2);
      if (found !== null) return found;
    }
    offset += 2 + length;
  }
  return 1;
}

function readApp1(view: DataView, start: number, length: number): ExifOrientation | null {
  const end = Math.min(start + length, view.byteLength);
  // "Exif\0\0"
  if (end - start < 14 || view.getUint32(start) !== 0x45786966) return null;
  const tiff = start + 6;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little);
      return isOrientation(value) ? value : 1;
    }
  }
  return null;
}
