import type { ExifOrientation } from '../src/model';

// Operações sobre pixels RGBA (8 bits por canal, sem pré-multiplicar), em TypeScript puro:
// a orientação EXIF e a redução de tamanho da otimização de imagens (a app usa o canvas).

/** Imagem decodificada: `data` tem `width * height * 4` bytes (RGBA). */
export interface Pixels {
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * Aplica a orientação EXIF (1 a 8): devolve os pixels como a imagem deve ser vista, como o
 * `createImageBitmap(…, { imageOrientation: 'from-image' })` da app. 5 a 8 trocam os eixos.
 */
export function orient(source: Pixels, orientation: ExifOrientation): Pixels {
  if (orientation === 1) return source;
  const { width: w, height: h, data } = source;
  const swap = orientation >= 5;
  const outW = swap ? h : w;
  const outH = swap ? w : h;
  const out = new Uint8ClampedArray(outW * outH * 4);
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
      out[d] = data[s]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s + 2]!;
      out[d + 3] = data[s + 3]!;
    }
  }
  return { data: out, width: outW, height: outH };
}

/** Pesos de uma dimensão: para cada pixel de saída, os de origem que ele cobre e quanto de cada. */
function spans(source: number, target: number): { start: number; weights: number[] }[] {
  const scale = source / target;
  const result: { start: number; weights: number[] }[] = [];
  for (let i = 0; i < target; i++) {
    const from = i * scale;
    const to = Math.min(source, (i + 1) * scale);
    const start = Math.floor(from);
    const weights: number[] = [];
    for (let s = start; s < to; s++) {
      weights.push(Math.min(s + 1, to) - Math.max(s, from));
    }
    result.push({ start, weights });
  }
  return result;
}

/**
 * Reduz para `width` × `height` pela média das áreas (cada pixel de saída é a média dos de
 * origem que ele cobre), com a cor ponderada pela transparência para não escurecer as bordas.
 * Só reduz: a otimização nunca amplia. Memória extra de uma linha de saída.
 */
export function downscale(source: Pixels, width: number, height: number): Pixels {
  if (width === source.width && height === source.height) return source;
  if (width > source.width || height > source.height || width < 1 || height < 1) {
    throw new Error(
      `downscale: ${source.width}×${source.height} → ${width}×${height} não é uma redução`,
    );
  }
  const { data, width: sw } = source;
  const columns = spans(source.width, width);
  const rows = spans(source.height, height);
  const out = new Uint8ClampedArray(width * height * 4);
  const acc = new Float64Array(width * 4);
  for (let y = 0; y < height; y++) {
    acc.fill(0);
    const row = rows[y]!;
    row.weights.forEach((wy, k) => {
      const base = (row.start + k) * sw * 4;
      for (let x = 0; x < width; x++) {
        const column = columns[x]!;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        column.weights.forEach((wx, j) => {
          const s = base + (column.start + j) * 4;
          const alpha = data[s + 3]! * wx;
          r += data[s]! * alpha;
          g += data[s + 1]! * alpha;
          b += data[s + 2]! * alpha;
          a += alpha;
        });
        const d = x * 4;
        acc[d] = acc[d]! + r * wy;
        acc[d + 1] = acc[d + 1]! + g * wy;
        acc[d + 2] = acc[d + 2]! + b * wy;
        acc[d + 3] = acc[d + 3]! + a * wy;
      }
    });
    const area = (source.width / width) * (source.height / height);
    for (let x = 0; x < width; x++) {
      const s = x * 4;
      const d = (y * width + x) * 4;
      const alpha = acc[s + 3]!;
      if (alpha > 0) {
        out[d] = acc[s]! / alpha;
        out[d + 1] = acc[s + 1]! / alpha;
        out[d + 2] = acc[s + 2]! / alpha;
      }
      out[d + 3] = alpha / area;
    }
  }
  return { data: out, width, height };
}
