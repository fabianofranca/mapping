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

/** How far the stroke moves the arc from the box's outline: `offset` plus the `align` share. */
function strokeShift(stroke: ArcStroke | undefined): number {
  if (stroke === undefined) return 0;
  const share = { inside: -0.5, center: 0, outside: 0.5 }[stroke.align];
  return (stroke.offset ?? 0) + share * stroke.width;
}

/** One cubic Bezier segment of the ellipse from angle `a0` to `a1` (radians). */
function segment(
  c: { cx: number; cy: number; rx: number; ry: number },
  a0: number,
  a1: number,
): string {
  const k = (4 / 3) * Math.tan((a1 - a0) / 4);
  const at = (a: number): [number, number] => [
    c.cx + c.rx * Math.cos(a),
    c.cy + c.ry * Math.sin(a),
  ];
  const slope = (a: number): [number, number] => [
    -c.rx * Math.sin(a),
    c.ry * Math.cos(a),
  ];
  const [px0, py0] = at(a0);
  const [dx0, dy0] = slope(a0);
  const [px1, py1] = at(a1);
  const [dx1, dy1] = slope(a1);
  return `C${fmt(px0 + k * dx0)} ${fmt(py0 + k * dy0)} ${fmt(px1 - k * dx1)} ${fmt(py1 - k * dy1)} ${fmt(px1)} ${fmt(py1)}`;
}

/**
 * The `d` of the arc in the node's box space (the box starts at 0, 0), made of cubic Bezier
 * curves of at most 90° (every renderer draws those). Open, so the stroke follows only the arc and
 * the fill closes on the chord; the whole ellipse is closed with `Z`. A zero sweep, a non-finite
 * angle or a radius that the stroke swallows gives `''` (nothing to draw).
 */
export function arcPath(options: ArcOptions): string {
  const { width, height, startAngle, sweepAngle, stroke } = options;
  if (!Number.isFinite(startAngle) || !Number.isFinite(sweepAngle) || sweepAngle === 0)
    return '';
  const shift = strokeShift(stroke);
  const c = {
    cx: width / 2,
    cy: height / 2,
    rx: width / 2 + shift,
    ry: height / 2 + shift,
  };
  if (!(c.rx > 0) || !(c.ry > 0)) return '';

  const whole = Math.abs(sweepAngle) >= 360;
  const sweep = whole ? Math.sign(sweepAngle) * 360 : sweepAngle;
  const start = startAngle * RAD;
  const count = Math.ceil(Math.abs(sweep) / 90 - 1e-9);
  const step = (sweep * RAD) / count;

  const parts = [
    `M${fmt(c.cx + c.rx * Math.cos(start))} ${fmt(c.cy + c.ry * Math.sin(start))}`,
  ];
  for (let i = 0; i < count; i++)
    parts.push(segment(c, start + i * step, start + (i + 1) * step));
  if (whole) parts.push('Z');
  return parts.join('');
}
