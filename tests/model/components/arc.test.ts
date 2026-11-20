// FG6: the path data of the parametric elliptical arc of an `ellipse` with `sweepAngle`.
import { describe, expect, it } from 'vitest';
import { arcPath, type ArcStroke } from '../../../src/model/components/arc';

type P = { x: number; y: number };
type Sub = { points: P[]; closed: boolean };

/**
 * Flattens the `M`/`C`/`Z` data `arcPath` writes (the model project cannot import the raster's
 * `flattenPath`, which needs the fonts plugin; `sceneRasterArc.test.ts` goes through the real one).
 */
function flattenPath(d: string): Sub[] {
  const nums = (s: string) => (s.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);
  const subs: Sub[] = [];
  for (const m of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
    const n = nums(m[2]!);
    const sub = subs.at(-1);
    if (m[1] === 'M') subs.push({ points: [{ x: n[0]!, y: n[1]! }], closed: false });
    else if (m[1] === 'Z') sub!.closed = true;
    else {
      const a = sub!.points.at(-1)!;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const u = 1 - t;
        const f = (k: number) =>
          u ** 3 * (k ? a.y : a.x) +
          3 * u * u * t * n[k]! +
          3 * u * t * t * n[2 + k]! +
          t ** 3 * n[4 + k]!;
        sub!.points.push({ x: f(0), y: f(1) });
      }
    }
  }
  return subs;
}

/** Every point of the first subpath of `d`. */
function points(d: string): P[] {
  return flattenPath(d)[0]?.points ?? [];
}

const near = (p: P | undefined, x: number, y: number) => {
  expect(p?.x).toBeCloseTo(x, 3);
  expect(p?.y).toBeCloseTo(y, 3);
};

const circle = (start: number, sweep: number, stroke?: ArcStroke) =>
  arcPath({ width: 40, height: 40, startAngle: start, sweepAngle: sweep, stroke });

describe('arcPath', () => {
  it('start 0 and sweep 90 on a 40 × 40 circle go from (40, 20) to (20, 40), clockwise', () => {
    const pts = points(circle(0, 90));
    near(pts[0], 40, 20);
    near(pts.at(-1), 20, 40);
    // clockwise on screen (y down): the middle is on the lower-right quadrant
    const mid = pts[Math.floor(pts.length / 2)]!;
    expect(mid.x).toBeGreaterThan(20);
    expect(mid.y).toBeGreaterThan(20);
    for (const p of pts) expect(Math.hypot(p.x - 20, p.y - 20)).toBeGreaterThan(19.5);
  });

  it('a negative sweep goes counterclockwise', () => {
    const pts = points(circle(0, -90));
    near(pts[0], 40, 20);
    near(pts.at(-1), 20, 0);
  });

  it('the angle is parametric on an 80 × 40 ellipse', () => {
    const d = arcPath({ width: 80, height: 40, startAngle: 45, sweepAngle: 45 });
    const pts = points(d);
    // parametric 45°: (40 + 40 cos 45°, 20 + 20 sin 45°), not the geometric 45° ray
    near(pts[0], 40 + 40 * Math.SQRT1_2, 20 + 20 * Math.SQRT1_2);
    near(pts.at(-1), 40, 40);
  });

  it('|sweep| ≥ 360 is the whole ellipse (closed) and 0 draws nothing', () => {
    for (const sweep of [360, -360, 720]) {
      const sub = flattenPath(circle(0, sweep))[0]!;
      expect(sub.closed).toBe(true);
      const xs = sub.points.map((p) => p.x);
      expect(Math.min(...xs)).toBeCloseTo(0, 3);
      expect(Math.max(...xs)).toBeCloseTo(40, 3);
    }
    expect(circle(0, 0)).toBe('');
  });

  it('the stroke align moves the arc: inside 36 × 36, outside 44 × 44, center on the outline', () => {
    const reach = (stroke: ArcStroke) => {
      const pts = points(circle(0, 90, stroke));
      return pts[0]!.x - 20; // the radius at the start (0°)
    };
    expect(reach({ width: 4, align: 'inside' })).toBeCloseTo(18, 3);
    expect(reach({ width: 4, align: 'outside' })).toBeCloseTo(22, 3);
    expect(reach({ width: 4, align: 'center' })).toBeCloseTo(20, 3);
    const inside = points(circle(0, 90, { width: 4, align: 'inside' }));
    near(inside[0], 38, 20);
  });

  it('stroke.offset moves the arc out, relative to the align', () => {
    const pts = points(circle(0, 90, { width: 4, align: 'inside', offset: 3 }));
    near(pts[0], 41, 20);
  });

  it('the fill closes on the chord and the stroke does not', () => {
    const sub = flattenPath(circle(0, 90))[0]!;
    expect(sub.closed).toBe(false);
    expect(circle(0, 90)).not.toMatch(/z/i);
  });

  it('a non-finite angle or a radius swallowed by the stroke draws nothing', () => {
    expect(circle(Number.NaN, 90)).toBe('');
    expect(circle(0, 90, { width: 60, align: 'inside' })).toBe('');
  });
});
