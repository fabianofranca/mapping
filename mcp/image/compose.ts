import {
  clampRect,
  crop,
  fitSize,
  outlineRect,
  resize,
  type PixelRect,
  type Raster,
  type Rgb,
} from './raster';

// Monta as imagens que as tools devolvem: recorte da marcação (com margem), imagem inteira com
// a marcação destacada e contorno das filhas. Tudo em pixels da imagem original; a redução
// vem antes dos contornos, para a espessura da linha ser a mesma em qualquer tamanho.

export const DEFAULT_MAX_SIZE = 1568;
export const MIN_MAX_SIZE = 64;
export const MAX_MAX_SIZE = 4096;

/** Cor do contorno da própria marcação no modo `context`. */
export const MARKING_OUTLINE = '#FF00FF';
/** Cores das filhas (Okabe-Ito mais um roxo): distinguíveis entre si e por daltônicos. */
export const CHILD_COLORS = [
  '#E69F00',
  '#56B4E9',
  '#009E73',
  '#F0E442',
  '#0072B2',
  '#D55E00',
  '#CC79A7',
  '#7B3294',
] as const;
/** Quantas filhas são contornadas (as demais são contadas na resposta). */
export const MAX_OUTLINED_CHILDREN = 24;

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface Outline {
  readonly rect: PixelRect;
  readonly color: string;
}

export interface Composition {
  readonly raster: Raster;
  /** A região da imagem original que virou a saída. */
  readonly region: PixelRect;
  /** Fator de redução (1 = tamanho original). */
  readonly scale: number;
  /** Cada contorno desenhado, em pixels da saída. */
  readonly outlines: (Outline & { readonly output: PixelRect })[];
}

/**
 * Recorta `region` (em pixels da imagem), reduz o lado maior a `maxSize` e desenha os
 * contornos pedidos, nesta ordem (os últimos ficam por cima).
 */
export function compose(
  source: Raster,
  region: PixelRect,
  outlines: readonly Outline[],
  maxSize: number,
): Composition {
  const bounds = clampRect(region, source);
  if (!bounds) throw new Error('a região está fora da imagem');
  const cropped =
    bounds.width === source.width && bounds.height === source.height
      ? source
      : crop(source, bounds);
  const target = fitSize(bounds.width, bounds.height, maxSize);
  const out = resize(cropped, target.width, target.height);
  // `resize` devolve o mesmo raster quando não há o que reduzir: o contorno não pode alterar o original.
  const canvas = out === source ? { ...out, data: new Uint8ClampedArray(out.data) } : out;

  const drawn = outlines.map((outline) => {
    const scaleX = target.width / bounds.width;
    const scaleY = target.height / bounds.height;
    const x0 = Math.round((outline.rect.x - bounds.x) * scaleX);
    const y0 = Math.round((outline.rect.y - bounds.y) * scaleY);
    const x1 = Math.round((outline.rect.x + outline.rect.width - bounds.x) * scaleX);
    const y1 = Math.round((outline.rect.y + outline.rect.height - bounds.y) * scaleY);
    const output = {
      x: x0,
      y: y0,
      width: Math.max(1, x1 - x0),
      height: Math.max(1, y1 - y0),
    };
    outlineRect(canvas, output, hexToRgb(outline.color));
    return { ...outline, output };
  });
  return { raster: canvas, region: bounds, scale: target.scale, outlines: drawn };
}
