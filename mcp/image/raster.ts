// Operações de pixel em RGBA 8 bits, em TypeScript puro: recorte, redução com média por área
// e contorno de retângulos. A decodificação e a codificação (WebAssembly) ficam em `codecs.ts`.

export interface Raster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes por pixel, linha após linha. */
  readonly data: Uint8ClampedArray;
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Rgb = readonly [number, number, number];

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Interseção de `rect` com a imagem inteira; `null` se vazia. */
export function clampRect(rect: PixelRect, bounds: { width: number; height: number }) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(bounds.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(bounds.height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Copia a região `rect` (já dentro da imagem). */
export function crop(source: Raster, rect: PixelRect): Raster {
  const out = createRaster(rect.width, rect.height);
  for (let row = 0; row < rect.height; row++) {
    const from = ((rect.y + row) * source.width + rect.x) * 4;
    out.data.set(source.data.subarray(from, from + rect.width * 4), row * rect.width * 4);
  }
  return out;
}

/** Lado maior reduzido a `maxSize`, sem nunca ampliar. */
export function fitSize(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number; scale: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSize) return { width, height, scale: 1 };
  const scale = maxSize / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Reduz a `width`×`height` pela média ponderada da área coberta por cada pixel de saída
 * (filtro de caixa, sem serrilhado). A cor é ponderada pela opacidade, então regiões
 * transparentes não escurecem as bordas.
 */
export function resize(source: Raster, width: number, height: number): Raster {
  if (width === source.width && height === source.height) return source;
  const { data } = source;
  // Passada horizontal: colunas de saída × linhas de origem, com as cores já multiplicadas
  // pela opacidade (ponto flutuante).
  const mid = new Float32Array(width * source.height * 4);
  const xRatio = source.width / width;
  for (let y = 0; y < source.height; y++) {
    const rowStart = y * source.width * 4;
    for (let ox = 0; ox < width; ox++) {
      const start = ox * xRatio;
      const end = (ox + 1) * xRatio;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      const last = Math.min(source.width, Math.ceil(end));
      for (let i = Math.floor(start); i < last; i++) {
        const w = Math.min(i + 1, end) - Math.max(i, start);
        if (w <= 0) continue;
        const at = rowStart + i * 4;
        const alpha = data[at + 3]! / 255;
        r += data[at]! * alpha * w;
        g += data[at + 1]! * alpha * w;
        b += data[at + 2]! * alpha * w;
        a += data[at + 3]! * w;
        weight += w;
      }
      const to = (y * width + ox) * 4;
      mid[to] = r / weight;
      mid[to + 1] = g / weight;
      mid[to + 2] = b / weight;
      mid[to + 3] = a / weight;
    }
  }
  // Passada vertical, devolvendo as cores sem a multiplicação pela opacidade.
  const out = createRaster(width, height);
  const yRatio = source.height / height;
  for (let oy = 0; oy < height; oy++) {
    const start = oy * yRatio;
    const end = (oy + 1) * yRatio;
    const first = Math.floor(start);
    const last = Math.min(source.height, Math.ceil(end));
    for (let ox = 0; ox < width; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let i = first; i < last; i++) {
        const w = Math.min(i + 1, end) - Math.max(i, start);
        if (w <= 0) continue;
        const at = (i * width + ox) * 4;
        r += mid[at]! * w;
        g += mid[at + 1]! * w;
        b += mid[at + 2]! * w;
        a += mid[at + 3]! * w;
        weight += w;
      }
      const to = (oy * width + ox) * 4;
      const alpha = a / weight;
      if (alpha > 0) {
        const unpremultiply = 255 / alpha / weight;
        out.data[to] = r * unpremultiply;
        out.data[to + 1] = g * unpremultiply;
        out.data[to + 2] = b * unpremultiply;
      }
      out.data[to + 3] = alpha;
    }
  }
  return out;
}

function fillRect(
  raster: Raster,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgb,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(raster.width, x + width);
  const y1 = Math.min(raster.height, y + height);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * raster.width + px) * 4;
      raster.data[i] = color[0];
      raster.data[i + 1] = color[1];
      raster.data[i + 2] = color[2];
      raster.data[i + 3] = 255;
    }
  }
}

function strokeRect(raster: Raster, rect: PixelRect, thickness: number, color: Rgb) {
  const { x, y, width, height } = rect;
  const t = thickness;
  fillRect(raster, x, y, width, t, color);
  fillRect(raster, x, y + height - t, width, t, color);
  fillRect(raster, x, y, t, height, color);
  fillRect(raster, x + width - t, y, t, height, color);
}

export const HALO_COLOR: Rgb = [0, 0, 0];

/**
 * Desenha o contorno de `rect` (em pixels do `raster`, que o recorta nas bordas), por dentro
 * do retângulo, com um halo escuro de 1 px dos dois lados, para aparecer sobre qualquer fundo.
 */
export function outlineRect(
  raster: Raster,
  rect: PixelRect,
  color: Rgb,
  thickness = 2,
): void {
  const halo = 1;
  // Halo externo, linha colorida e halo interno: três contornos concêntricos.
  strokeRect(
    raster,
    {
      x: rect.x - halo,
      y: rect.y - halo,
      width: rect.width + 2 * halo,
      height: rect.height + 2 * halo,
    },
    halo,
    HALO_COLOR,
  );
  strokeRect(raster, rect, thickness, color);
  const inner = thickness;
  if (rect.width > 2 * (inner + halo) && rect.height > 2 * (inner + halo)) {
    strokeRect(
      raster,
      {
        x: rect.x + inner,
        y: rect.y + inner,
        width: rect.width - 2 * inner,
        height: rect.height - 2 * inner,
      },
      halo,
      HALO_COLOR,
    );
  }
}

/** Funde sobre branco (para JPEG, que não tem transparência). */
export function flattenOnWhite(source: Raster): Raster {
  const out = createRaster(source.width, source.height);
  for (let i = 0; i < source.data.length; i += 4) {
    const a = source.data[i + 3]! / 255;
    out.data[i] = source.data[i]! * a + 255 * (1 - a);
    out.data[i + 1] = source.data[i + 1]! * a + 255 * (1 - a);
    out.data[i + 2] = source.data[i + 2]! * a + 255 * (1 - a);
    out.data[i + 3] = 255;
  }
  return out;
}
