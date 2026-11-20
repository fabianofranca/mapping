// Format 4, "format gaps" stage (FG4): the engine draws letter spacing in percent, `padding` items
// from tokens and fields, and `sizing` from a number `$token`.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { findSlot, resolveSlotLayout } from '../../../src/model/components/arrange';
import {
  approximateMeasurer,
  instantiate,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import type { FrameNode, SceneNode, TextNode } from '../../../src/model/components/scene';
import { fitComponentSize, resolveSizing } from '../../../src/model/components/sizing';
import {
  applyTokens,
  resolveTokens,
  substituteTokens,
} from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const TOKENS = {
  modes: ['compact', 'roomy'],
  values: {
    tracking: { compact: 0.5, roomy: 1 },
    'pad-x': { compact: 6, roomy: 10 },
    'box-h': { compact: 20, roomy: 40 },
    ink: { compact: '#112233', roomy: '#112233' },
  },
};

function parse(template: Raw, extra: Raw = {}): ComponentFile {
  const r = parseComponent({
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width: 200, height: 100 },
    template,
    ...extra,
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

const tokens = (mode: string) => resolveTokens(TOKENS, {}, mode);
const t = (name: string) => ({ $token: name });

function run(
  component: ComponentFile,
  values = {},
  mode = 'compact',
  measure = approximateMeasurer,
) {
  return instantiate(
    component,
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure, tokens: tokens(mode) },
  );
}

const textOf = (root: SceneNode): TextNode =>
  (root as FrameNode).children.find((c): c is TextNode => c.type === 'text') as TextNode;

const label = (font: Raw) => ({
  type: 'frame',
  children: [{ type: 'text', text: 'Hello', font: { size: 16, ...font } }],
});

describe('FG4: letter spacing in percent', () => {
  it('"2%" at size 16 is 0.32 px in the style and in the measurement', () => {
    const seen: number[] = [];
    const measure: TextMeasurer = (text, font, maxWidth) => {
      seen.push(font.letterSpacing);
      return approximateMeasurer(text, font, maxWidth);
    };
    const { root, warnings } = run(
      parse(label({ letterSpacing: '2%' })),
      {},
      'compact',
      measure,
    );
    expect(textOf(root).style.letterSpacing).toBeCloseTo(0.32, 10);
    expect(seen.length).toBeGreaterThan(0);
    for (const px of seen) expect(px).toBeCloseTo(0.32, 10);
    expect(warnings).toEqual([]);
  });

  it('a negative percent, the px number and a number token', () => {
    const style = (font: Raw, mode = 'compact') =>
      textOf(run(parse(label(font)), {}, mode).root).style.letterSpacing;
    expect(style({ letterSpacing: '-1.5%' })).toBeCloseTo(-0.24, 10);
    expect(style({ letterSpacing: 1.5 })).toBe(1.5);
    expect(style({ letterSpacing: t('tracking') })).toBe(0.5);
    expect(style({ letterSpacing: t('tracking') }, 'roomy')).toBe(1);
  });

  it('the percent follows the resolved size (from a field)', () => {
    const c = parse(label({ size: { $field: 'size' }, letterSpacing: '10%' }));
    expect(textOf(run(c, { size: 20 }).root).style.letterSpacing).toBeCloseTo(2, 10);
  });

  it('an invalid value from an expression warns and is 0', () => {
    const c = parse(label({ letterSpacing: { $field: 'ls' } }));
    const { root, warnings } = run(c, { ls: '2px' });
    expect(textOf(root).style.letterSpacing).toBe(0);
    expect(warnings).toContain('invalid value in font.letterSpacing: 2px');
  });
});

describe('FG4: padding items from a token and a field', () => {
  it('in the frame', () => {
    const c = parse({
      type: 'frame',
      layout: { type: 'row', padding: [0, t('pad-x')] },
      children: [{ type: 'rect', width: 10, height: 10 }],
    });
    const at = (mode: string) =>
      (run(c, {}, mode).root as FrameNode).children[0]!.transform[4];
    expect(at('compact')).toBe(6);
    expect(at('roomy')).toBe(10);
  });

  it('in the frame, from a field and a math item', () => {
    const c = parse({
      type: 'frame',
      layout: { type: 'row', padding: [{ $field: 'pad' }, 4, { $mul: [2, 4] }, 4] },
      children: [{ type: 'rect', width: 10, height: 10 }],
    });
    const rect = (run(c, { pad: 3 }).root as FrameNode).children[0]!;
    expect(rect.transform[4]).toBe(4);
    expect(rect.transform[5]).toBe(3);
  });

  it('in the slot (arrange.ts)', () => {
    const c = parse({
      type: 'frame',
      children: [
        {
          type: 'slot',
          width: 'fill',
          height: 'fill',
          layout: { type: 'row', padding: [{ $field: 'pad' }, t('pad-x')] },
        },
      ],
    });
    // The arrange applies the mode's tokens to the template before reading the slot.
    const slot = findSlot(applyTokens(c, tokens('roomy')))!;
    const layout = resolveSlotLayout(slot, { pad: 3 });
    expect(layout.padding).toEqual({ top: 3, right: 10, bottom: 3, left: 10 });
  });

  it('a negative item from an expression is floored at 0', () => {
    const c = parse({
      type: 'frame',
      children: [
        { type: 'slot', layout: { type: 'row', padding: [{ $field: 'pad' }, 2] } },
      ],
    });
    expect(resolveSlotLayout(findSlot(c)!, { pad: -5 }).padding).toEqual({
      top: 0,
      right: 2,
      bottom: 0,
      left: 2,
    });
  });

  it("in a run's chip", () => {
    const c = parse({
      type: 'frame',
      children: [
        {
          type: 'text',
          runs: [{ text: 'tag', background: '#eeeeee', padding: [0, t('pad-x')] }],
        },
      ],
    });
    const run0 = textOf(run(c, {}, 'roomy').root).runs?.[0];
    expect(run0?.padding).toEqual([0, 10]);
  });
});

describe('FG4: a run padding item from a field', () => {
  it('evaluates each item of the chip padding', () => {
    const c = parse({
      type: 'frame',
      children: [
        {
          type: 'text',
          runs: [
            { text: 'tag', background: '#eeeeee', padding: [{ $field: 'padV' }, 6] },
          ],
        },
      ],
    });
    expect(textOf(run(c, { padV: 4 }).root).runs?.[0]?.padding).toEqual([4, 6]);
  });
});

describe('FG4: sizing from a number $token', () => {
  const sized = (sizing: Raw) => parse({ type: 'frame', children: [] }, { sizing });

  it('the token has the value of each drawing mode', () => {
    const c = sized({ height: t('box-h') });
    expect(resolveSizing(c, {}, tokens('compact')).height).toEqual({
      spec: 20,
      source: 'expression',
    });
    expect(resolveSizing(c, {}, tokens('roomy')).height).toEqual({
      spec: 40,
      source: 'expression',
    });
  });

  it("falls back to the component's resolvedTokens without a table", () => {
    const c = { ...sized({ width: t('box-h') }), resolvedTokens: tokens('roomy') };
    expect(resolveSizing(c, {}).width.spec).toBe(40);
  });

  it('a $switch of tokens by field', () => {
    const c = sized({
      width: { $switch: 'size', cases: { s: t('pad-x'), l: t('box-h') }, default: 'hug' },
    });
    expect(resolveSizing(c, { size: 'l' }, tokens('compact')).width.spec).toBe(20);
    expect(resolveSizing(c, { size: 's' }, tokens('compact')).width.spec).toBe(6);
    expect(resolveSizing(c, { size: 'x' }, tokens('compact')).width.spec).toBe('hug');
  });

  it('a missing token warns and the axis is the size', () => {
    const c = sized({ width: t('nope') });
    const r = resolveSizing(c, {}, tokens('compact'));
    expect(r.width).toEqual({ spec: 200, source: 'size' });
    expect(r.messages.map((m) => m.text)).toEqual([
      'invalid value in sizing.width: undefined',
    ]);
  });

  it('a token of another kind (a family) is an invalid value', () => {
    const c = sized({ width: t('font-sans') });
    const r = resolveSizing(c, {}, tokens('compact'));
    expect(r.width.source).toBe('size');
    expect(r.messages).toHaveLength(1);
  });

  it('fitComponentSize follows the token size, per mode', () => {
    const c = sized({ height: t('box-h') });
    const fit = (mode: string) =>
      fitComponentSize(c, {}, { measure: approximateMeasurer, tokens: tokens(mode) });
    expect(fit('compact')?.height).toBe(20);
    expect(fit('roomy')?.height).toBe(40);
  });

  it('substituteTokens replaces the $token of a single value', () => {
    const c = sized({ width: t('box-h'), height: 12 });
    expect(substituteTokens(c.sizing, tokens('roomy'))).toEqual({
      width: 40,
      height: 12,
    });
  });
});
