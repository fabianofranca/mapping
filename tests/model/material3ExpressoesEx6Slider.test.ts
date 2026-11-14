// EX6 of the "expressions that compute in format 4" stage (#897), decisions 14, 16 and 18: the slider of
// material3-compose reads `value`, `valueStart` and `valueEnd` as a number (0 to 1), takes the handle to the
// nearest step (`steps`, like the Compose `SliderState`) and draws the marks by computing
// (`repeat` by `count`), without the tables of tenths and without the 9-mark limit. The regression against
// the scenes from before (tests/fixtures/material3-ex6-v1.json) and the limits on `$switch` and `$eq` live
// here too.
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { instantiate, approximateMeasurer } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { absoluteBoxes, hasChildren } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { defaultValues } from '../../src/model/libraryDrawing';
import { compositeOver, isComposite } from '../support/material3Composite';
import { solid, spec, text, typeOf } from '../support/material3Library';
import { catalog, draw, missingNodes, oldScenes } from '../support/material3Ex6Fixture';
import type {
  Drawing,
  Mode,
  OldNode,
  OldScene,
  Values,
} from '../support/material3Ex6Fixture';

// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex6-v1.json are Portuguese data
const slider = findEntry(catalog, 'slider')!;

/** The recorded scenes keep the text the enum stored ("0.3"): the field is now a number. */
function numeric(values: Values): Values {
  const out: Record<string, unknown> = { ...values };
  for (const key of ['value', 'valueStart', 'valueEnd'])
    if (typeof out[key] === 'string') out[key] = Number(out[key]);
  return out as Values;
}

/** Draws on an instance of any width (the component's `$size.width`). */
function drawAt(values: Values, width: number, mode: Mode = 'light'): Drawing {
  const library = catalog.library!;
  return instantiate(
    slider.component!,
    { ...defaultValues(slider.type), ...values },
    { x: 0, y: 0, width, height: 48 },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

interface Found {
  readonly node: SceneNode;
  readonly ancestors: readonly SceneNode[];
}

/** The visible nodes that satisfy `pred`, with the list of ancestors (from the outermost to the parent). */
function collect(d: Drawing, pred: (n: SceneNode) => boolean): Found[] {
  const out: Found[] = [];
  const visit = (node: SceneNode, ancestors: readonly SceneNode[]) => {
    if (!node.visible) return;
    if (pred(node)) out.push({ node, ancestors });
    if (hasChildren(node))
      for (const child of node.children) visit(child, [...ancestors, node]);
  };
  visit(d.root, []);
  return out;
}

const centerX = (d: Drawing, node: SceneNode): number => {
  const b = absoluteBoxes(d.root).get(node.id)!;
  return b.x + b.width / 2;
};
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;

/** The center of the visible handles, in drawing order (in range: start and end). */
const handles = (d: Drawing): { x: number; width: number }[] =>
  collect(d, (n) => n.type === 'rect' && n.name === 'alça').map(({ node }) => ({
    x: centerX(d, node),
    width: boxOf(d, node).width,
  }));

// ---------------------------------------------------------------------------------------------
// The expected computation (written here, not copied from the fixture): Compose's `SliderState`
// ---------------------------------------------------------------------------------------------

const count = (steps: unknown): number =>
  typeof steps === 'number' && steps >= 1 ? Math.floor(steps) : 0;
const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
/** The snapped value: `coerceIn(0f..1f)` and the nearest step (Slider.kt 2751 to 2759 and 2192 to 2194). */
function snapped(v: number, steps: unknown): number {
  const n = count(steps);
  const c = clamp01(v);
  return n > 0 ? Math.round(c * (n + 1)) / (n + 1) : c;
}

interface Expected {
  readonly n: number;
  readonly inset: number;
  readonly track: number;
  /** The center of the handle (single) or of the start and end handles (range), in instance px. */
  readonly centers: number[];
}

function expected(
  values: {
    type?: string;
    value?: number;
    valueStart?: number;
    valueEnd?: number;
    steps?: unknown;
  },
  width: number,
): Expected {
  const n = count(values.steps);
  const range = values.type === 'range';
  const fractions = range
    ? [
        snapped(values.valueStart ?? 0.2, values.steps),
        snapped(values.valueEnd ?? 0.8, values.steps),
      ]
    : [snapped(values.value ?? 0.5, values.steps)];
  // the inset of 8 at the ends: with steps, always in range and, in single, only with the handle off the ends
  const interior = (q: number) => q > 0 && q < 1;
  const inset = n > 0 && (range || interior(fractions[0]!)) ? 8 : 0;
  const track = width - 4 - 2 * inset;
  return { n, inset, track, centers: fractions.map((q) => 2 + inset + q * track) };
}

/** Checks the handles and tracks of a drawing against the computation. */
function expectGeometry(
  values: Parameters<typeof expected>[0],
  width: number,
  mode: Mode = 'light',
) {
  const d = drawAt(values as Values, width, mode);
  const e = expected(values, width);
  const hs = handles(d);
  expect(hs.length, 'handles').toBe(e.centers.length);
  hs.forEach((h, i) => expect(h.x, `handle ${i}`).toBeCloseTo(e.centers[i]!, 2));
  const active = collect(d, (n) => n.type === 'rect' && n.name === 'trilho ativo');
  const inactive = collect(d, (n) => n.type === 'rect' && n.name === 'trilho inativo');
  // the segment that does not exist comes out with width 0: only those with width count
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  const edges = (found: Found[]) =>
    found
      .filter(({ node }) => boxOf(d, node).width > 1e-6)
      .map(({ node }) => [
        r(boxOf(d, node).x),
        r(boxOf(d, node).x + boxOf(d, node).width),
      ]);
  const first = e.centers[0]!;
  const last = e.centers[e.centers.length - 1]!;
  if (e.centers.length === 1) {
    // single: the active segment goes from the edge to 8 before the handle; the inactive one, from 8 after it to the edge
    expect(edges(active), 'active segment').toEqual(
      first - 8 > 2 ? [[2, r(first - 8)]] : [],
    );
    expect(edges(inactive), 'inactive segment').toEqual(
      first + 8 < width - 2 ? [[r(first + 8), width - 2]] : [],
    );
  } else {
    expect(edges(active), 'active segment').toEqual(
      last - 8 > first + 8 ? [[r(first + 8), r(last - 8)]] : [],
    );
    expect(edges(inactive), 'inactive segments').toEqual([
      ...(first - 8 > 2 ? [[2, r(first - 8)]] : []),
      ...(last + 8 < width - 2 ? [[r(last + 8), width - 2]] : []),
    ]);
  }
  return { d, e };
}

// ---------------------------------------------------------------------------------------------
// The handle at the nearest step
// ---------------------------------------------------------------------------------------------

describe('EX6 slider — the value is a number and the handle goes to the nearest step', () => {
  it('value 0.37 with steps 4 draws the handle at 0.4 (and not at 0.37)', () => {
    const d = draw('slider', { type: 'single', value: 0.37, steps: 4 });
    const [handle] = handles(d);
    // track of 308 starting at 10: 10 + 0.4 × 308 = 133.2
    expect(handle!.x).toBeCloseTo(133.2, 2);
    expect(handle!.x).not.toBeCloseTo(10 + 0.37 * 308, 1);
    // and the rest follows the same value: the active segment stops 8 before the handle
    const active = collect(d, (n) => n.type === 'rect' && n.name === 'trilho ativo');
    expect(boxOf(d, active[0]!.node).width).toBeCloseTo(133.2 - 8 - 2, 2);
  });

  it('the same value 0.37 without steps (continuous) stays where it is, and steps 0 or empty too', () => {
    for (const steps of [null, 0, undefined] as const) {
      const d = draw('slider', { type: 'single', value: 0.37, steps });
      expect(handles(d)[0]!.x).toBeCloseTo(2 + 0.37 * 324, 2);
    }
  });

  it('in range, valueStart and valueEnd go to the nearest step the same way', () => {
    const d = draw('slider', {
      type: 'range',
      valueStart: 0.37,
      valueEnd: 0.83,
      steps: 4,
    });
    const [start, end] = handles(d);
    expect(start!.x).toBeCloseTo(10 + 0.4 * 308, 2);
    expect(end!.x).toBeCloseTo(10 + 0.8 * 308, 2);
  });

  it('the nearest step applies to any steps: 1, 2, 3, 4, 7, 12 and 30', () => {
    for (const steps of [1, 2, 3, 4, 7, 12, 30])
      for (let i = 0; i <= 40; i++) {
        const value = i / 40 + 0.0123;
        expectGeometry({ type: 'single', value, steps }, 328);
      }
  });

  it('a value outside 0 to 1 clamps to 0..1, with or without steps', () => {
    for (const steps of [null, 4]) {
      const low = draw('slider', { type: 'single', value: -0.2, steps });
      const zero = draw('slider', { type: 'single', value: 0, steps });
      const high = draw('slider', { type: 'single', value: 1.7, steps });
      const one = draw('slider', { type: 'single', value: 1, steps });
      expect(handles(low)).toEqual(handles(zero));
      expect(handles(high)).toEqual(handles(one));
    }
    const range = draw('slider', { type: 'range', valueStart: -1, valueEnd: 3 });
    const [start, end] = handles(range);
    expect(start!.x).toBeCloseTo(2, 2);
    expect(end!.x).toBeCloseTo(326, 2);
  });

  it('an empty value uses the field default (0.5; 0.2 and 0.8)', () => {
    for (const empty of [null, undefined, '']) {
      const single = draw('slider', { type: 'single', value: empty as never });
      expect(handles(single)[0]!.x).toBeCloseTo(2 + 0.5 * 324, 2);
      const range = draw('slider', {
        type: 'range',
        valueStart: empty as never,
        valueEnd: empty as never,
      });
      expect(handles(range).map((h) => h.x)).toEqual([
        expect.closeTo(2 + 0.2 * 324, 2),
        expect.closeTo(2 + 0.8 * 324, 2),
      ]);
    }
  });

  it('a non-integer steps counts as the integer below (4.7 draws as 4)', () => {
    const a = draw('slider', { type: 'single', value: 0.37, steps: 4.7 });
    const b = draw('slider', { type: 'single', value: 0.37, steps: 4 });
    expect(handles(a)).toEqual(handles(b));
    expect(marksOf(a)).toEqual(marksOf(b));
  });

  it('the inset of 8 at the ends disappears when the snapped value falls on the end (0.03 with steps 4 is 0)', () => {
    const d = draw('slider', { type: 'single', value: 0.03, steps: 4 });
    expect(handles(d)[0]!.x).toBeCloseTo(2, 2);
    const e = draw('slider', { type: 'single', value: 0.98, steps: 4 });
    expect(handles(e)[0]!.x).toBeCloseTo(326, 2);
    // off the end, the inset comes back
    const f = draw('slider', { type: 'single', value: 0.2, steps: 4 });
    expect(handles(f)[0]!.x).toBeCloseTo(10 + 0.2 * 308, 2);
  });

  it('follows the width of the instance ($size): handle, tracks and marks at 200 and at 640', () => {
    for (const width of [120, 200, 328, 640]) {
      for (const steps of [null, 4, 12]) {
        for (const type of ['single', 'range']) {
          expectGeometry(
            { type, value: 0.37, valueStart: 0.26, valueEnd: 0.83, steps },
            width,
          );
        }
      }
    }
  });

  it('the interaction state narrows the handle (2) at the snapped value, and the disabled state wins', () => {
    const d = draw('slider', {
      type: 'single',
      value: 0.37,
      steps: 4,
      interaction: 'focused',
    });
    expect(handles(d)).toEqual([{ x: expect.closeTo(133.2, 2), width: 2 }]);
    const off = draw('slider', {
      type: 'single',
      value: 0.37,
      steps: 4,
      interaction: 'pressed',
      enabled: 'false',
    });
    expect(handles(off)).toEqual([{ x: expect.closeTo(133.2, 2), width: 4 }]);
  });
});

// ---------------------------------------------------------------------------------------------
// The marks: exactly those of steps, at any steps
// ---------------------------------------------------------------------------------------------

type Kind = 'secondary' | 'primary';
interface Mark {
  readonly x: number;
  readonly kind: Kind;
}

const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};

/** The Compose disabled state as an opaque color (MF4): on-surface at `alpha` composited over surface. */
const disabledColor = (
  alpha: 'state-disabled-container' | 'state-disabled-content',
  mode: Mode,
) =>
  compositeOver(tok('on-surface', mode), tokens[alpha] as number, tok('surface', mode));

/**
 * The kind of a drawn mark: `secondary-container` over the active segment, `primary` outside it. In the
 * disabled state the mark is opaque: on-surface at 0.12 over surface (the one that was `secondary`) or at 0.38 (the `primary`).
 */
function kindOf(d: Drawing, node: SceneNode, mode: Mode, enabled: boolean): Kind {
  if (!enabled) {
    expect(node.opacity, 'disabled mark without an opacity layer').toBe(1);
    const color = solid(node.fills);
    if (isComposite(color, disabledColor('state-disabled-container', mode)))
      return 'secondary';
    expect(color, 'disabled mark: on-surface at 0.38 over surface').toSatisfy(
      (c: string | undefined) =>
        isComposite(c, disabledColor('state-disabled-content', mode)),
    );
    return 'primary';
  }
  return solid(node.fills) === tok('secondary-container', mode) ? 'secondary' : 'primary';
}

/** The visible marks (the `repeat` ones, inside the row), by position. */
function marksOf(d: Drawing, mode: Mode = 'light', enabled = true): Mark[] {
  return collect(d, (n) => n.type === 'ellipse' && n.name === 'marca')
    .map(({ node }) => ({ x: boxOf(d, node).x, kind: kindOf(d, node, mode, enabled) }))
    .sort((a, b) => a.x - b.x);
}

/**
 * The marks the computation asks for: mark k sits at `8 + (width - 20) × k / (steps + 1)`. With steps,
 * between the handles (or before the single handle) it is `secondary-container`, outside them it is `primary`, and the
 * one that would fall under a handle is not drawn. Without steps there are only the two ends and only the `primary` ones
 * (before the start handle and after the end handle, comparing the mark position with the handle's
 * in px); the first of the single does not exist and the last only appears with an inactive segment after it.
 */
function expectedMarks(
  values: {
    type?: string;
    value?: number;
    valueStart?: number;
    valueEnd?: number;
    steps?: unknown;
  },
  width: number,
): Mark[] {
  const n = count(values.steps);
  const parts = n + 1;
  const range = values.type === 'range';
  // the handle in step units: an integer with steps; without, the fraction itself (the two ends are 0 and 1)
  const place = (v: number) => (n > 0 ? Math.round(clamp01(v) * parts) : clamp01(v));
  const first = range ? place(values.valueStart ?? 0.2) : -1;
  const last = place(range ? (values.valueEnd ?? 0.8) : (values.value ?? 0.5));
  const out: Mark[] = [];
  for (let k = 0; k <= parts; k++) {
    const s = Math.min(k - first, last - k);
    if (Math.abs(s) < 1e-6) continue;
    if (s > 0 && n === 0) continue; // without steps there is no mark over the active segment
    if (s < 0 && n === 0 && !range && k === 0) continue;
    out.push({
      x: 8 + ((width - 20) * k) / parts,
      kind: s > 0 ? 'secondary' : 'primary',
    });
  }
  return out;
}

function expectMarks(
  values: Parameters<typeof expectedMarks>[0] & { enabled?: string },
  width: number,
  mode: Mode = 'light',
) {
  const d = drawAt(values as Values, width, mode);
  const got = marksOf(d, mode, values.enabled !== 'false');
  const want = expectedMarks(values, width);
  expect(got.length, JSON.stringify(values)).toBe(want.length);
  got.forEach((m, i) => {
    expect(m.x, `x of mark ${i}`).toBeCloseTo(want[i]!.x, 3);
    expect(m.kind, `kind of mark ${i}`).toBe(want[i]!.kind);
  });
  return got;
}

describe('EX6 slider — the marks of steps', () => {
  it('draws steps marks between the ends (plus the two ends) for any steps, and not 9 from 10 onward', () => {
    for (const steps of [1, 2, 4, 9, 10, 12, 20, 30]) {
      for (const width of [328, 200]) {
        // the value in the middle and off any step: no mark falls under the handle by accident
        const values = { type: 'single', value: 0.5, steps };
        const marks = expectMarks(values, width);
        const at = (k: number) => 8 + ((width - 20) * k) / (steps + 1);
        // marks k = 0 and k = steps + 1 are the ends; between them, exactly steps minus the handle's
        const underHandle = Math.round(0.5 * (steps + 1));
        const between = marks.filter(
          (m) => m.x > at(0) + 0.01 && m.x < at(steps + 1) - 0.01,
        );
        expect(between.length, `steps ${steps}`).toBe(steps - 1);
        expect(marks.map((m) => m.x)).not.toContainEqual(
          expect.closeTo(at(underHandle), 3),
        );
        // with the handle on a step, the other steps - 1 intermediates and the two ends appear
        expect(marks.length).toBe(steps + 1);
      }
    }
  });

  it('steps 12 draws the 12 marks (before: 9) and the handle falls on the step of 13 parts', () => {
    const d = draw('slider', { type: 'single', value: 0.5, steps: 12 });
    const marks = marksOf(d);
    // 0.5 × 13 = 6.5 rounds to 7: mark 7 sits under the handle and is not drawn
    expect(handles(d)[0]!.x).toBeCloseTo(10 + (7 / 13) * 308, 2);
    expect(marks.length).toBe(13); // 12 intermediates + 2 ends - 1 under the handle
    expect(marks.filter((m) => m.kind === 'secondary').length).toBe(7); // k = 0..6
    expect(marks.filter((m) => m.kind === 'primary').length).toBe(6); // k = 8..13
  });

  it('without steps (empty, 0 or less than 1) there is only the end mark, and only with an inactive segment after the handle', () => {
    for (const steps of [null, undefined, 0, 0.5]) {
      const d = draw('slider', { type: 'single', value: 0.4, steps });
      expect(marksOf(d)).toEqual([{ x: expect.closeTo(316, 3), kind: 'primary' }]);
      expect(marksOf(draw('slider', { type: 'single', value: 1, steps }))).toEqual([]);
    }
    // the range also has the start mark, before the start handle
    const range = draw('slider', { type: 'range', valueStart: 0.3, valueEnd: 0.6 });
    expect(marksOf(range).map((m) => m.x)).toEqual([8, expect.closeTo(316, 3)]);
  });

  it('the range paints the marks between the handles and outside them in different colors, and the count is that of steps', () => {
    const d = draw('slider', {
      type: 'range',
      valueStart: 0.3,
      valueEnd: 0.7,
      steps: 12,
    });
    const marks = marksOf(d);
    // 0.3 × 13 = 3.9 → 4 and 0.7 × 13 = 9.1 → 9: marks 4 and 9 sit under the handles
    expect(marks.length).toBe(14 - 2);
    expect(marks.filter((m) => m.kind === 'secondary').length).toBe(4); // k = 5..8
    expect(marks.filter((m) => m.kind === 'primary').length).toBe(8);
  });

  it('follows the computation in all types, widths, steps and values (including the ends)', () => {
    for (const width of [200, 328]) {
      for (const steps of [null, 1, 4, 12, 25]) {
        for (const value of [0, 0.03, 0.37, 0.5, 0.98, 1]) {
          expectMarks({ type: 'single', value, steps }, width);
          expectMarks(
            { type: 'range', valueStart: value, valueEnd: 1 - value / 2, steps },
            width,
          );
        }
      }
    }
  });

  it('40 steps draw 40 marks between the ends', () => {
    const d = draw('slider', { type: 'single', value: 0.5, steps: 40 });
    expect(marksOf(d).length).toBe(41); // 40 + 2 ends - 1 under the handle
  });

  it('disabled (enabled false): the marks follow the state opacities', () => {
    for (const mode of ['light', 'dark'] as const)
      expectMarks({ type: 'single', value: 0.37, steps: 4, enabled: 'false' }, 328, mode);
  });
});

// ---------------------------------------------------------------------------------------------
// Many steps: the strip in place of the marks (VL3 of stage #1504, decisions 3, 17 and 18)
// ---------------------------------------------------------------------------------------------

/** The strip of 4 that each segment draws when the marks do not fit (the `rect` "faixa de passos"). */
function stripsOf(d: Drawing, mode: Mode, enabled: boolean) {
  return collect(d, (n) => n.type === 'rect' && n.name === 'faixa de passos')
    .map(({ node }) => {
      const b = boxOf(d, node);
      return {
        x: b.x,
        width: b.width,
        height: b.height,
        kind: kindOf(d, node, mode, enabled),
      };
    })
    .sort((a, b) => a.x - b.x);
}

/** The strips the computation asks for: from one mark to the other (4 more in width), per segment. */
function expectedStrips(
  values: { type?: string; value?: number; valueStart?: number; valueEnd?: number },
  steps: number,
  width: number,
) {
  const parts = steps + 1;
  const sp = (width - 20) / parts;
  const range = values.type === 'range';
  const first = range ? Math.round(clamp01(values.valueStart ?? 0.2) * parts) : -1;
  const last = Math.round(
    clamp01((range ? values.valueEnd : values.value) ?? (range ? 0.8 : 0.5)) * parts,
  );
  const out: { x: number; width: number; kind: Kind }[] = [];
  const add = (from: number, to: number, kind: Kind) => {
    if (to >= from) out.push({ x: 8 + from * sp, width: (to - from) * sp + 4, kind });
  };
  if (range) add(0, first - 1, 'primary');
  add(range ? first + 1 : 0, last - 1, 'secondary');
  add(last + 1, parts, 'primary');
  return out;
}

describe('EX6 slider — many steps: strip in place of the marks (#1506)', () => {
  const cases = [
    { type: 'single', value: 0.5 },
    { type: 'single', value: 0.37 },
    { type: 'range', valueStart: 0.2, valueEnd: 0.8 },
    { type: 'range', valueStart: 0.1, valueEnd: 0.9 },
  ];

  for (const enabled of ['true', 'false']) {
    for (const mode of ['light', 'dark'] as const) {
      it(`328 with steps 2000 (enabled ${enabled}, ${mode}): no warnings, no marks and a strip of 4 per segment`, () => {
        for (const c of cases) {
          const values = { ...c, steps: 2000, enabled } as Values;
          const d = drawAt(values, 328, mode);
          expect(d.warnings.join('|'), JSON.stringify(c)).not.toContain(
            'repeat limited',
          );
          expect(d.warnings.join('|')).not.toContain('marks');
          expect(marksOf(d, mode, enabled === 'true'), 'marks').toEqual([]);
          const got = stripsOf(d, mode, enabled === 'true');
          const want = expectedStrips(c, 2000, 328);
          expect(got.length, JSON.stringify(c)).toBe(want.length);
          got.forEach((s, i) => {
            expect(s.height).toBe(4);
            expect(s.x, `x ${i}`).toBeCloseTo(want[i]!.x, 3);
            expect(s.width, `width ${i}`).toBeCloseTo(want[i]!.width, 3);
            expect(s.kind, `kind ${i}`).toBe(want[i]!.kind);
          });
        }
      });
    }
  }

  it('the threshold: the spacing between centers just above 1 draws marks, just below it the strip', () => {
    // (328 - 20) / (steps + 1) = 1 at steps = 307: 306 gives 1.003 (marks), 308 gives 0.997 (strip)
    for (const [steps, dense] of [
      [306, false],
      [307, false],
      [308, true],
    ] as const) {
      const d = drawAt({ type: 'single', value: 0.5, steps } as Values, 328);
      expect(marksOf(d).length > 0, `steps ${steps}`).toBe(!dense);
      expect(stripsOf(d, 'light', true).length > 0, `steps ${steps}`).toBe(dense);
    }
  });

  it('steps + 2 at 1000 draws marks and at 1001, the strip, on a large width', () => {
    // 998 + 2 = 1000 (marks); 999 + 2 = 1001 (strip); with a width of 5000 the spacing goes past 4
    const at998 = drawAt({ type: 'single', value: 0.5, steps: 998 } as Values, 5000);
    expect(marksOf(at998).length).toBeGreaterThan(0);
    expect(stripsOf(at998, 'light', true)).toEqual([]);
    expect(at998.warnings.join('|')).not.toContain('repeat limited');
    const at999 = drawAt({ type: 'single', value: 0.5, steps: 999 } as Values, 5000);
    expect(marksOf(at999)).toEqual([]);
    expect(stripsOf(at999, 'light', true).length).toBe(2);
    expect(at999.warnings.join('|')).not.toContain('repeat limited');
  });

  it('without steps and below the threshold there is no strip', () => {
    for (const steps of [undefined, 0, 12, 40])
      expect(
        stripsOf(drawAt({ type: 'range', steps } as Values, 328), 'light', true),
      ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Regression: the scenes from before (decision 16, within ≤ 0.5 px per node)
// ---------------------------------------------------------------------------------------------

const grid = (v: number, steps: number): boolean =>
  Math.abs(v * (steps + 1) - Math.round(v * (steps + 1))) < 1e-9;

/** The drawing from before holds (the values are already on the step grid, and the steps is the one from before). */
function unchanged(scene: OldScene): boolean {
  const v = scene.values as Record<string, unknown>;
  const steps = v['steps'];
  if (steps === undefined || steps === null || steps === 0) return true;
  if (typeof steps !== 'number' || steps > 9) return false;
  const nums = ['value', 'valueStart', 'valueEnd']
    .filter((k) => v[k] !== undefined)
    .map((k) => Number(v[k]));
  return nums.every((x) => grid(x, steps));
}

// The nodes from before that the new construction does not have, on purpose (none of them draws a pixel; those that
// draw, `trilho ativo`, `trilho inativo`, `alça` and `marca`, match in name, box, color and
// opacity):
// - the layout frames (`trilhas`, `recuo`, `pista`, `antes do início`, `trecho ativo`,
//   `depois do fim`, `marcas e alças`, `meio`, `recorte`, `base`, `régua`, `marcas sobre o trecho
//   ativo`, `marcas sobre o trecho inativo`, `fim`): the inset of 8 stopped being a frame and became
//   part of the computation of the segment widths (the segments now start at the edge of the strip, and the strip is the
//   old `trilhas`), and the trick of the ruler and the clip (the `primary` marks only appear outside
//   the active segment) became a computation per mark. The `faixa` stays, with the box of `trilhas`;
// - the marks that sat under another (the `secondary-container` one on the inactive segment, the
//   `primary` one on the active), those that sat under the handle and those with `none` fill (the invisible
//   ends): the mark that appears is the same, and `expectMarks` checks the position and color of all of them.
const KEPT_FRAMES = new Set(['slider', 'faixa']);

function skipOld(scene: OldScene, mode: Mode) {
  const enabled = (scene.values as Record<string, unknown>)['enabled'] !== 'false';
  // the handle centers in the scene from before (`alça` nodes: the start and the end one, in drawing order)
  const centers = scene.nodes
    .filter((o) => o.t === 'rect' && o.n === 'alça')
    .map((o) => o.r[0]! + o.r[2]! / 2);
  const range = (scene.values as Record<string, unknown>)['type'] === 'range';
  const steps = (scene.values as Record<string, unknown>)['steps'];
  const hasSteps = typeof steps === 'number' && steps >= 1;
  const secondaryFill = tok('secondary-container', mode);
  return (o: OldNode): boolean => {
    if (o.t === 'frame') return !KEPT_FRAMES.has(o.n);
    if (o.t !== 'ellipse') return false;
    if (o.f === undefined) return true; // the invisible end (`none`)
    // range without steps with both handles at the end: the end mark sat over the end of the track
    if (range && !hasSteps && centers.every((c) => c > 318)) return true;
    const centre = o.r[0]! + 2;
    if (centers.some((c) => Math.abs(c - centre) < 1)) return true; // under the handle
    const active = range
      ? centers.length === 2 && centre > centers[0]! && centre < centers[1]!
      : centre < centers[0]!;
    const old: Kind = enabled
      ? o.f === secondaryFill
        ? 'secondary'
        : 'primary'
      : o.o !== undefined && Math.abs(o.o - 0.12) < 0.01
        ? 'secondary'
        : 'primary';
    return old !== (active ? 'secondary' : 'primary');
  };
}

/**
 * The nodes from before that do not appear now (≤ 0.5 px of geometry). Exception for the disabled state (MF4, the color is
 * opaque and the node has opacity 1): in those nodes the scene from before holds by name, type and box, and the
 * color is checked separately, in `disabledProblems`, as on-surface at 0.38 / 0.12 composited over surface.
 */
function missing(d: Drawing, scene: OldScene, mode: Mode): string[] {
  const skip = skipOld(scene, mode);
  const enabled = (scene.values as Record<string, unknown>)['enabled'] !== 'false';
  const nodes = scene.nodes
    .filter((o) => !skip(o))
    .map((o): OldNode => {
      if (enabled || o.o === undefined) return o;
      return { t: o.t, n: o.n, r: o.r, ...(o.x === undefined ? {} : { x: o.x }) };
    });
  return [
    ...missingNodes(d, nodes),
    ...(enabled ? [] : disabledProblems(d, scene, mode)),
  ];
}

/** The disabled color: handle and active segment at 0.38, inactive segment at 0.12, always opaque and with opacity 1. */
function disabledProblems(d: Drawing, scene: OldScene, mode: Mode): string[] {
  const out: string[] = [];
  const want: Record<string, string> = {
    alça: disabledColor('state-disabled-content', mode),
    'trilho ativo': disabledColor('state-disabled-content', mode),
    'trilho inativo': disabledColor('state-disabled-container', mode),
  };
  for (const { node } of collect(d, (n) => n.name in want)) {
    if (node.opacity !== 1)
      out.push(`${scene.key} ${node.name}: opacity ${node.opacity}`);
    if (!isComposite(solid(node.fills), want[node.name]!))
      out.push(
        `${scene.key} ${node.name}: ${solid(node.fills)} instead of ${want[node.name]}`,
      );
  }
  for (const { node } of collect(d, (n) => n.name === 'marca')) {
    const color = solid(node.fills);
    const ok =
      isComposite(color, disabledColor('state-disabled-container', mode)) ||
      isComposite(color, disabledColor('state-disabled-content', mode));
    if (node.opacity !== 1 || !ok)
      out.push(`${scene.key} marca: ${color} ${node.opacity}`);
  }
  return out;
}

describe('EX6 slider — regression against the scenes from before', () => {
  const all = oldScenes('slider-');

  it('the fixture brings the expected scenes', () => {
    expect(all.length).toBe(167);
  });

  it('the scenes where the value is already on the step grid draw the same as before (≤ 0.5 px)', () => {
    const same = all.filter(unchanged);
    expect(same.length).toBeGreaterThan(100);
    for (const scene of same) {
      const d = draw(scene.id, numeric(scene.values), scene.mode);
      expect(missing(d, scene, scene.mode), scene.key).toEqual([]);
    }
  });

  it('the 6 examples from before, in light and dark, match the recorded scene', () => {
    const examples = all.filter((s) => /^slider-ex\d-(light|dark)$/.test(s.key));
    expect(examples.length).toBe(12);
    for (const scene of examples)
      expect(
        missing(draw(scene.id, numeric(scene.values), scene.mode), scene, scene.mode),
        scene.key,
      ).toEqual([]);
  });

  it('disabled (enabled false) and dark match the recorded scene', () => {
    const scenes = all.filter(
      (s) =>
        ((s.values as Record<string, unknown>)['enabled'] === 'false' ||
          s.mode === 'dark') &&
        unchanged(s),
    );
    expect(scenes.length).toBeGreaterThan(20);
    for (const scene of scenes)
      expect(
        missing(draw(scene.id, numeric(scene.values), scene.mode), scene, scene.mode),
        scene.key,
      ).toEqual([]);
  });

  it('where the value is not on the grid (steps 1 and 4), the handle goes to the step and the rest is the drawing of the rounded value', () => {
    const off = all.filter((s) => {
      const steps = (s.values as Record<string, unknown>)['steps'];
      return (steps === 1 || steps === 4) && !unchanged(s);
    });
    expect(off.length).toBeGreaterThan(20);
    for (const scene of off) {
      const values = numeric(scene.values) as Record<string, unknown> & { steps: number };
      const d = draw(scene.id, values as Values, scene.mode);
      // the handle on the rounded step (the test's computation), not on the value from before
      expectGeometry(values as Parameters<typeof expected>[0], 328, scene.mode);
      expectMarks(values as Parameters<typeof expectedMarks>[0], 328, scene.mode);
      // the rest: the recorded scene of the already rounded value
      const rounded = { ...values } as Record<string, unknown>;
      for (const key of ['value', 'valueStart', 'valueEnd'])
        if (typeof values[key] === 'number')
          rounded[key] = snapped(values[key] as number, values.steps);
      const reference = all.find((s) => {
        const o = numeric(s.values) as Record<string, unknown>;
        return (
          s.mode === scene.mode &&
          s.id === scene.id &&
          ['type', 'value', 'valueStart', 'valueEnd', 'steps', 'enabled'].every(
            (k) => o[k] === rounded[k],
          )
        );
      });
      expect(reference, `${scene.key} rounded`).toBeDefined();
      expect(missing(d, reference!, scene.mode), scene.key).toEqual([]);
    }
  });

  it('steps 12 (before: 9 marks) follows the new computation: 12 marks and the handle on the step of 13 parts', () => {
    const scenes = all.filter(
      (s) => (s.values as Record<string, unknown>)['steps'] === 12,
    );
    expect(scenes.length).toBeGreaterThan(10);
    for (const scene of scenes) {
      const values = numeric(scene.values) as Parameters<typeof expected>[0];
      expectGeometry(values, 328, scene.mode);
      expectMarks(values as Parameters<typeof expectedMarks>[0], 328, scene.mode);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Without enumerated tables and the file size
// ---------------------------------------------------------------------------------------------

/** Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. */
function offenders(id: 'slider') {
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
      const total = Object.keys(cases).length;
      if (total > 12) found.push(`${path}: $switch of ${total} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 slider — without enumerated tables', () => {
  it('the slider has no $switch with more than 12 cases nor $eq over a number field', () => {
    expect(offenders('slider')).toEqual([]);
  });

  it('the slider has no $switch of tenths and the value fields are number', () => {
    expect(text('components/slider.json')).not.toContain('$switch');
    const fields = typeOf('slider').fields;
    for (const key of ['value', 'valueStart', 'valueEnd'])
      expect(fields.find((f) => f.key === key)?.type, key).toBe('number');
  });

  it('the file stays much smaller than the 93 kB from before', () => {
    // The target was 20 kB; the floor of this construction is the prettier format (the computations take
    // dozens of indented lines, and the width of the segments and the marks depend on the snapped
    // value, which is not stored in a variable): ~25 kB, a quarter of the one from before. L2 (#1078) took the
    // handles out of the `antes do início` and `depois do fim` frames (which can measure 0 and do not hold the handle) and
    // put them at the root, with the position computed once each (the end's and the start's): ceiling of 34 kB (now 32,789). VL3 (#1506) added the `let` and the three step strips: ceiling of 40 kB (now ~38,000).
    expect(text('components/slider.json').length).toBeLessThan(40_000);
  });

  it('the preview and the description talk about a number, not about tenths nor 9 steps', () => {
    const component = JSON.parse(text('components/slider.json')) as {
      description: string;
      preview: Record<string, unknown>;
    };
    expect(component.preview['value']).toBe(0.5);
    expect(component.preview['valueStart']).toBe(0.2);
    expect(component.preview['valueEnd']).toBe(0.8);
    // pt-BR kept: the Portuguese text of libraries/material3-compose/docs/slider.md and of the slider description is the object of this test
    expect(component.description).not.toMatch(/décimos|1 a 9/);
    // the field table of the doc is generated from the specialization; the rest (Fidelidade) is handwritten
    const written = text('docs/slider.md').split('## Fidelidade')[1] ?? '';
    expect(written.length).toBeGreaterThan(1000);
    expect(/em décimos|desenha como 9|marcas de 1 a 9/.test(written)).toBe(false);
  });
});
