// Conversões entre a tela (pixels CSS do container) e o canvas (unidades do canvas).
// Funções puras, testadas em `tests/canvas/`.
import type { Rect } from '../model';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Transformação do canvas para a tela: `tela = canvas * scale + (x, y)`.
 * `scale` = pixels de tela por unidade do canvas.
 */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_ZOOM = 0.005;
export const MAX_ZOOM = 50;
/** Margem, em pixels de tela, ao enquadrar. */
export const FIT_PADDING = 24;
/** Área enquadrada quando o canvas está vazio (unidades do canvas). */
export const EMPTY_CANVAS_RECT: Rect = { x: 0, y: 0, width: 1000, height: 1000 };

export function screenToCanvas(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
}

export function canvasToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.scale + v.x, y: p.y * v.scale + v.y };
}

export function clampZoom(scale: number): number {
  return Math.min(Math.max(scale, MIN_ZOOM), MAX_ZOOM);
}

/** Aplica o zoom `factor` mantendo fixo o ponto de tela `anchor`. */
export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampZoom(v.scale * factor);
  const k = scale / v.scale;
  return {
    x: anchor.x - (anchor.x - v.x) * k,
    y: anchor.y - (anchor.y - v.y) * k,
    scale,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { x: v.x + dx, y: v.y + dy, scale: v.scale };
}

/** Enquadra `rect` (canvas) numa tela de tamanho `size`, centralizado. */
export function fitRect(rect: Rect, size: Size, padding = FIT_PADDING): Viewport {
  const availW = Math.max(1, size.width - 2 * padding);
  const availH = Math.max(1, size.height - 2 * padding);
  const w = Math.max(rect.width, 1e-9);
  const h = Math.max(rect.height, 1e-9);
  const scale = clampZoom(Math.min(availW / w, availH / h));
  return {
    x: size.width / 2 - (rect.x + rect.width / 2) * scale,
    y: size.height / 2 - (rect.y + rect.height / 2) * scale,
    scale,
  };
}

/**
 * Pinça: dados os dois dedos antes (`a0`, `b0`) e depois (`a1`, `b1`), aplica o
 * zoom pela razão das distâncias e o pan pelo deslocamento do ponto médio.
 */
export function pinch(v: Viewport, a0: Point, b0: Point, a1: Point, b1: Point): Viewport {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const panned = panBy(v, m1.x - m0.x, m1.y - m0.y);
  return d0 > 0 ? zoomAt(panned, m1, d1 / d0) : panned;
}

/** Fator de zoom para um evento de roda (`ctrlKey` = pinça do trackpad). */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  ctrlKey: boolean,
): number {
  // deltaMode 1 = linhas, 2 = páginas; normaliza para pixels.
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const sensitivity = ctrlKey ? 0.01 : 0.0015;
  const limited = Math.max(-200, Math.min(200, pixels));
  return Math.exp(-limited * sensitivity);
}

/**
 * Centraliza `rect` (canvas) na tela. Mantém o zoom se o retângulo ocupar
 * entre `minFraction` e `maxFraction` da tela; senão, ajusta para metade dela.
 */
export function centerOn(
  v: Viewport,
  rect: Rect,
  size: Size,
  minFraction = 0.15,
  maxFraction = 0.8,
): Viewport {
  const fraction = Math.max(
    (rect.width * v.scale) / Math.max(1, size.width),
    (rect.height * v.scale) / Math.max(1, size.height),
  );
  const scale =
    fraction > 0 && (fraction < minFraction || fraction > maxFraction)
      ? clampZoom((v.scale * 0.5) / fraction)
      : v.scale;
  return {
    x: size.width / 2 - (rect.x + rect.width / 2) * scale,
    y: size.height / 2 - (rect.y + rect.height / 2) * scale,
    scale,
  };
}
