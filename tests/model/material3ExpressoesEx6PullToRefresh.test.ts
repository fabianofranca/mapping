// EX6 of the "expressions that compute in format 4" stage (#897): in pull-to-refresh the arc and the arrow of the
// drag indicator come out in the canonical orientation (the arc at 3 o'clock, the arrow beside the center), and
// the angle comes from `rotation` by expression with the Compose numbers (`ArrowValues(1)`,
// `drawArrow`), instead of already-rotated coordinates inside the `d`. The drawing from before (scenes recorded
// in tests/fixtures/material3-ex6-v1.json) stays the same within ≤ 0.5 px per node.
import { describe, expect, it } from 'vitest';
import { walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode } from '../../src/model/components/scene';
import { text, typeOf } from '../support/material3Library';
import {
  draw,
  drawnPathPoints,
  missingNodes,
  oldScenes,
  pathPoints,
  type Drawing,
} from '../support/material3Ex6Fixture';

// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data
const pull = (mode: 'light' | 'dark' = 'light'): Drawing =>
  draw('pull-to-refresh', { isRefreshing: 'false', width: 'fill', height: 'fill' }, mode);
const refreshing = (mode: 'light' | 'dark' = 'light'): Drawing =>
  draw('pull-to-refresh', { isRefreshing: 'true', width: 'fill', height: 'fill' }, mode);

const visiblePaths = (d: Drawing): PathNode[] =>
  [...walk(d.root)].filter(
    (n: SceneNode): n is PathNode => n.visible && n.type === 'path',
  );
const pathNamed = (d: Drawing, name: string): PathNode => {
  const found = visiblePaths(d).filter((n) => n.name === name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};

// ---------------------------------------------------------------------------------------------
// What Compose computes in `ArrowValues(progress = 1)` (PullToRefresh.kt 690 to 708) and in `drawArrow`
// (710 to 732), redone here independently of the component
// ---------------------------------------------------------------------------------------------

const MAX_PROGRESS_ARC = 0.8;
const STROKE_WIDTH = 2.5;
const ARC_RADIUS = 5.5;
const ARROW_WIDTH = 10;
const ARROW_HEIGHT = 5;

function arrowValues(progress: number) {
  const adjustedPercent = (Math.max(Math.min(1, progress) - 0.4, 0) * 5) / 3;
  const overshoot = Math.abs(progress) - 1;
  const linearTension = Math.min(Math.max(overshoot, 0), 2);
  const tension = linearTension - linearTension ** 2 / 4;
  const endTrim = adjustedPercent * MAX_PROGRESS_ARC;
  const rotation = (-0.25 + 0.4 * adjustedPercent + tension) * 0.5;
  return {
    rotation,
    startAngle: rotation * 360,
    endAngle: (rotation + endTrim) * 360,
    scale: Math.min(1, adjustedPercent),
  };
}

const rotate = (
  x: number,
  y: number,
  degrees: number,
  cx = 12,
  cy = 12,
): [number, number] => {
  const rad = (degrees * Math.PI) / 180;
  return [
    cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad),
    cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad),
  ];
};

/** The points of the Compose arc and arrow, in the 24 frame with the center at (12, 12). */
function composeGeometry() {
  const v = arrowValues(1);
  const radius = ARC_RADIUS + STROKE_WIDTH / 2;
  // the arc: drawArc(startAngle, sweep = endAngle - startAngle) inside rotate(values.rotation)
  const arcPoint = (angle: number): [number, number] =>
    rotate(
      12 + radius * Math.cos((angle * Math.PI) / 180),
      12 + radius * Math.sin((angle * Math.PI) / 180),
      v.rotation,
    );
  // the arrow: moveTo(0,0), lineTo(w/2, h), lineTo(w, 0), moved to (radius + cx - inset, cy - strokeWidth)
  const inset = (ARROW_WIDTH * v.scale) / 2;
  const dx = radius + 12 - inset;
  const dy = 12 - STROKE_WIDTH;
  const arrow = [
    [0, 0],
    [(ARROW_WIDTH * v.scale) / 2, ARROW_HEIGHT * v.scale],
    [ARROW_WIDTH * v.scale, 0],
  ].map(([x, y]) => rotate(x! + dx, y! + dy, v.endAngle - STROKE_WIDTH + v.rotation));
  return {
    v,
    arcStart: arcPoint(v.startAngle),
    arcEnd: arcPoint(v.endAngle),
    arrow,
  };
}

const near = (a: readonly number[], b: readonly number[], eps = 0.01) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe('EX6 pull-to-refresh — the arc and the arrow of the drag turn by rotation', () => {
  it('Compose ArrowValues(1): 0.075 of rotation, arc from 27° to 315° (288°) and full arrow', () => {
    const { v } = composeGeometry();
    expect(v.rotation).toBeCloseTo(0.075, 10);
    expect(v.startAngle).toBeCloseTo(27, 10);
    expect(v.endAngle).toBeCloseTo(315, 10);
    expect(v.scale).toBe(1);
  });

  it('the arc has rotation = startAngle + Compose rotation (27.075°) and the d in the canonical orientation', () => {
    for (const mode of ['light', 'dark'] as const) {
      const arc = pathNamed(pull(mode), 'anel');
      expect(arc.rotation, 'arco').toBeCloseTo(27.075, 6);
      // canonical: the arc starts at 3 o'clock (18.75 = 12 + 6.75) and sweeps 288° to the 288° point
      const points = pathPoints(arc.d)!;
      expect(points).toHaveLength(2);
      expect(near([points[0]!.x, points[0]!.y], [18.75, 12])).toBe(true);
      const end = [
        12 + 6.75 * Math.cos((288 * Math.PI) / 180),
        12 + 6.75 * Math.sin((288 * Math.PI) / 180),
      ];
      expect(near([points[1]!.x, points[1]!.y], end)).toBe(true);
      expect(points[1]!.flags).toBe('11');
    }
  });

  it('the arrow has rotation = endAngle − strokeWidth + Compose rotation (312.575°) and the d in the canonical orientation', () => {
    for (const mode of ['light', 'dark'] as const) {
      const arrow = pathNamed(pull(mode), 'seta');
      expect(arrow.rotation, 'seta').toBeCloseTo(312.575, 6);
      // canonical: left corner 1.75 from the center and 2.5 above it, tip 5 to the right and 5 below
      const points = pathPoints(arrow.d)!;
      expect(points.map((p) => [p.x, p.y])).toEqual([
        [13.75, 9.5],
        [18.75, 14.5],
        [23.75, 9.5],
      ]);
    }
  });

  it('once rotated, the ends of the arc and the three points of the arrow fall where the Compose drawCircularIndicator and drawArrow put them', () => {
    const geometry = composeGeometry();
    const d = pull();
    const arc = drawnPathPoints(pathNamed(d, 'anel'))!;
    expect(near([arc[0]!.x, arc[0]!.y], geometry.arcStart)).toBe(true);
    expect(near([arc[1]!.x, arc[1]!.y], geometry.arcEnd)).toBe(true);
    const arrow = drawnPathPoints(pathNamed(d, 'seta'))!;
    geometry.arrow.forEach((p, i) => {
      expect(near([arrow[i]!.x, arrow[i]!.y], p), `point ${i}`).toBe(true);
    });
  });

  it('the "refreshing" state has no rotation: the spinner is the arc from 12 o\'clock and is already in position', () => {
    const d = refreshing();
    expect(pathNamed(d, 'anel').rotation ?? 0).toBe(0);
    expect(visiblePaths(d).map((p) => p.name)).toEqual(['anel']);
  });
});

// ---------------------------------------------------------------------------------------------
// Regression: the scenes from before, within ≤ 0.5 px per node (the path points with the rotation already applied)
// ---------------------------------------------------------------------------------------------

describe('EX6 pull-to-refresh — regression against the scenes from before', () => {
  it('the two examples (refreshing and at rest), light and dark, stay equal within ≤ 0.5 px', () => {
    const scenes = oldScenes('pull-to-refresh-');
    expect(scenes).toHaveLength(4);
    for (const s of scenes)
      expect(missingNodes(draw(s.id, s.values, s.mode), s.nodes), s.key).toEqual([]);
  });

  it('the arc and the arrow from before (rotated coordinates) are found, point by point, in the rotated drawing', () => {
    const scenes = oldScenes('pull-to-refresh-').filter(
      (s) => s.values['isRefreshing'] === 'false',
    );
    expect(scenes).toHaveLength(2);
    for (const s of scenes) {
      const paths = s.nodes.filter((n) => n.t === 'path');
      expect(paths.map((p) => p.n)).toEqual(['anel', 'seta']);
      const d = draw(s.id, s.values, s.mode);
      for (const old of paths) {
        const before = pathPoints(old.d!)!;
        const now = drawnPathPoints(pathNamed(d, old.n))!;
        expect(now, `${s.key} ${old.n}`).toHaveLength(before.length);
        before.forEach((p, i) =>
          expect(near([now[i]!.x, now[i]!.y], [p.x, p.y], 0.5)).toBe(true),
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Without tables
// ---------------------------------------------------------------------------------------------

/** Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. */
function offenders(): string[] {
  const numberFields = new Set(
    typeOf('pull-to-refresh')
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const count = Object.keys(cases).length;
      if (count > 12) found.push(`${path}: $switch of ${count} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text('components/pull-to-refresh.json')), 'pull-to-refresh');
  return found;
}

describe('EX6 pull-to-refresh — without enumerated tables', () => {
  it('there is no $switch with more than 12 cases nor $eq over a number field', () => {
    expect(offenders()).toEqual([]);
  });
});
