import type { Matrix, Paint } from '../../src/model/components/scene';

// The per-pixel color of a gradient paint (linear, radial or angular) for the MCP raster. The
// interpolation is in non-premultiplied sRGB, like canvas 2D (the app's Konva), so the two agree
// within rounding. Pure: no disk.

export type Rgb = readonly [number, number, number];

/** A color with a 0–1 alpha, as the raster blends it. */
export interface ShaderColor {
  readonly rgb: Rgb;
  readonly alpha: number;
}

/** The color of the pixel whose center is at `(x, y)` in raster pixels. */
export type Shader = (x: number, y: number) => ShaderColor;

type GradientPaint = Extract<Paint, { type: 'linear' | 'radial' | 'angular' }>;

interface Stop {
  readonly offset: number;
  readonly color: ShaderColor;
}

const TURN = Math.PI * 2;

/** The inverse of `m` (local → raster), or `null` when it collapses the plane. */
function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}

/** The color at `t` (any real): clamped before the first and after the last stop, linear between. */
function colorAt(stops: readonly Stop[], t: number): ShaderColor {
  const last = stops.length - 1;
  for (let i = last; i >= 0; i--) {
    const from = stops[i]!;
    if (t < from.offset && i > 0) continue;
    if (i === last || t < from.offset) return from.color;
    const to = stops[i + 1]!;
    const k = (t - from.offset) / (to.offset - from.offset);
    return {
      rgb: [
        from.color.rgb[0] + (to.color.rgb[0] - from.color.rgb[0]) * k,
        from.color.rgb[1] + (to.color.rgb[1] - from.color.rgb[1]) * k,
        from.color.rgb[2] + (to.color.rgb[2] - from.color.rgb[2]) * k,
      ],
      alpha: from.color.alpha + (to.color.alpha - from.color.alpha) * k,
    };
  }
  return stops[0]!.color;
}

/** The parameter `t` of a pixel (in the paint's local space), or `null` where the gradient paints nothing. */
type Parameter = (x: number, y: number) => number | null;

function parameterOf(paint: GradientPaint): Parameter | null {
  if (paint.type === 'linear') {
    const dx = paint.end.x - paint.start.x;
    const dy = paint.end.y - paint.start.y;
    const length2 = dx * dx + dy * dy;
    if (length2 === 0) return null;
    return (x, y) => ((x - paint.start.x) * dx + (y - paint.start.y) * dy) / length2;
  }
  if (paint.type === 'radial') {
    if (!(paint.radius > 0)) return null;
    return (x, y) => Math.hypot(x - paint.center.x, y - paint.center.y) / paint.radius;
  }
  const start = (paint.angle * Math.PI) / 180;
  return (x, y) => {
    const angle = Math.atan2(y - paint.center.y, x - paint.center.x) - start;
    return (((angle % TURN) + TURN) % TURN) / TURN;
  };
}

/**
 * The shader of `paint` for a local → raster `matrix`, with `opacity` multiplying the alpha.
 * `parse` reads a stop's color text (a stop whose color does not parse is dropped). `null` when the
 * gradient paints nothing: no usable stop, a zero-length line or radius, or a collapsed matrix.
 */
export function gradientShader(
  paint: GradientPaint,
  matrix: Matrix,
  opacity: number,
  parse: (color: string) => ShaderColor | null,
): Shader | null {
  const stops: Stop[] = [];
  for (const stop of paint.stops) {
    const color = parse(stop.color);
    if (color !== null) stops.push({ offset: stop.offset, color });
  }
  const inverse = invert(matrix);
  const parameter = parameterOf(paint);
  if (stops.length === 0 || inverse === null || parameter === null) return null;
  // Stable by offset, so equal offsets keep their order (a hard edge).
  stops.sort((a, b) => a.offset - b.offset);
  const [a, b, c, d, e, f] = inverse;
  const factor = opacity * (paint.opacity ?? 1);
  return (px, py) => {
    const t = parameter(a * px + c * py + e, b * px + d * py + f);
    if (t === null) return { rgb: [0, 0, 0], alpha: 0 };
    const color = colorAt(stops, t);
    return { rgb: color.rgb, alpha: color.alpha * factor };
  };
}
