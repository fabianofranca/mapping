// Conversions between the screen (CSS pixels of the container) and the canvas (canvas units).
// Pure functions, tested in `tests/canvas/`.
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
 * Transformation from the canvas to the screen: `screen = canvas * scale + (x, y)`.
 * `scale` = screen pixels per canvas unit.
 */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_ZOOM = 0.005;
export const MAX_ZOOM = 50;
/** Margin, in screen pixels, when framing. */
export const FIT_PADDING = 24;
/** Area framed when the canvas is empty (canvas units). */
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

/** Applies the `factor` zoom keeping the screen point `anchor` fixed. */
export function zoomAt(v: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampZoom(v.scale * factor);
  const k = scale / v.scale;
  return {
    x: anchor.x - (anchor.x - v.x) * k,
    y: anchor.y - (anchor.y - v.y) * k,
    scale,
  };
}

/**
 * Viewport after the canvas changes size from `from` to `to`: the canvas point that was
 * at the center stays at the center, with the same scale. With no change, returns `v` itself.
 */
export function keepCenter(v: Viewport, from: Size, to: Size): Viewport {
  if (from.width === to.width && from.height === to.height) return v;
  return {
    x: v.x + (to.width - from.width) / 2,
    y: v.y + (to.height - from.height) / 2,
    scale: v.scale,
  };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { x: v.x + dx, y: v.y + dy, scale: v.scale };
}

/** Frames `rect` (canvas) in a screen of size `size`, centered. */
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
 * Pinch: given the two fingers before (`a0`, `b0`) and after (`a1`, `b1`), applies the
 * zoom by the ratio of the distances and the pan by the displacement of the midpoint.
 */
export function pinch(v: Viewport, a0: Point, b0: Point, a1: Point, b1: Point): Viewport {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const panned = panBy(v, m1.x - m0.x, m1.y - m0.y);
  return d0 > 0 ? zoomAt(panned, m1, d1 / d0) : panned;
}

/** Zoom factor for a wheel event (`ctrlKey` = trackpad pinch). */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  ctrlKey: boolean,
): number {
  // deltaMode 1 = lines, 2 = pages; normalizes to pixels.
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const sensitivity = ctrlKey ? 0.01 : 0.0015;
  const limited = Math.max(-200, Math.min(200, pixels));
  return Math.exp(-limited * sensitivity);
}

/**
 * Minimum pan for `rect` (canvas) to be fully in view, without changing the zoom. If `rect` is already
 * in view, returns `v` (same reference). If it does not fit on an axis, aligns by its start.
 */
export function revealRect(
  v: Viewport,
  rect: Rect,
  size: Size,
  margin = FIT_PADDING,
): Viewport {
  const shift = (
    start: number,
    length: number,
    extent: number,
    offset: number,
  ): number => {
    const from = start * v.scale + offset;
    const to = from + length * v.scale;
    if (from >= margin && to <= extent - margin) return offset;
    if (to - from > extent - 2 * margin || from < margin) return offset + margin - from;
    return offset + (extent - margin - to);
  };
  const x = shift(rect.x, rect.width, size.width, v.x);
  const y = shift(rect.y, rect.height, size.height, v.y);
  return x === v.x && y === v.y ? v : { ...v, x, y };
}

/**
 * Centers `rect` (canvas) on the screen. Keeps the zoom if the rectangle occupies
 * between `minFraction` and `maxFraction` of the screen; otherwise, adjusts to half of it.
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
