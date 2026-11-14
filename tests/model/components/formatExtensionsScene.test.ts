// Format 4, "extensions" stage (FX3): the scene receives shadow, radii, dashed and color already resolved;
// justify space-around/space-evenly and layout.reverse arrange the children; stroke.offset reaches the
// stroke and the enlarged clip.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../../src/model/components/scene';
import { applyTokens, resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const TOKENS = {
  modes: ['light'],
  values: {
    'elev-y': 4,
    'elev-blur': 8,
    'elev-neg': -3,
    corner: 12,
    'dash-on': 6,
    'dash-bad': -2,
    scrim: '#00000080',
    'scrim-a': 0.5,
    ink: '#112233',
    'focus-offset': 2,
  },
};

function parse(template: Raw, version = 4): ComponentFile {
  const r = parseComponent({
    format: 'mapping-component',
    formatVersion: version,
    id: 't',
    name: 'T',
    size: { width: 200, height: 100 },
    template,
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

function run(template: Raw, values: FieldValues = {}, width = 200, height = 100) {
  const tokens = resolveTokens(TOKENS, {}, 'light');
  return instantiate(
    parse(template),
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer, tokens },
  );
}

const rootOf = (template: Raw, values: FieldValues = {}) =>
  run(template, values).root as FrameNode;

const t = (name: string, extra: Raw = {}) => ({ $token: name, ...extra });

describe('A1 in the scene: $token in shadow', () => {
  const rect = (shadow: Raw) => ({
    type: 'frame',
    children: [{ type: 'rect', width: 50, height: 20, shadow }],
  });

  it('x, y and blur reach the effect resolved', () => {
    const root = rootOf(
      rect({ color: '#000', x: 1, y: t('elev-y'), blur: t('elev-blur') }),
    );
    expect(root.children[0]?.effects[0]).toMatchObject({
      offset: { x: 1, y: 4 },
      blur: 8,
    });
  });

  it('a negative resolved blur falls to 0 with the invalid value warning in shadow.blur', () => {
    const { root, warnings } = run(rect({ color: '#000', blur: t('elev-neg') }));
    expect((root as FrameNode).children[0]?.effects[0]?.blur).toBe(0);
    expect(warnings).toContain('invalid value in shadow.blur: -3');
  });
});

describe('A2 in the scene: $token in the cornerRadius items', () => {
  it('each item resolves; the literals stay', () => {
    const root = rootOf({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 50,
          height: 20,
          cornerRadius: [t('corner'), 0, 0, t('corner')],
        },
      ],
    });
    const rect = root.children[0] as SceneNode & { cornerRadius?: unknown };
    expect(rect.cornerRadius).toEqual([12, 0, 0, 12]);
  });
});

describe('A19 in the scene: stroke.dash by expression and $token', () => {
  const dashOf = (dash: unknown, values: FieldValues = {}) => {
    const { root, warnings } = run(
      {
        type: 'frame',
        children: [
          { type: 'rect', width: 50, height: 20, stroke: { color: '#000', dash } },
        ],
      },
      values,
    );
    return { dash: (root as FrameNode).children[0]?.stroke?.dash, warnings };
  };

  it('$switch chooses the list', () => {
    const dash = {
      $switch: 'estilo',
      cases: { tracejado: [4, 2], pontilhado: [1, 3] },
      default: [],
    };
    expect(dashOf(dash, { estilo: 'tracejado' }).dash).toEqual([4, 2]);
    expect(dashOf(dash, { estilo: 'pontilhado' }).dash).toEqual([1, 3]);
  });

  it('number $token in each item', () => {
    expect(dashOf([t('dash-on'), 2]).dash).toEqual([6, 2]);
  });

  it('invalid resolved value: no dashed and with the warning', () => {
    const bad = dashOf([t('dash-bad'), 2]);
    expect(bad.dash).toBeUndefined();
    expect(bad.warnings).toContain('invalid value in stroke.dash: [-2,2]');
    const notList = dashOf({ $field: 'x' }, { x: 'abc' });
    expect(notList.dash).toBeUndefined();
    expect(notList.warnings).toContain('invalid value in stroke.dash: abc');
  });

  it('the usual literal list stays the same', () => {
    expect(dashOf([4, 2]).dash).toEqual([4, 2]);
  });
});

describe('A10: alpha on the color $token', () => {
  const colorOf = (ref: unknown) => {
    const component = parse({
      type: 'frame',
      children: [{ type: 'rect', width: 5, height: 5, fill: ref }],
    });
    const tokens = resolveTokens(TOKENS, {}, 'light');
    const resolved = applyTokens(component, tokens);
    const { root } = instantiate(
      resolved,
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens },
    );
    const fills = (root as FrameNode).children[0]?.fills ?? [];
    return fills[0] && 'color' in fills[0] ? fills[0].color : undefined;
  };

  it('multiplies the alpha of an opaque color', () => {
    expect(colorOf(t('ink', { alpha: 0.5 }))).toBe('#11223380');
  });

  it('multiplies the alpha the color already had (#rrggbbaa)', () => {
    // #00000080 (alpha 128/255 ≈ 0.5) with alpha 0.5 gives ≈ 0.25 → 0x40
    expect(colorOf(t('scrim', { alpha: 0.5 }))).toBe('#00000040');
  });

  it('alpha 0 is transparent and alpha 1 does not change the color', () => {
    expect(colorOf(t('ink', { alpha: 0 }))).toBe('#11223300');
    expect(colorOf(t('ink', { alpha: 1 }))).toBe('#112233ff');
  });

  it('alpha can be a number $token', () => {
    expect(colorOf(t('ink', { alpha: t('scrim-a') }))).toBe('#11223380');
  });

  it('without alpha the $token stays as it was', () => {
    expect(colorOf(t('ink'))).toBe('#112233');
  });

  it('none stays none', () => {
    const none = resolveTokens(
      { modes: ['light'], values: { nada: 'none' } },
      {},
      'light',
    );
    const component = parse({
      type: 'frame',
      children: [{ type: 'rect', width: 5, height: 5, fill: t('nada', { alpha: 0.5 }) }],
    });
    const { root } = instantiate(
      applyTokens(component, none),
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens: none },
    );
    expect((root as FrameNode).children[0]?.fills).toEqual([]);
  });

  it('the alpha also applies on the stops of a gradient (transparent stop)', () => {
    const root = rootOf({
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 5,
          height: 5,
          fill: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: t('ink', { alpha: 0 }) },
              { offset: 1, color: t('ink', { alpha: 0.5 }) },
            ],
          },
        },
      ],
    });
    const paint = root.children[0]?.fills[0];
    expect(paint?.type === 'linear' && paint.stops.map((s) => s.color)).toEqual([
      '#11223300',
      '#11223380',
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// A4: justify and reverse
// ---------------------------------------------------------------------------------------

const box = (w: number, h: number): Raw => ({ type: 'rect', width: w, height: h });

function rootAt(w: number, h: number, template: Raw): FrameNode {
  return run(template, {}, w, h).root as FrameNode;
}

function xs(layout: Raw, kids: Raw[], width = 100): number[] {
  const root = rootAt(width, 20, { type: 'frame', layout, children: kids });
  return root.children.map((c) => c.transform[4] ?? 0);
}

function ys(layout: Raw, kids: Raw[], height = 100): number[] {
  const root = rootAt(20, height, { type: 'frame', layout, children: kids });
  return root.children.map((c) => c.transform[5] ?? 0);
}

describe('A4: justify space-around and space-evenly', () => {
  const kids = [box(10, 10), box(10, 10), box(10, 10)];

  function rowXs(justify: string, children: Raw[] = kids): number[] {
    const root = rootAt(100, 20, {
      type: 'frame',
      layout: { type: 'row', justify },
      children: children,
    });
    return root.children.map((c) => c.transform[4] ?? 0);
  }

  it('space-around: half gap at the ends and a full gap between the children', () => {
    // free = 100 - 30 = 70; per child 70/3; end 35/3
    const p = rowXs('space-around');
    expect(p[0]).toBeCloseTo(70 / 6, 6);
    expect(p[1]).toBeCloseTo(70 / 6 + 10 + 70 / 3, 6);
    expect(p[2]).toBeCloseTo(70 / 6 + 20 + 140 / 3, 6);
  });

  it('space-evenly: the same gap at the ends and between the children', () => {
    // free 70, 4 gaps of 17.5
    const p = rowXs('space-evenly');
    expect(p[0]).toBeCloseTo(17.5, 6);
    expect(p[1]).toBeCloseTo(17.5 + 10 + 17.5, 6);
    expect(p[2]).toBeCloseTo(17.5 + 20 + 35, 6);
  });

  it('with a single child, both center', () => {
    expect(rowXs('space-around', [box(10, 10)])).toEqual([45]);
    expect(rowXs('space-evenly', [box(10, 10)])).toEqual([45]);
  });

  it('applies in column', () => {
    const root = rootAt(20, 100, {
      type: 'frame',
      layout: { type: 'column', justify: 'space-evenly' },
      children: kids,
    });
    const p = root.children.map((c) => c.transform[5] ?? 0);
    expect(p[0]).toBeCloseTo(17.5, 6);
    expect(p[2]).toBeCloseTo(17.5 + 20 + 35, 6);
  });

  it('respects gap and padding', () => {
    const root = rootAt(100, 20, {
      type: 'frame',
      layout: { type: 'row', justify: 'space-evenly', gap: 5, padding: [0, 10] },
      children: [box(10, 10), box(10, 10)],
    });
    // content 80; used 10+5+10=25; free 55; in 3 gaps of 55/3
    const p = root.children.map((c) => c.transform[4] ?? 0);
    expect(p[0]).toBeCloseTo(10 + 55 / 3, 6);
    expect(p[1]).toBeCloseTo(10 + 55 / 3 + 10 + 5 + 55 / 3, 6);
  });
});

describe('A4: layout.reverse', () => {
  const kids = [box(10, 10), box(20, 10), box(30, 10)];

  it('row: the first child goes to the end and start becomes the end', () => {
    // start (default): packed to the right, in reverse order: [30][20][10] from left to right? no:
    // the first child (10) stays farthest to the right.
    const p = xs({ type: 'row', reverse: true }, kids);
    expect(p).toEqual([90, 70, 40]);
  });

  it('row: justify end under reverse packs to the left', () => {
    expect(xs({ type: 'row', reverse: true, justify: 'end' }, kids)).toEqual([50, 30, 0]);
  });

  it('row: with gap', () => {
    expect(xs({ type: 'row', reverse: true, gap: 4 }, kids)).toEqual([90, 66, 32]);
  });

  it('row: space-between puts the first child at the right end', () => {
    const p = xs({ type: 'row', reverse: true, justify: 'space-between' }, kids);
    expect(p[0]).toBe(90);
    expect(p[2]).toBe(0);
    expect(p[1]).toBeCloseTo(100 - 10 - 20 - (100 - 60) / 2, 6);
  });

  it('column: the first child goes to the bottom', () => {
    const tall = [box(10, 10), box(10, 20), box(10, 30)];
    expect(ys({ type: 'column', reverse: true }, tall)).toEqual([90, 70, 40]);
  });

  it('reverse by expression', () => {
    const layout = { type: 'row', reverse: { $field: 'rtl' } };
    const root = (rtl: string) =>
      run(
        { type: 'frame', layout, children: kids, width: 100, height: 20 },
        { rtl },
        100,
        20,
      ).root as FrameNode;
    expect(root('yes').children.map((c) => c.transform[4])).toEqual([90, 70, 40]);
    expect(root('no').children.map((c) => c.transform[4])).toEqual([0, 10, 30]);
  });

  it('reverse false is the usual order', () => {
    expect(xs({ type: 'row', reverse: false }, kids)).toEqual([0, 10, 30]);
  });

  it('combines with space-evenly', () => {
    const p = xs({ type: 'row', reverse: true, justify: 'space-evenly' }, kids);
    // free 40, 4 gaps of 10: normal [10, 30, 60]; mirrored in 100: 100-10-10=80? [80, 50, 10]
    expect(p).toEqual([80, 50, 10]);
  });

  it('a hug frame measures the same and mirrors inside it', () => {
    const root = rootAt(300, 100, {
      type: 'frame',
      layout: { type: 'column' },
      children: [
        {
          type: 'frame',
          width: 'hug',
          height: 20,
          layout: { type: 'row', reverse: true, gap: 2 },
          children: kids,
        },
      ],
    });
    const hug = root.children[0] as FrameNode;
    expect(hug.width).toBe(10 + 20 + 30 + 4);
    expect(hug.children.map((c) => c.transform[4])).toEqual([54, 32, 0]);
  });

  it('in repeat: the block of the lines moves as a single child and the lines keep the order', () => {
    const root = run(
      {
        type: 'frame',
        layout: { type: 'row', reverse: true },
        children: [
          { type: 'rect', width: 10, height: 10 },
          {
            type: 'repeat',
            field: 'itens',
            direction: 'row',
            template: { type: 'frame', width: 20, height: 10, children: [] },
          },
        ],
      },
      { itens: [{ a: 'x' }, { a: 'y' }] },
      100,
      20,
    ).root as FrameNode;
    const [rect, rows] = root.children as [SceneNode, FrameNode];
    expect(rect.transform[4]).toBe(90);
    expect(rows.transform[4]).toBe(50);
    expect(rows.children.map((c) => c.transform[4])).toEqual([0, 20]);
  });
});

// ---------------------------------------------------------------------------------------
// A15: stroke.offset
// ---------------------------------------------------------------------------------------

describe('A15: stroke.offset in the scene and in the clip', () => {
  const ring = (stroke: Raw) => ({
    type: 'frame',
    children: [
      { type: 'rect', width: 100, height: 100, stroke: { color: '#f00', ...stroke } },
    ],
  });

  it('the literal offset or by $token reaches the scene Stroke', () => {
    expect(
      rootOf(ring({ width: 3, align: 'outside', offset: 2 })).children[0]?.stroke,
    ).toMatchObject({ offset: 2 });
    expect(
      rootOf(ring({ width: 3, align: 'outside', offset: t('focus-offset') })).children[0]
        ?.stroke,
    ).toMatchObject({ offset: 2 });
  });

  it('without offset (or with 0) the Stroke does not get the key', () => {
    expect(rootOf(ring({ width: 3 })).children[0]?.stroke).not.toHaveProperty('offset');
    expect(rootOf(ring({ width: 3, offset: 0 })).children[0]?.stroke).not.toHaveProperty(
      'offset',
    );
  });

  it('a child that fills the shape with an outside stroke and offset 2 enlarges the clip by offset + width', () => {
    // M3 ring: 3 in secondary, offset 2 → 5 outside the box
    const root = rootAt(100, 100, ring({ width: 3, align: 'outside', offset: 2 }));
    expect(root.clip).toBe(true);
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('with align center it counts offset + half the width; with inside, only the offset', () => {
    expect(
      rootAt(100, 100, ring({ width: 4, align: 'center', offset: 2 })).clipBox,
    ).toEqual({ x: -4, y: -4, width: 108, height: 108 });
    expect(rootAt(100, 100, ring({ width: 4, offset: 2 })).clipBox).toEqual({
      x: -2,
      y: -2,
      width: 104,
      height: 104,
    });
  });

  it('the offset on the stroke of the root itself also enlarges the clip', () => {
    const root = rootAt(100, 100, {
      type: 'frame',
      stroke: { color: '#f00', width: 3, align: 'outside', offset: 2 },
      children: [],
    });
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('with sides, the offset applies only on the requested sides', () => {
    const root = rootAt(
      100,
      100,
      ring({ width: 3, align: 'outside', offset: 2, sides: ['bottom', 'left'] }),
    );
    expect(root.clipBox).toEqual({ x: -5, y: 0, width: 105, height: 105 });
  });

  it('the content stays clipped in the box: a child larger than the box does not widen the clip', () => {
    const root = rootAt(100, 100, {
      type: 'frame',
      children: [
        {
          type: 'rect',
          width: 300,
          height: 300,
          stroke: { color: '#f00', width: 3, align: 'outside', offset: 2 },
        },
      ],
    });
    // the rectangle goes past the box, but the clip only grows up to the stroke extent (5), not up to 300
    expect(root.clipBox).toEqual({ x: -5, y: -5, width: 110, height: 110 });
  });

  it('without offset the clip is the usual one', () => {
    expect(rootAt(100, 100, ring({ width: 3, align: 'outside' })).clipBox).toEqual({
      x: -3,
      y: -3,
      width: 106,
      height: 106,
    });
  });
});

describe('A10: alpha in functional colors (rgb/hsl) read from the token', () => {
  const colorFor = (value: string, alpha: number) => {
    const tokens = resolveTokens({ modes: ['light'], values: { c: value } }, {}, 'light');
    const component = parse({
      type: 'frame',
      children: [{ type: 'rect', width: 5, height: 5, fill: t('c', { alpha }) }],
    });
    const { root } = instantiate(
      applyTokens(component, tokens),
      {},
      { x: 0, y: 0, width: 5, height: 5 },
      { measure: approximateMeasurer, tokens },
    );
    const fills = (root as FrameNode).children[0]?.fills ?? [];
    return fills[0] && 'color' in fills[0] ? fills[0].color : undefined;
  };

  it('rgb with commas and rgba', () => {
    expect(colorFor('rgb(255, 0, 0)', 0.5)).toBe('#ff000080');
    expect(colorFor('rgba(0, 0, 0, 0.5)', 0.5)).toBe('#00000040');
  });

  it('alpha and channels in percentage (modern syntax with slash)', () => {
    expect(colorFor('rgb(0 0 0 / 50%)', 0.5)).toBe('#00000040');
    expect(colorFor('rgb(100% 0% 0%)', 1)).toBe('#ff0000ff');
  });

  it('hsl, with negative hue and with unit', () => {
    expect(colorFor('hsl(330, 100%, 50%)', 1)).toBe(colorFor('hsl(-30, 100%, 50%)', 1));
    expect(colorFor('hsl(0.5turn 100% 50%)', 1)).toBe(colorFor('hsl(180, 100%, 50%)', 1));
    expect(colorFor('hsl(120, 100%, 50%)', 1)).toBe('#00ff00ff');
  });

  it('a color that is not understood stays as is', () => {
    expect(colorFor('rebeccapurple', 0.5)).toBe('rebeccapurple');
  });
});
