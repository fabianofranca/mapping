// EX6 of the "expressions that compute in format 4" stage (#897): the progress-indicator of
// material3-compose draws the arc (circular) and the length (linear) from the fraction, exact for
// any `progress` from 0 to 1, without the tables of 99 and 101 cases from before. The regression against the
// scenes from before (tests/fixtures/material3-ex6-v1.json) and the limits on `$switch` and `$eq` live here.
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode } from '../../src/model/components/scene';
import { solid, spec, text, typeOf } from '../support/material3Library';
import {
  draw,
  drawnPathPoints,
  missingNodes,
  oldScenes,
} from '../support/material3Ex6Fixture';
import type { Drawing, Mode, Values } from '../support/material3Ex6Fixture';

// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data
const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode = 'light'): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};

const drawCircular = (progress?: unknown, mode: Mode = 'light'): Drawing =>
  draw(
    'progress-indicator',
    { shape: 'circular', ...(progress === undefined ? {} : { progress }) } as Values,
    mode,
  );
const drawLinear = (progress?: unknown, mode: Mode = 'light'): Drawing =>
  draw(
    'progress-indicator',
    { shape: 'linear', ...(progress === undefined ? {} : { progress }) } as Values,
    mode,
  );

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const named = (d: Drawing, name: string): SceneNode[] =>
  visible(d).filter((n) => n.name === name);
const names = (d: Drawing): string[] => visible(d).map((n) => n.name);
const rectOf = (d: Drawing, n: SceneNode): number[] => {
  const b = absoluteBoxes(d.root).get(n.id)!;
  return [b.x, b.y, b.width, b.height];
};
const near = (a: number, b: number, eps = 0.01): boolean => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------------------------
// Circular: the arc from the fraction
// ---------------------------------------------------------------------------------------------

/** What Compose does (ProgressIndicator.kt, 549 to 560): the gap in degrees, (4 + 4) / (π × 40) × 360. */
const GAP_SWEEP = ((4 + 4) / (Math.PI * 40)) * 360;
/** The point of the circle of radius 18 centered at (20, 20), `degrees` degrees from 12 o'clock clockwise. */
const onCircle = (degrees: number): [number, number] => [
  20 + 18 * Math.sin((degrees * Math.PI) / 180),
  20 - 18 * Math.cos((degrees * Math.PI) / 180),
];

function arcOf(d: Drawing, name: string) {
  const node = named(d, name)[0] as PathNode;
  const points = drawnPathPoints(node)!;
  return { node, start: points[0]!, end: points[1]! };
}

describe('EX6 progress-indicator — circular: the arc comes from the fraction, for any value', () => {
  it.each([0.333, 0.6667, 0.0123, 0.5, 0.874, 0.9991])(
    "progress %s: the indicator starts at 12 o'clock and ends at 360 × p, on radius 18",
    (p) => {
      const d = drawCircular(p);
      const { node, start, end } = arcOf(d, 'indicador');
      const [ex, ey] = onCircle(360 * p);
      expect(start).toMatchObject({ x: 20, y: 2 });
      expect(near(end.x, ex)).toBe(true);
      expect(near(end.y, ey)).toBe(true);
      // the arc is large when it goes past half a turn, always clockwise
      expect(end.flags).toBe(`${p > 0.5 ? 1 : 0}1`);
      expect(solid(node.stroke?.paints ?? [])).toBe(tok('primary'));
    },
  );

  it.each([0.333, 0.6667, 0.0123, 0.5, 0.874, 0.9])(
    'progress %s: the track goes from 360 × p + gap to -gap (the gap shortens when the arc is short)',
    (p) => {
      const d = drawCircular(p);
      const { start, end } = arcOf(d, 'trilho arco');
      const gap = Math.min(360 * p, GAP_SWEEP);
      const [sx, sy] = onCircle(360 * p + gap);
      const [ex, ey] = onCircle(-gap);
      expect(near(start.x, sx)).toBe(true);
      expect(near(start.y, sy)).toBe(true);
      expect(near(end.x, ex)).toBe(true);
      expect(near(end.y, ey)).toBe(true);
      const sweep = 360 - 360 * p - 2 * gap;
      // negative sweep (little is left): the drawing repeats the arc the opposite way from Compose
      expect(end.flags).toBe(`${sweep > 180 ? 1 : 0}${sweep >= 0 ? 1 : 0}`);
    },
  );

  it('the end point of the arc follows the fraction over the whole range (1,000 values)', () => {
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const d = drawCircular(p);
      const { end } = arcOf(d, 'indicador');
      const [ex, ey] = onCircle(360 * p);
      expect(near(end.x, ex, 0.001) && near(end.y, ey, 0.001), `p=${p}`).toBe(true);
    }
  });

  it('at 0 only the full track and at 1 only the indicator ring, with no degenerate arc', () => {
    const zero = drawCircular(0);
    expect(names(zero)).toEqual(['progress indicator', 'circular', 'trilho completo']);
    const one = drawCircular(1);
    expect(names(one)).toEqual(['progress indicator', 'circular', 'anel completo']);
    expect(solid(named(one, 'anel completo')[0]!.stroke?.paints ?? [])).toBe(
      tok('primary'),
    );
  });

  it('a value outside 0 to 1 is clamped (Compose coerceIn)', () => {
    expect(names(drawCircular(-0.4))).toEqual(names(drawCircular(0)));
    expect(names(drawCircular(1.7))).toEqual(names(drawCircular(1)));
    expect(names(drawCircular(-0))).toEqual(names(drawCircular(0)));
  });

  it('without progress it is the indeterminate frame, with the usual arc and no track', () => {
    for (const d of [drawCircular(), drawCircular(null), drawCircular('')]) {
      expect(names(d)).toEqual([
        'progress indicator',
        'circular',
        'indicador indeterminado',
      ]);
      expect((named(d, 'indicador indeterminado')[0] as PathNode).d).toBe(
        'M20 2A18 18 0 0 1 21.69 37.92',
      );
    }
  });

  it('the colors follow the tokens in light and dark modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = drawCircular(0.4, mode);
      const paint = (name: string) => solid(named(d, name)[0]!.stroke?.paints ?? []);
      expect(paint('indicador')).toBe(tok('primary', mode));
      expect(paint('trilho arco')).toBe(tok('secondary-container', mode));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Linear: the length from the fraction
// ---------------------------------------------------------------------------------------------

const WIDTH = 240;

describe('EX6 progress-indicator — linear: the length comes from the fraction, for any value', () => {
  it.each([0.333, 0.6667, 0.0123, 0.5, 0.9876])(
    'progress %s: the indicator measures p × the width, the bar goes 2 past (round cap) and the track band starts 6 later (and disappears at the end of the lane)',
    (p) => {
      const d = drawLinear(p);
      const [ix, iy, iw] = rectOf(d, named(d, 'indicador')[0]!);
      expect(near(ix!, 0) && near(iw!, p * WIDTH)).toBe(true);
      const [bx, by, bw, bh] = rectOf(d, named(d, 'barra')[0]!);
      expect(near(bx!, 0) && near(bw!, p * WIDTH + 2)).toBe(true);
      expect([by, bh]).toEqual([iy, 4]);
      const [tx, , tw] = rectOf(d, named(d, 'trilho')[0]!);
      expect(near(tx!, p * WIDTH) && near(tw!, WIDTH - p * WIDTH)).toBe(true);
      // L2 (#1078): the band only exists with more lane than the gap of 6 (before it measured 0 and drew nothing), and the
      // stop of 4 only with lane for it; no node goes past the track (warning `content larger than the box`).
      const rest = WIDTH - p * WIDTH;
      const band = named(d, 'faixa')[0];
      if (rest > 6) {
        const [fx, , fw] = rectOf(d, band!);
        expect(near(fx!, p * WIDTH + 6) && near(fw!, rest - 6)).toBe(true);
      } else expect(band).toBeUndefined();
      // the stop sits against the end of the lane
      const stop = named(d, 'parada')[0];
      if (rest >= 4) expect(rectOf(d, stop!)).toEqual([236, iy, 4, 4]);
      else expect(stop).toBeUndefined();
    },
  );

  it('the length follows the fraction over the whole range (1,000 values)', () => {
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const d = drawLinear(p);
      const [, , iw] = rectOf(d, named(d, 'indicador')[0]!);
      expect(near(iw!, p * WIDTH, 0.001), `p=${p}`).toBe(true);
    }
  });

  it('at 0 there is no bar and the track fills everything; at 1 only the full bar', () => {
    const zero = drawLinear(0);
    expect(names(zero)).toEqual([
      'progress indicator',
      'linear',
      'indicador',
      'trilho',
      'faixa total',
      'parada',
    ]);
    expect(rectOf(zero, named(zero, 'faixa total')[0]!).slice(2)).toEqual([WIDTH, 4]);
    const one = drawLinear(1);
    expect(names(one)).toEqual(['progress indicator', 'linear', 'indicador', 'barra']);
    expect(rectOf(one, named(one, 'barra')[0]!)[2]).toBe(WIDTH + 2);
  });

  it('a value outside 0 to 1 is clamped (Compose coerceIn)', () => {
    expect(names(drawLinear(-3))).toEqual(names(drawLinear(0)));
    expect(names(drawLinear(2))).toEqual(names(drawLinear(1)));
    const over = drawLinear(1.5);
    expect(rectOf(over, named(over, 'barra')[0]!)[2]).toBe(WIDTH + 2);
    const under = drawLinear(-0.25);
    expect(rectOf(under, named(under, 'indicador')[0]!)[2]).toBe(0);
    expect(named(under, 'barra')).toEqual([]);
  });

  it('without progress it is the indeterminate frame: the bar from 30% to 70% with the track on both sides', () => {
    for (const d of [drawLinear(), drawLinear(null)]) {
      expect(names(d)).toEqual([
        'progress indicator',
        'linear',
        'trilho antes',
        'faixa antes',
        'indicador',
        'barra indeterminada',
        'trilho',
        'faixa',
        'parada',
      ]);
      expect(rectOf(d, named(d, 'indicador')[0]!)[0]).toBe(72);
      expect(rectOf(d, named(d, 'indicador')[0]!)[2]).toBe(96);
    }
  });

  it('the colors follow the tokens in light and dark modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = drawLinear(0.4, mode);
      expect(solid(named(d, 'barra')[0]!.fills)).toBe(tok('primary', mode));
      expect(solid(named(d, 'faixa')[0]!.fills)).toBe(tok('secondary-container', mode));
      expect(solid(named(d, 'parada')[0]!.fills)).toBe(tok('primary', mode));
    }
  });
});

describe('EX6 progress-indicator — no engine warnings', () => {
  it('draws without warnings at any value, clamped or empty, in both shapes and both modes', () => {
    const values: unknown[] = [
      undefined,
      null,
      '',
      -2,
      -0.1,
      0,
      0.0001,
      0.333,
      0.5,
      0.9999,
      1,
      1.5,
    ];
    for (const mode of ['light', 'dark'] as const) {
      for (const progress of values) {
        expect(
          drawCircular(progress, mode).warnings,
          `circular ${String(progress)}`,
        ).toEqual([]);
        expect(drawLinear(progress, mode).warnings, `linear ${String(progress)}`).toEqual(
          [],
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Regression: the scenes from before the tables, within ≤ 0.5 px per node
// ---------------------------------------------------------------------------------------------

describe('EX6 regression — the progress-indicator from before the tables, within ≤ 0.5 px per node', () => {
  const scenes = oldScenes('progress-');

  it('the 210 recorded scenes exist (3 examples in 2 modes, 101 + 101 values and the 2 indeterminate ones)', () => {
    expect(scenes).toHaveLength(6 + 202 + 2);
  });

  it('every node from before exists now (type, name, box, color and arc points)', () => {
    const failures: string[] = [];
    for (const scene of scenes) {
      // L2 (#1078): the band of width 0 (nothing to draw) and the stop without a lane of 4 are no longer drawn.
      const rest =
        WIDTH * (1 - Math.min(Math.max(Number(scene.values['progress']), 0), 1));
      const linear = scene.values['shape'] === 'linear' && 'progress' in scene.values;
      const missing = missingNodes(
        draw(scene.id, scene.values, scene.mode),
        scene.nodes,
        {
          skip: (o) =>
            (o.n === 'faixa' && o.r[2] === 0) || (linear && o.n === 'parada' && rest < 4),
        },
      );
      if (missing.length > 0) failures.push(`${scene.key}: ${missing.join(' ; ')}`);
    }
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Without tables
// ---------------------------------------------------------------------------------------------

/** Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. */
function offenders(id: string): string[] {
  const numberFields = new Set(
    typeOf(id)
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
      // `trackColor` picks a ColorScheme role (MF5): it is a color enum, not a table of numbers.
      if (count > 12 && obj['$switch'] !== 'trackColor')
        found.push(`${path}: $switch of ${count} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 progress-indicator — without enumerated tables', () => {
  it('has no $switch with more than 12 cases nor $eq over the number field progress', () => {
    expect(offenders('progress-indicator')).toEqual([]);
  });

  it('the file stays lean (the 23 kB from before; the trackColor color roles of MF5 account for the rest)', () => {
    // Before MF5 the limit was 11 kB. `trackColor` carries the `$switch` of the 36 ColorScheme roles in each track node.
    expect(text('components/progress-indicator.json').length).toBeLessThan(27_000);
  });
});
