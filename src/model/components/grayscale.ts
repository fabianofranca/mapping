// The `filter.grayscale` of a node (format 4): the desaturation of its scene subtree, with the
// amount and the matrix of CSS's `grayscale()` (Filter Effects). It is drawing only. Compositing is
// linear in the color channels, so desaturating the colors of the subtree gives the same result as
// filtering the composed pixels: the app, the viewer and the raster need nothing new for vectors.
// An image paint carries the amount (`grayscale`) for whoever has its pixels (Konva, the raster).
import type { Paint, SceneNode, Shadow, Stroke } from './scene';
import { mapColor, type Rgba } from './tokens';

/** Luma weights of the CSS `grayscale()` matrix (Rec. 709, as in the Filter Effects spec). */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** The amount as the filter takes it: from 0 to 1 (out of range is clamped). */
export function clampGrayscale(amount: number): number {
  return Math.min(1, Math.max(0, amount));
}

/** Two nested `grayscale()` filters are one with this amount: `1 - (1 - a)(1 - b)`. */
export function composeGrayscale(a: number, b: number): number {
  return 1 - (1 - clampGrayscale(a)) * (1 - clampGrayscale(b));
}

/** One pixel (0 to 255 per channel) through the CSS matrix: `(1 - amount)` of itself plus `amount` of its luma. */
export function grayscaleRgb(
  r: number,
  g: number,
  b: number,
  amount: number,
): [number, number, number] {
  const k = clampGrayscale(amount);
  const luma = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
  const mix = (c: number): number => (1 - k) * c + k * luma;
  return [mix(r), mix(g), mix(b)];
}

/** A literal color through the filter; alpha unchanged, anything that is not a literal color as it is. */
export function grayscaleColor(color: string, amount: number): string {
  if (amount <= 0) return color;
  return mapColor(color, (c: Rgba) => {
    const [r, g, b] = grayscaleRgb(c.r, c.g, c.b, amount);
    return { r, g, b, a: c.a };
  });
}

/** RGBA pixels (`getImageData` or a decoded image) through the filter, in place; alpha unchanged. */
export function grayscalePixels(
  data: Uint8ClampedArray | Uint8Array,
  amount: number,
): void {
  if (amount <= 0) return;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const [r, g, b] = grayscaleRgb(data[i]!, data[i + 1]!, data[i + 2]!, amount);
    data[i] = Math.round(r);
    data[i + 1] = Math.round(g);
    data[i + 2] = Math.round(b);
  }
}

function paintOf(paint: Paint, amount: number): Paint {
  switch (paint.type) {
    case 'solid':
      return { ...paint, color: grayscaleColor(paint.color, amount) };
    case 'linear':
    case 'radial':
    case 'angular':
      return {
        ...paint,
        stops: paint.stops.map((stop) => ({
          ...stop,
          color: grayscaleColor(stop.color, amount),
        })),
      };
    case 'image':
      return { ...paint, grayscale: composeGrayscale(paint.grayscale ?? 0, amount) };
  }
}

function strokeOf(stroke: Stroke, amount: number): Stroke {
  return { ...stroke, paints: stroke.paints.map((p) => paintOf(p, amount)) };
}

function shadowOf(shadow: Shadow, amount: number): Shadow {
  return { ...shadow, color: grayscaleColor(shadow.color, amount) };
}

/** The node and everything under it (fills, stroke, shadows, text colors, image paints) desaturated by `amount`. */
export function grayscaleNode<T extends SceneNode>(node: T, amount: number): T {
  const k = clampGrayscale(amount);
  if (k <= 0) return node;
  const out: Record<string, unknown> = {
    ...node,
    fills: node.fills.map((p) => paintOf(p, k)),
    effects: node.effects.map((e) => shadowOf(e, k)),
  };
  if (node.stroke) out.stroke = strokeOf(node.stroke, k);
  if (node.type === 'frame' || node.type === 'group')
    out.children = node.children.map((child) => grayscaleNode(child, k));
  if (node.type === 'text' && node.runs)
    out.runs = node.runs.map((run) => ({
      ...run,
      color: grayscaleColor(run.color, k),
      ...(run.background === undefined
        ? {}
        : { background: grayscaleColor(run.background, k) }),
    }));
  return out as unknown as T;
}
