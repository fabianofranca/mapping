/**
 * Solid rectangle without rounded corners whose edges fall on whole device pixels.
 *
 * Two adjacent bands (a `row` of 1:2:1 weights, for example) share the same edge; with the zoom and the
 * canvas offset it falls in the middle of a pixel, each `Rect` covers half of it with
 * antialiasing and the background shows through the other half (a light 1 px line). Aligning the edges
 * to the pixel makes the end of one band and the start of the next the same line, with no blending.
 * Only applies with a matrix without rotation or skew; otherwise (or without a readable matrix, as in
 * jsdom) it draws the scene's rectangle.
 */
import { Rect, type RectConfig } from 'konva/lib/shapes/Rect';
import type { Context } from 'konva/lib/Context';

interface DeviceMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const AXIS_EPSILON = 1e-9;

function deviceMatrix(context: Context): DeviceMatrix | undefined {
  const native: unknown = (context as unknown as { _context?: unknown })._context;
  const getTransform = (native as { getTransform?: () => DeviceMatrix } | undefined)
    ?.getTransform;
  if (typeof getTransform !== 'function') return undefined;
  const m = getTransform.call(native);
  const straight =
    Math.abs(m.b) < AXIS_EPSILON &&
    Math.abs(m.c) < AXIS_EPSILON &&
    m.a > AXIS_EPSILON &&
    m.d > AXIS_EPSILON;
  return straight ? m : undefined;
}

/** Rounds `from..to` (in the device) to whole pixels, with at least 1 pixel if there was area. */
function snap(from: number, to: number): [number, number] {
  const lo = Math.round(from);
  const hi = Math.round(to);
  return hi > lo || to - from <= 0 ? [lo, hi] : [lo, lo + 1];
}

export class PixelRect extends Rect {
  constructor(config?: RectConfig) {
    super(config);
  }

  override _sceneFunc(context: Context): void {
    const m = deviceMatrix(context);
    const width = this.width();
    const height = this.height();
    const radius: number | number[] = this.cornerRadius();
    const square =
      typeof radius === 'number' ? radius === 0 : radius.every((r) => r === 0);
    if (!m || !square) {
      super._sceneFunc(context);
      return;
    }
    const [x0, x1] = snap(m.e, m.a * width + m.e);
    const [y0, y1] = snap(m.f, m.d * height + m.f);
    context.beginPath();
    context.rect((x0 - m.e) / m.a, (y0 - m.f) / m.d, (x1 - x0) / m.a, (y1 - y0) / m.d);
    context.closePath();
    context.fillStrokeShape(this);
  }
}
