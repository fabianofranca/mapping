// DG3: partial `sides` follow the corner arcs (the band as polygons), and `stroke.cornerRadius`.
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  type ComponentFile,
  type FrameTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import type { FrameNode, Point, Stroke } from '../../../src/model/components/scene';
import { gapOutlines } from '../../../src/model/components/strokeGaps';
import {
  sideStrokes,
  strokeContour,
  strokeRadius,
} from '../../../src/model/components/strokeSides';

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#1F2937' }],
  width: 2,
  align: 'inside',
  ...extra,
});

/** Even-odd point-in-polygon. */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

const covered = (polys: readonly (readonly Point[])[], x: number, y: number): boolean =>
  polys.some((poly) => inside(poly, x, y));

const hasVertex = (polys: readonly (readonly Point[])[], x: number, y: number): boolean =>
  polys.flat().some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6);

describe('sideStrokes: partial sides follow the corner radius', () => {
  // The Divider: a 200 × 16 pill (radius 8), width 2, only the bottom.
  const pill = sideStrokes(stroke({ sides: ['bottom'] }), 200, 16, 8);

  it('["bottom"] gives one band (no straight line) that covers both bottom arcs', () => {
    expect(pill.lines).toEqual([]);
    expect(pill.bands).toHaveLength(1);
    // Bottom-left arc at 135°: the band is between the circle (r 8) and the tapered inner curve.
    expect(covered(pill.bands, 2.343, 12.95)).toBe(true);
    // Bottom-right arc, mirrored.
    expect(covered(pill.bands, 200 - 2.343, 12.95)).toBe(true);
  });

  it('the band is 2 thick at the bottom middle and tapers to 0 at (0, 8) and (200, 8)', () => {
    expect(covered(pill.bands, 100, 15)).toBe(true);
    expect(covered(pill.bands, 100, 13.9)).toBe(false);
    expect(covered(pill.bands, 100, 8)).toBe(false);
    expect(hasVertex(pill.bands, 0, 8)).toBe(true);
    expect(hasVertex(pill.bands, 200, 8)).toBe(true);
    // The band never leaves the box (inside alignment).
    for (const p of pill.bands.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x).toBeLessThanOrEqual(200 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(16 + 1e-6);
    }
  });

  it('on the arc, the band narrows toward the unrequested side', () => {
    // At 135° the tapered band is thinner than the stroke width: a point at 7.5 from the center of
    // the circle (inside the full-width ring of 6..8) is outside the tapered band.
    const k = Math.SQRT1_2;
    expect(covered(pill.bands, 8 - 7.5 * k, 8 + 7.5 * k)).toBe(true);
    expect(covered(pill.bands, 8 - 6.5 * k, 8 + 6.5 * k)).toBe(false);
  });

  it('["bottom", "left"] keeps the full width on the bottom-left arc', () => {
    const both = sideStrokes(stroke({ sides: ['bottom', 'left'] }), 200, 16, 8);
    expect(both.lines).toEqual([]);
    // One connected run: one polygon.
    expect(both.bands).toHaveLength(1);
    const k = Math.SQRT1_2;
    // The point at radius 6.5 (inside the ring 6..8) is covered only with both sides.
    expect(covered(both.bands, 8 - 6.5 * k, 8 + 6.5 * k)).toBe(true);
    expect(covered(both.bands, 8 - 5.5 * k, 8 + 5.5 * k)).toBe(false);
    // The left side is stroked along its straight part and up to the top-left arc's tangent.
    expect(covered(both.bands, 0.5, 8.3)).toBe(true);
  });

  it('two separate sides are two bands', () => {
    const two = sideStrokes(stroke({ sides: ['top', 'bottom'] }), 200, 16, 8);
    expect(two.bands).toHaveLength(2);
  });

  it('a corner with radius 0 stays a straight end with its cap', () => {
    const square = sideStrokes(stroke({ sides: ['bottom'], cap: 'round' }), 100, 40, 0);
    expect(square.bands).toEqual([]);
    expect(square.lines).toEqual([{ x1: 0, y1: 39, x2: 100, y2: 39 }]);
  });

  it('a side with a rounded corner on one end and a square one on the other has a cap on the square end', () => {
    const square = sideStrokes(
      stroke({ sides: ['bottom'], cap: 'square' }),
      100,
      40,
      [0, 0, 0, 10],
    );
    expect(square.bands).toHaveLength(1);
    // The square bottom-right end reaches the box edge (x = 100) like the straight line does, and
    // the square cap goes width/2 past it.
    expect(covered(square.bands, 100.5, 39)).toBe(true);
    expect(covered(square.bands, 101.5, 39)).toBe(false);
    // The bottom-left corner is rounded and tapers: there is no cap there.
    expect(covered(square.bands, -0.5, 39)).toBe(false);
  });

  it('`align` outside and `offset` 2 move the band as they move the line today', () => {
    const outside = sideStrokes(
      stroke({ sides: ['bottom'], align: 'outside', offset: 2 }),
      200,
      16,
      8,
    );
    // Center line at 16 + 1 + 2 = 19: the bottom middle band covers 18..20.
    expect(covered(outside.bands, 100, 19)).toBe(true);
    expect(covered(outside.bands, 100, 17.5)).toBe(false);
    expect(covered(outside.bands, 100, 20.5)).toBe(false);
    // Without a radius the straight line is where it always was.
    const line = sideStrokes(
      stroke({ sides: ['bottom'], align: 'outside', offset: 2 }),
      100,
      40,
      0,
    );
    expect(line.lines).toEqual([{ x1: 0, y1: 43, x2: 100, y2: 43 }]);
  });

  it('`dash` keeps the straight segments, even with a radius', () => {
    const dashed = sideStrokes(stroke({ sides: ['bottom'], dash: [4, 2] }), 200, 16, 8);
    expect(dashed.bands).toEqual([]);
    expect(dashed.lines).toEqual([{ x1: 0, y1: 15, x2: 200, y2: 15 }]);
  });

  it('`scale: false` keeps the straight segments (the width is in screen pixels)', () => {
    const fixed = sideStrokes(stroke({ sides: ['bottom'], scale: false }), 200, 16, 8);
    expect(fixed.bands).toEqual([]);
    expect(fixed.lines).toHaveLength(1);
  });

  it('no `sides` gives nothing: the stroke is the outline', () => {
    expect(sideStrokes(stroke(), 200, 16, 8)).toEqual({ lines: [], bands: [] });
  });
});

describe('stroke.cornerRadius', () => {
  it('on a radius-0 box, 4 with offset 2 and an inside width 2 gives outer radius 4 and inner radius 2', () => {
    const ring = stroke({ cornerRadius: 4, offset: 2 });
    expect(strokeRadius(ring, 0)).toBe(4);
    const { tl, tr, br, bl } = strokeContour(ring, 40, 20, 0);
    for (const center of [tl, tr, br, bl]) {
      expect(center + 1).toBe(4); // outer edge: the center line plus half the width
      expect(center - 1).toBe(2); // inner edge
    }
  });

  it('without it the radius is the node radius plus the offset, as before', () => {
    expect(strokeRadius(stroke({ offset: 2 }), 6)).toBe(8);
    expect(strokeRadius(stroke({ offset: 2 }), 0)).toBe(0);
    expect(strokeRadius(stroke(), [1, 2, 3, 0])).toEqual([1, 2, 3, 0]);
  });

  it('a list gives each corner its own radius', () => {
    const { tl, tr, br, bl } = strokeContour(
      stroke({ cornerRadius: [8, 4, 0, 6], align: 'center', width: 2 }),
      100,
      60,
      0,
    );
    expect([tl, tr, br, bl]).toEqual([8, 4, 0, 6]);
  });

  it('the gap outline takes the stroke radius, not the node radius', () => {
    const gapped = stroke({
      cornerRadius: 6,
      align: 'center',
      gaps: [{ side: 'top', from: 40, to: 60 }],
    });
    const points = gapOutlines(gapped, 100, 40, 0).flat();
    const k = 6 * Math.SQRT1_2;
    // The 45° point of the bottom-right corner arc (radius 6, not a square tip).
    expect(
      points.some(
        (p) => Math.abs(p.x - (94 + k)) < 0.1 && Math.abs(p.y - (34 + k)) < 0.1,
      ),
    ).toBe(true);
    expect(points.some((p) => p.x === 100 && p.y === 40)).toBe(false);
  });

  it('partial sides follow the stroke radius on a radius-0 box', () => {
    const ring = sideStrokes(stroke({ sides: ['bottom'], cornerRadius: 8 }), 200, 16, 0);
    expect(ring.bands).toHaveLength(1);
    expect(hasVertex(ring.bands, 0, 8)).toBe(true);
  });
});

const file = (template: FrameTemplate): ComponentFile => ({
  format: COMPONENT_FORMAT,
  formatVersion: 4,
  id: 't',
  name: 'T',
  size: { width: 100, height: 40 },
  template,
});

function strokeOf(spec: Record<string, unknown>): Stroke | undefined {
  const scene = instantiate(
    file({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 100,
          height: 40,
          stroke: { color: '#000', ...spec },
        },
      ],
    } as FrameTemplate),
    {},
    { x: 0, y: 0, width: 100, height: 40 },
    { measure: approximateMeasurer },
  );
  return (scene.root as FrameNode).children[0]?.stroke;
}

describe('stroke.cornerRadius in the scene', () => {
  it('a number, a list and an expression reach the scene stroke', () => {
    expect(strokeOf({ cornerRadius: 4 })?.cornerRadius).toBe(4);
    expect(strokeOf({ cornerRadius: [4, 0, 2, 1] })?.cornerRadius).toEqual([4, 0, 2, 1]);
    expect(
      strokeOf({ cornerRadius: { $switch: 'k', cases: {}, default: 3 } })?.cornerRadius,
    ).toBe(3);
  });

  it('absent: the scene stroke has no key (draws as before)', () => {
    expect(strokeOf({ width: 2 })).not.toHaveProperty('cornerRadius');
  });
});

describe('stroke.cornerRadius in the component file', () => {
  function withStroke(stroke: unknown, version = 4, type = 'rect'): unknown {
    const node: Record<string, unknown> = { type, width: 100, height: 40, stroke };
    if (type === 'frame') node.children = [];
    return {
      format: COMPONENT_FORMAT,
      formatVersion: version,
      id: 'c',
      name: 'C',
      size: { width: 100, height: 40 },
      template: { type: 'frame', children: [node] },
    };
  }
  const at = 'template.children[0].stroke.cornerRadius';

  it('is valid on rect and frame, as a number, a list and an expression', () => {
    for (const type of ['rect', 'frame'])
      for (const cornerRadius of [4, [4, 0, 2, 1], { $field: 'r', default: 2 }])
        expect(
          validateComponent(withStroke({ color: '#000', cornerRadius }, 4, type)),
        ).not.toContainEqual(expect.stringContaining(at));
  });

  it('on ellipse it is the error at the key, as with sides', () => {
    expect(
      validateComponent(withStroke({ color: '#000', cornerRadius: 4 }, 4, 'ellipse')),
    ).toEqual([`${at}: only valid in frame and rect (this is ellipse)`]);
  });

  it('in formatVersion 3 it is the version error at the key', () => {
    expect(validateComponent(withStroke({ color: '#000', cornerRadius: 4 }, 3))).toEqual([
      `${at}: only allowed with formatVersion 4`,
    ]);
  });

  it('a negative value is an error at the key', () => {
    const issues = validateComponent(withStroke({ color: '#000', cornerRadius: -1 }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(at);
  });
});
