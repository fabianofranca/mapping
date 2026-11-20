// The arc of an `ellipse` with `sweepAngle` (format 4), like Compose's `drawArc` without the
// center: the path data of the parametric elliptical arc on the box's ellipse, moved by the
// stroke's `align` and `offset` so the stroke sits where the whole ellipse's would. Pure; no DOM.

export interface ArcStroke {
  readonly width: number;
  readonly align: 'inside' | 'center' | 'outside';
  /** `stroke.offset` in px (≥ 0): the arc moves out by this much. */
  readonly offset?: number;
}

export interface ArcOptions {
  readonly width: number;
  readonly height: number;
  /** Degrees; 0 points right and the angle grows clockwise (y down). Parametric. */
  readonly startAngle: number;
  /** Degrees; negative goes counterclockwise, `|sweepAngle| ≥ 360` is the whole ellipse. */
  readonly sweepAngle: number;
  readonly stroke?: ArcStroke;
}

const RAD = Math.PI / 180;

/** Rounds to 1e-4 so the data is stable and short (and -0 becomes 0). */
const fmt = (n: number): string => String(Math.round(n * 1e4) / 1e4 || 0);

/**
 * The `d` of the arc in the node's box space (the box starts at 0, 0), made of cubic Béziers of at
 * most 90° (every renderer draws those). Open, so the stroke follows only the arc and the fill
 * closes on the chord; the whole ellipse is closed with `Z`. A zero sweep, a non-finite angle or
 * a radius that the stroke swallows gives `''` (nothing to draw).
 */
export function arcPath(options: ArcOptions): string {
  const { width, height, startAngle, sweepAngle, stroke } = options;
  if (!Number.isFinite(startAngle) || !Number.isFinite(sweepAngle) || sweepAngle === 0)
    return '';
  const shift =
    (stroke?.offset ?? 0) +
    (stroke === undefined || stroke.align === 'center'
      ? 0
      : stroke.align === 'inside'
        ? -stroke.width / 2
        : stroke.width / 2);
  const rx = width / 2 + shift;
  const ry = height / 2 + shift;
  if (!(rx > 0) || !(ry > 0)) return '';
  const cx = width / 2;
  const cy = height / 2;

  const whole = Math.abs(sweepAngle) >= 360;
  const sweep = whole ? Math.sign(sweepAngle) * 360 : sweepAngle;
  const start = startAngle * RAD;
  const total = sweep * RAD;
  const count = Math.ceil(Math.abs(sweep) / 90 - 1e-9);
  const step = total / count;
  const k = (4 / 3) * Math.tan(step / 4);

  const at = (a: number): [number, number] => [
    cx + rx * Math.cos(a),
    cy + ry * Math.sin(a),
  ];
  const slope = (a: number): [number, number] => [-rx * Math.sin(a), ry * Math.cos(a)];

  const [x0, y0] = at(start);
  const parts = [`M${fmt(x0)} ${fmt(y0)}`];
  for (let i = 0; i < count; i++) {
    const a0 = start + i * step;
    const a1 = a0 + step;
    const [px0, py0] = at(a0);
    const [dx0, dy0] = slope(a0);
    const [px1, py1] = at(a1);
    const [dx1, dy1] = slope(a1);
    parts.push(
      `C${fmt(px0 + k * dx0)} ${fmt(py0 + k * dy0)} ${fmt(px1 - k * dx1)} ${fmt(py1 - k * dy1)} ${fmt(px1)} ${fmt(py1)}`,
    );
  }
  if (whole) parts.push('Z');
  return parts.join('');
}
