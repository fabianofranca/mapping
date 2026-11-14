// Format 4, phase CF4: rich text (`runs`): runs with their own style that wrap as ONE
// single text, and the inline box (chip: `background` + `radius` + `padding`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import { referencedFields } from '../../../src/model/components/expressions';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type MeasureFont,
} from '../../../src/model/components/instantiate';
import {
  collectFieldKeys,
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  layoutRuns,
  measureRichText,
  minContentRuns,
  type RichBase,
  type RichRun,
} from '../../../src/model/components/richText';
import { expandRepeats } from '../../../src/model/components/repeat';
import { walk, type TextNode } from '../../../src/model/components/scene';

const V4 = 'only allowed with formatVersion 4';

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

function component(
  child: Record<string, unknown>,
  version = 4,
  size = { width: 100, height: 40 },
): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size,
    template: { type: 'frame', children: [child] },
  };
}

const richNode = (runs: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'text',
  runs,
  ...extra,
});

const RUNS = [{ text: 'Falls in ' }, { text: '3 days', weight: 700 }];

describe('validation of runs', () => {
  it('accepts runs in formatVersion 4', () => {
    expect(validateComponent(component(richNode(RUNS)))).toEqual([]);
    const result = parseComponent(component(richNode(RUNS)));
    expect(result.ok).toBe(true);
  });

  it('accepts every key of the run, with literal or expression', () => {
    const run = {
      text: { $field: 'label', default: 'x' },
      weight: { $switch: 'tom', cases: { forte: 700 }, default: 400 },
      italic: { $field: 'it' },
      color: { $if: { $has: 'label' }, then: '#ff0000', else: '#000000' },
      decoration: 'underline',
      family: 'Inter',
      size: 12,
      background: '#eeeeee',
      radius: 4,
      padding: [2, 6],
    };
    expect(validateComponent(component(richNode([run, { ...run, padding: 3 }])))).toEqual(
      [],
    );
  });

  it('in formatVersion 3 it fails only with "only allowed with formatVersion 4" at …runs', () => {
    expect(validateComponent(component(richNode(RUNS), 3))).toEqual([
      `template.children[0].runs: ${V4}`,
    ]);
  });

  it('text and runs on the same node fails at the node path', () => {
    expect(validateComponent(component(richNode(RUNS, { text: 'a' })))).toEqual([
      'template.children[0]: text and runs together: use one or the other',
    ]);
  });

  it('without text or runs it keeps today error', () => {
    expect(validateComponent(component({ type: 'text' }))).toEqual([
      'template.children[0].text: required field',
    ]);
  });

  it.each([[[]], ['text'], [{ text: 'a' }]])('runs %j is not a non-empty list', (bad) => {
    expect(validateComponent(component(richNode(bad)))).toEqual([
      'template.children[0].runs: expected a non-empty list of runs',
    ]);
  });

  it('unknown key in the run fails at the run path', () => {
    expect(
      validateComponent(component(richNode([{ text: 'a' }, { text: 'b', bogus: 1 }]))),
    ).toEqual(['template.children[0].runs[1].bogus: unknown key: bogus']);
  });

  it('run without text fails', () => {
    expect(validateComponent(component(richNode([{ weight: 700 }])))).toEqual([
      'template.children[0].runs[0].text: required field',
    ]);
  });

  it('invalid values of the runs fail at the key path', () => {
    const bad = (key: string, value: unknown) =>
      validateComponent(component(richNode([{ text: 'a', [key]: value }]))).map(
        (e) => e.split(':')[0],
      );
    expect(bad('weight', 50)).toEqual(['template.children[0].runs[0].weight']);
    expect(bad('radius', -1)).toEqual(['template.children[0].runs[0].radius']);
    expect(bad('padding', -1)).toEqual(['template.children[0].runs[0].padding']);
    expect(bad('padding', [1, 2, 3, 4])).toEqual([
      'template.children[0].runs[0].padding',
    ]);
    expect(bad('background', 3)).toEqual(['template.children[0].runs[0].background']);
    expect(bad('size', 'grande')).toEqual(['template.children[0].runs[0].size']);
    expect(bad('decoration', 'blink')).toEqual([
      'template.children[0].runs[0].decoration',
    ]);
  });

  it('an invalid literal family in a run becomes a warning', () => {
    const result = parseComponent(
      component(richNode([{ text: 'a', family: 'Inter, "aberta' }])),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.warnings.map((w) => w.path)).toEqual([
        'template.children[0].runs[0].family',
      ]);
  });
});

// ---------------------------------------------------------------------------------------
// Per-instance fields
// ---------------------------------------------------------------------------------------

function richFile(node: Record<string, unknown>, width = 100): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width,
          height: 'hug',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
}

function textOf(file: ComponentFile, values: FieldValues, width = 100): TextNode {
  const { height } = measureComponent(
    file,
    values,
    { width, height: null },
    { measure: approximateMeasurer },
  );
  const { root } = instantiate(
    file,
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer },
  );
  const found = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!found) throw new Error('no text node');
  return found;
}

describe('runs per instance', () => {
  const file = richFile({
    font: { size: 14 },
    color: '#111111',
    runs: [
      { text: 'Falls in ' },
      {
        text: { $field: 'days' },
        weight: 700,
        color: { $switch: 'urgency', cases: { high: '#ff0000' }, default: '#00ff00' },
      },
    ],
  });

  it('$field in the run text and $switch in the color resolve per instance', () => {
    const a = textOf(file, { days: '3 days', urgency: 'high' });
    const b = textOf(file, { days: '10 days', urgency: 'low' });
    expect(a.runs?.map((r) => r.text)).toEqual(['Falls in ', '3 days']);
    expect(b.runs?.map((r) => r.text)).toEqual(['Falls in ', '10 days']);
    expect(a.runs?.[1]?.color).toBe('#ff0000');
    expect(b.runs?.[1]?.color).toBe('#00ff00');
    expect(a.text).toBe('Falls in 3 days');
    expect(a).not.toEqual(b);
  });

  it('the run inherits the font and color of the node and overrides what it declares', () => {
    const a = textOf(file, { days: '3', urgency: 'high' });
    expect(a.runs?.[0]).toMatchObject({
      fontSize: 14,
      fontWeight: 400,
      color: '#111111',
      italic: false,
    });
    expect(a.runs?.[1]).toMatchObject({ fontWeight: 700, fontSize: 14 });
    expect(a.runs?.[0]?.background).toBeUndefined();
  });

  it('a literal run of only spaces stays (the gap between the bold and the chip); the empty field one disappears', () => {
    const spaced = richFile({
      font: { size: 14 },
      runs: [
        { text: 'Mmmm' },
        { text: ' ' },
        { text: { $field: 'days' }, background: '#00ACC1', padding: [3, 6] },
      ],
    });
    const node = textOf(spaced, { days: 'next' }, 200);
    expect(node.runs?.map((r) => r.text)).toEqual(['Mmmm', ' ', 'next']);
    const [word, space, chip] = node.runLayout?.lines[0]?.pieces ?? [];
    expect(space?.width).toBeGreaterThan(0);
    expect(chip?.x).toBeCloseTo((word?.width ?? 0) + (space?.width ?? 0), 6);
    // A field full of spaces is still empty (falls back).
    const blank = textOf(spaced, { days: '   ' }, 200);
    expect(blank.runs?.map((r) => r.text)).toEqual(['Mmmm', ' ', '']);
  });

  it('a node without runs gets neither runs nor runLayout', () => {
    const plain = textOf(richFile({ text: 'hi' }), {});
    expect(plain.runs).toBeUndefined();
    expect(plain.runLayout).toBeUndefined();
  });

  it('a run with background becomes an inline box in the scene (padding [v, h])', () => {
    const chip = richFile({
      font: { size: 14 },
      runs: [{ text: 'ok', background: '#eeeeee', radius: 4, padding: [2, 6] }],
    });
    const node = textOf(chip, {});
    expect(node.runs?.[0]).toMatchObject({
      background: '#eeeeee',
      radius: 4,
      padding: [2, 6],
    });
  });

  it('$field inside runs counts as a cited field', () => {
    const keys = collectFieldKeys(file);
    expect(keys).toEqual(['days', 'urgency']);
    expect([...referencedFields(file.template)].sort()).toEqual(['days', 'urgency']);
  });

  it('runs inside repeat: the column shadows the field and each row has its own text', () => {
    const table: ComponentFile = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'tab',
      name: 'Tab',
      size: { width: 100, height: 80 },
      template: {
        type: 'frame',
        layout: { type: 'column' },
        children: [
          {
            type: 'repeat',
            field: 'rows',
            template: {
              type: 'frame',
              children: [
                { type: 'text', runs: [{ text: 'Item ' }, { text: { $field: 'label' } }] },
              ],
            },
          },
        ],
      },
    };
    const values: FieldValues = {
      label: 'of type',
      rows: [{ label: 'A' }, { label: 'B' }],
    };
    const { root } = instantiate(
      table,
      values,
      { x: 0, y: 0, width: 100, height: 80 },
      { measure: approximateMeasurer },
    );
    const texts = [...walk(root)]
      .filter((n): n is TextNode => n.type === 'text')
      .map((n) => n.text);
    expect(texts).toEqual(['Item A', 'Item B']);
    // the expansion rewrites the `$field` of the run to the row field
    const expanded = expandRepeats(table, values);
    expect(JSON.stringify(expanded.component.template)).toContain('$r0_0:label');
  });
});

// ---------------------------------------------------------------------------------------
// Layout of the runs
// ---------------------------------------------------------------------------------------

/** 14 px: 7.7 px per character (weight 400) or 8.4 (weight 700); line of 16.8 px. */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};
const BASE: RichBase = { size: 14, lineHeight: 16.8 };
const CHIP = { padding: [2, 6] as const };

const run = (
  text: string,
  font: Partial<MeasureFont> = {},
  chip?: { padding: readonly [number, number] },
): RichRun => ({ text, font: { ...FONT, ...font }, ...(chip ? { chip } : {}) });

const lineTexts = (layout: ReturnType<typeof layoutRuns>): string[] =>
  layout.lines.map((l) => l.pieces.map((p) => p.text).join(''));

describe('line wrapping of the runs', () => {
  const runs = [run('Remit '), run('amount of credit', { weight: 700 })];

  it('wraps by word as a single text, not by run', () => {
    const layout = layoutRuns(runs, BASE, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Remit amount', 'of credit']);
    // the first line mixes the two runs
    expect(layout.lines[0]?.pieces.map((p) => p.run)).toEqual([0, 1]);
  });

  it('the measured height (hug) is equal to the scene runLayout.height', () => {
    const file = richFile({
      font: { size: 14 },
      runs: [{ text: 'Remit ' }, { text: 'amount of credit', weight: 700 }],
    });
    const { height } = measureComponent(
      file,
      {},
      { width: 100, height: null },
      { measure: approximateMeasurer },
    );
    const node = textOf(file, {});
    expect(node.runLayout?.height).toBeCloseTo(height, 6);
    expect(node.runLayout?.lines).toHaveLength(2);
    expect(height).toBeCloseTo(2 * 16.8, 6);
  });

  it('a word that crosses runs with no space between them is a single word', () => {
    const layout = layoutRuns(
      [run('my Re'), run('mit', { weight: 700 })],
      BASE,
      approximateMeasurer,
      30,
    );
    // "Re"+"mit" is not split: it goes whole to the second line
    expect(lineTexts(layout)).toEqual(['my', 'Remit']);
    expect(layout.lines[1]?.pieces.map((p) => p.run)).toEqual([0, 1]);
  });

  it('a word larger than the width stays alone on the line', () => {
    const layout = layoutRuns([run('a ccccccccccc b')], BASE, approximateMeasurer, 40);
    expect(lineTexts(layout)).toEqual(['a', 'ccccccccccc', 'b']);
  });

  it('\\n in a run without background forces a break', () => {
    const layout = layoutRuns([run('a\nb')], BASE, approximateMeasurer, 500);
    expect(lineTexts(layout)).toEqual(['a', 'b']);
    expect(layout.height).toBeCloseTo(2 * 16.8, 6);
  });

  it('the line height of a larger run scales with the size', () => {
    const layout = layoutRuns(
      [run('a '), run('B', { size: 28 })],
      BASE,
      approximateMeasurer,
      200,
    );
    expect(layout.lines[0]?.height).toBeCloseTo(33.6, 6);
  });

  it('align centers each line against the box width', () => {
    const layout = layoutRuns(
      [run('abc')],
      { ...BASE, align: 'center' },
      approximateMeasurer,
      100,
    );
    const piece = layout.lines[0]?.pieces[0];
    expect(piece?.x).toBeCloseTo((100 - 3 * 7.7) / 2, 6);
    const right = layoutRuns(
      [run('abc')],
      { ...BASE, align: 'right' },
      approximateMeasurer,
      100,
    );
    expect(right.lines[0]?.pieces[0]?.x).toBeCloseTo(100 - 3 * 7.7, 6);
  });
});

describe('inline box (chip)', () => {
  it('width = text + 2·h, height = line + 2·v', () => {
    const layout = layoutRuns([run('overdue', {}, CHIP)], BASE, approximateMeasurer, 200);
    const piece = layout.lines[0]?.pieces[0];
    expect(piece?.text).toBe('overdue');
    expect(piece?.width).toBeCloseTo(7 * 7.7 + 12, 6);
    expect(piece?.height).toBeCloseTo(16.8 + 4, 6);
    expect(layout.lines[0]?.height).toBeCloseTo(20.8, 6);
  });

  it('does not fit in the rest of the line: goes whole to the next line', () => {
    // "Remit" 38.5 + space 7.7 + chip 65.9 = 112.1 > 100
    const layout = layoutRuns(
      [run('Remit '), run('overdue', {}, CHIP)],
      BASE,
      approximateMeasurer,
      100,
    );
    expect(lineTexts(layout)).toEqual(['Remit', 'overdue']);
    expect(layout.lines[1]?.pieces).toHaveLength(1);
    expect(layout.lines[1]?.pieces[0]?.width).toBeCloseTo(65.9, 6);
  });

  it('larger than the whole line stays alone and exceeds the width, without wrapping', () => {
    const layout = layoutRuns(
      [run('overdue quite large', {}, CHIP)],
      BASE,
      approximateMeasurer,
      50,
    );
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]?.pieces[0]?.text).toBe('overdue quite large');
    expect(layout.width).toBeGreaterThan(50);
  });

  it('\\n inside the chip becomes a space', () => {
    const layout = layoutRuns([run('a\nb', {}, CHIP)], BASE, approximateMeasurer, 500);
    expect(layout.lines).toHaveLength(1);
    expect(layout.lines[0]?.pieces[0]?.text).toBe('a b');
  });

  it('a chip at the start of the line keeps the leading space; a run without background loses it', () => {
    // line 1: "Remit a" (53.9); the rest does not fit in 90
    const withChip = layoutRuns(
      [run('Remit a '), run(' next', {}, CHIP)],
      BASE,
      approximateMeasurer,
      90,
    );
    expect(withChip.lines).toHaveLength(2);
    const chipPiece = withChip.lines[1]?.pieces[0];
    expect(chipPiece?.text).toBe(' next');
    expect(chipPiece?.width).toBeCloseTo(5 * 7.7 + 12, 6);

    const plain = layoutRuns(
      [run('Remit a '), run(' next')],
      BASE,
      approximateMeasurer,
      90,
    );
    expect(lineTexts(plain)).toEqual(['Remit a', 'next']);
    expect(plain.lines[1]?.pieces[0]?.width).toBeCloseTo(4 * 7.7, 6);
  });

  it('the space of the run without background before the chip counts as a space between them', () => {
    const layout = layoutRuns(
      [run('a '), run('b', {}, CHIP), run(' c')],
      BASE,
      approximateMeasurer,
      500,
    );
    expect(lineTexts(layout)).toEqual(['a b c']);
    const xs = layout.lines[0]?.pieces.map((p) => p.x);
    expect(xs?.[0]).toBe(0);
    // "a " (2 characters) and then the chip
    expect(xs?.[1]).toBeCloseTo(2 * 7.7, 6);
  });
});

describe('wrap, ellipsis and maxLines in the runs', () => {
  const runs = [run('Remit '), run('amount of credit', { weight: 700 })];

  it('wrap "none": only \\n breaks', () => {
    const layout = layoutRuns(runs, { ...BASE, wrap: 'none' }, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Remit amount of credit']);
    expect(layout.width).toBeGreaterThan(100);
    const two = layoutRuns(
      [run('a\nb')],
      { ...BASE, wrap: 'none' },
      approximateMeasurer,
      100,
    );
    expect(lineTexts(two)).toEqual(['a', 'b']);
  });

  it('wrap "none" + ellipsis: the line ends in … and fits in the box', () => {
    const layout = layoutRuns(
      runs,
      { ...BASE, wrap: 'none', ellipsis: true },
      approximateMeasurer,
      100,
    );
    expect(layout.lines).toHaveLength(1);
    expect(lineTexts(layout)[0]?.endsWith('…')).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('maxLines without ellipsis keeps the first N lines', () => {
    const layout = layoutRuns(runs, { ...BASE, maxLines: 1 }, approximateMeasurer, 100);
    expect(lineTexts(layout)).toEqual(['Remit amount']);
    expect(layout.height).toBeCloseTo(16.8, 6);
  });

  it('maxLines 1 + ellipsis cuts in the middle of a run and ends in …', () => {
    const layout = layoutRuns(
      runs,
      { ...BASE, maxLines: 1, ellipsis: true },
      approximateMeasurer,
      100,
    );
    expect(lineTexts(layout)).toEqual(['Remit amoun…']);
    // the … uses the font of the last piece left over (the bold run)
    const pieces = layout.lines[0]?.pieces;
    expect(pieces?.map((p) => [p.run, p.text])).toEqual([
      [0, 'Remit '],
      [1, 'amoun…'],
    ]);
    expect(layout.width).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('the cut of … is by code point: an emoji does not become a lone surrogate', () => {
    for (let limit = 8; limit <= 60; limit += 1) {
      const layout = layoutRuns(
        [run('😀😀😀😀😀😀')],
        { ...BASE, wrap: 'none', ellipsis: true },
        approximateMeasurer,
        limit,
      );
      const text = lineTexts(layout)[0] ?? '';
      expect(text.endsWith('…'), `limit ${limit}`).toBe(true);
      expect(LONE_SURROGATE.test(text), `limit ${limit}: ${JSON.stringify(text)}`).toBe(
        false,
      );
    }
  });

  it('the chip that does not fit with the … goes out whole', () => {
    const layout = layoutRuns(
      [run('ab '), run('overdue', {}, CHIP)],
      { ...BASE, wrap: 'none', ellipsis: true },
      approximateMeasurer,
      50,
    );
    const text = lineTexts(layout)[0];
    expect(text?.endsWith('…')).toBe(true);
    expect(text).not.toContain('venc');
  });
});

describe('measureRichText', () => {
  it('3 runs: height = number of lines × line height', () => {
    const font: MeasureFont = {
      ...FONT,
      size: 10,
      lineHeight: 12,
    };
    const runs: RichRun[] = [
      { text: 'My ', font },
      { text: 'good dogs ', font: { ...font, italic: true } },
      { text: 'barked there loud', font },
    ];
    const metrics = measureRichText(
      runs,
      { size: 10, lineHeight: 12 },
      approximateMeasurer,
      70,
    );
    expect(metrics.lines).toEqual(['My good dogs', 'barked there', 'loud']);
    expect(metrics.height).toBeCloseTo(3 * 12, 6);
    expect(metrics.width).toBeCloseTo(66, 6);
  });

  it('without a max width it measures one line per paragraph', () => {
    const metrics = measureRichText([run('abc def')], BASE, approximateMeasurer);
    expect(metrics.lines).toEqual(['abc def']);
    expect(metrics.height).toBeCloseTo(16.8, 6);
  });
});

// ---------------------------------------------------------------------------------------
// component.schema.json
// ---------------------------------------------------------------------------------------

describe('component.schema.json: runs', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
  const accepts = (child: Record<string, unknown>) =>
    checkSchema(schema, component(child)).length === 0;

  it('accepts the runs, with literal and expression on each key', () => {
    expect(accepts(richNode(RUNS))).toBe(true);
    expect(
      accepts(
        richNode([
          {
            text: { $field: 'label' },
            weight: { $switch: 'tom', cases: { forte: 700 } },
            italic: true,
            color: { $field: 'cor', default: '#000000' },
            decoration: 'line-through',
            family: 'Inter',
            size: 12,
            background: { $if: { $has: 'label' }, then: '#eee' },
            radius: { $field: 'raio', default: 4 },
            padding: [2, 6],
          },
          { text: 'x', padding: { $field: 'respiro', default: 3 } },
        ]),
      ),
    ).toBe(true);
  });

  it('refuses text and runs together, neither of the two, empty runs and garbage in the run', () => {
    expect(accepts(richNode(RUNS, { text: 'a' }))).toBe(false);
    expect(accepts({ type: 'text' })).toBe(false);
    expect(accepts(richNode([]))).toBe(false);
    expect(accepts(richNode([{ weight: 700 }]))).toBe(false);
    expect(accepts(richNode([{ text: 'a', bogus: 1 }]))).toBe(false);
    expect(accepts(richNode([{ text: 'a', padding: [1, 2, 3, 4] }]))).toBe(false);
  });

  it('plain text is still accepted', () => {
    expect(accepts({ type: 'text', text: 'hi' })).toBe(true);
  });
});

/** Unpaired surrogate (high without low, or low without high). */
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('minContentRuns (L4, decision 17 of #1078)', () => {
  const font: MeasureFont = {
    family: 'sans',
    size: 10,
    weight: 400,
    italic: false,
    lineHeight: 12,
    letterSpacing: 0,
  };
  const base: RichBase = { size: 10, lineHeight: 12 };
  const run = (text: string, extra: Partial<RichRun> = {}): RichRun => ({
    text,
    font,
    ...extra,
  });

  it('is the widest word, and a word that crosses runs is a single one', () => {
    const runs = [run('Re'), run('mit'), run(' ab')];
    expect(minContentRuns(runs, base, approximateMeasurer)).toBeCloseTo(5 * 5.5, 9);
  });

  it('the chip is atomic: the whole box counts, text with a space and breathing room', () => {
    const runs = [run('ab '), run('cd ef', { chip: { padding: [2, 4] } })];
    expect(minContentRuns(runs, base, approximateMeasurer)).toBeCloseTo(5 * 5.5 + 8, 9);
  });

  it('wrap none: the widest line', () => {
    const runs = [run('aa bb'), run('\ncc')];
    expect(
      minContentRuns(runs, { ...base, wrap: 'none' }, approximateMeasurer),
    ).toBeCloseTo(5 * 5.5, 9);
  });

  it('without runs it is 0', () => {
    expect(minContentRuns([], base, approximateMeasurer)).toBe(0);
  });
});

describe('reading direction in the runs (R2, #1107)', () => {
  const runs = [run('Remit '), run('amount', { weight: 700 }), run(' soon')];

  it('in rtl the pieces of a line run from right to left, in the same space', () => {
    const ltr = layoutRuns(runs, { ...BASE, align: 'right' }, approximateMeasurer, 200);
    const rtl = layoutRuns(
      runs,
      { ...BASE, align: 'right', direction: 'rtl' },
      approximateMeasurer,
      200,
    );
    const xs = (l: typeof ltr) => l.lines[0]!.pieces.map((p) => p.x);
    expect(xs(ltr)[0]!).toBeLessThan(xs(ltr)[1]!);
    expect(xs(rtl)[0]!).toBeGreaterThan(xs(rtl)[1]!);
    expect(xs(rtl)[1]!).toBeGreaterThan(xs(rtl)[2]!);
    // the logical order of the pieces and the line width do not change; only the positions mirror
    expect(rtl.lines[0]!.pieces.map((p) => p.run)).toEqual([0, 1, 2]);
    expect(rtl.width).toBe(ltr.width);
    const right = (l: typeof ltr) =>
      Math.max(...l.lines[0]!.pieces.map((p) => p.x + p.width));
    expect(right(rtl)).toBeCloseTo(right(ltr), 9);
    expect(Math.min(...xs(rtl))).toBeCloseTo(Math.min(...xs(ltr)), 9);
  });

  it('the first logical piece sits at the right edge of the content, the last at the left', () => {
    const layout = layoutRuns(
      [run('ab'), run('cd')],
      { ...BASE, direction: 'rtl' },
      approximateMeasurer,
      100,
    );
    const [first, last] = layout.lines[0]!.pieces;
    expect(last!.x).toBe(0);
    expect(first!.x).toBeCloseTo(last!.width, 9);
  });

  it('without direction (or in ltr) nothing changes', () => {
    const plain = layoutRuns(runs, BASE, approximateMeasurer, 100);
    expect(plain.lines[0]!.pieces[0]!.x).toBe(0);
    expect(layoutRuns(runs, { ...BASE }, approximateMeasurer, 100)).toEqual(plain);
  });

  it('the rich text of an rtl node reaches the scene with the pieces mirrored', () => {
    const file = richFile({
      font: { size: 14, align: 'start' },
      runs: [{ text: 'ab' }, { text: 'cd' }],
    });
    const ltr = textOf(file, {}).runLayout!.lines[0]!.pieces.map((p) => p.x);
    const { root } = instantiate(
      file,
      {},
      { x: 0, y: 0, width: 100, height: 40 },
      { measure: approximateMeasurer, direction: 'rtl' },
    );
    const scene = [...walk(root)].find((n): n is TextNode => n.type === 'text')!;
    expect(scene.style.direction).toBe('rtl');
    const rtl = scene.runLayout!.lines[0]!.pieces.map((p) => p.x);
    expect(ltr[0]!).toBeLessThan(ltr[1]!);
    expect(rtl[0]!).toBeGreaterThan(rtl[1]!);
  });
});
