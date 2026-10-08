import type { ExifOrientation } from '../../src/model';
import { createRaster, type Raster } from './raster';

// Orientação EXIF em TypeScript puro: o decodificador de JPEG entrega os pixels como estão no
// arquivo, e a app (e as coordenadas das marcações) usam a imagem já girada.

/**
 * Aplica a orientação EXIF (1 a 8): devolve os pixels como a imagem deve ser vista, como o
 * `createImageBitmap(…, { imageOrientation: 'from-image' })` da app. 5 a 8 trocam os eixos.
 */
export function orient(source: Raster, orientation: ExifOrientation): Raster {
  if (orientation === 1) return source;
  const { width: w, height: h, data } = source;
  const swap = orientation >= 5;
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const out = createRaster(outW, outH);
  // Para cada pixel de saída (x, y), o pixel de origem (sx, sy).
  const from: (x: number, y: number) => [number, number] = {
    2: (x: number, y: number): [number, number] => [w - 1 - x, y],
    3: (x: number, y: number): [number, number] => [w - 1 - x, h - 1 - y],
    4: (x: number, y: number): [number, number] => [x, h - 1 - y],
    5: (x: number, y: number): [number, number] => [y, x],
    6: (x: number, y: number): [number, number] => [y, h - 1 - x],
    7: (x: number, y: number): [number, number] => [w - 1 - y, h - 1 - x],
    8: (x: number, y: number): [number, number] => [w - 1 - y, x],
  }[orientation];
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = from(x, y);
      const s = (sy * w + sx) * 4;
      const d = (y * outW + x) * 4;
      out.data[d] = data[s]!;
      out.data[d + 1] = data[s + 1]!;
      out.data[d + 2] = data[s + 2]!;
      out.data[d + 3] = data[s + 3]!;
    }
  }
  return out;
}
