// MC1 (decisions 2 to 5 of #898): the baseline in the measurers, `baselinePadding` on the `text` node and
// `layout.align: "baseline"` (frame, `repeat`) and the validation of the new keys.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APPROX_ASCENT_RATIO,
  APPROX_DESCENT_RATIO,
  lineBaseline,
} from '../../../src/model/components/baseline';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import {
  absoluteBoxes,
  walk,
  type SceneNode,
  type TextNode,
} from '../../../src/model/components/scene';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

const V4 = 'only allowed with formatVersion 4';
type Json = Record<string, unknown>;

/** Compose Roboto 14/20: the baseline of the approximate one gives ≈ 15 (14.83). */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};
const BASE_14 = lineBaseline(0, 20, {
  ascent: APPROX_ASCENT_RATIO * 14,
  descent: APPROX_DESCENT_RATIO * 14,
});
const BASE_22 = lineBaseline(0, 28, {
  ascent: APPROX_ASCENT_RATIO * 22,
  descent: APPROX_DESCENT_RATIO * 22,
});

function file(template: Json, formatVersion = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 300, height: 100 },
    template,
  };
}

function text(name: string, size: number, lineHeight: number, extra: Json = {}): Json {
  return {
    type: 'text',
    name,
    text: 'Ok',
    font: { size, lineHeight },
    ...extra,
  };
}

function build(template: Json, box = { x: 0, y: 0, width: 300, height: 100 }) {
  const result = instantiate(file(template) as never, {}, box, {
    measure: approximateMeasurer,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { node: SceneNode; box: { x: number; y: number } } => {
    const node = nodes.find((n) => n.name === name);
    if (node === undefined) throw new Error(`no node ${name}`);
    return { node, box: boxes.get(node.id) ?? { x: 0, y: 0 } };
  };
  return { ...result, at };
}

describe('approximate measurer: baseline', () => {
  it('Roboto 14/20 gives 15 on the first line (14.83 unrounded)', () => {
    const m = approximateMeasurer('Ok', FONT);
    expect(m.firstBaseline).toBeCloseTo(BASE_14, 6);
    expect(Math.round(m.firstBaseline ?? 0)).toBe(15);
    expect(m.lastBaseline).toBe(m.firstBaseline);
    expect(m.lineCount).toBe(1);
  });

  it('with two lines the last one is one line height below', () => {
    const m = approximateMeasurer('Ok', { ...FONT }, 1);
    expect(m.lineCount).toBeGreaterThanOrEqual(1);
    const two = approximateMeasurer('um\ndois', FONT);
    expect(two.lineCount).toBe(2);
    expect((two.lastBaseline ?? 0) - (two.firstBaseline ?? 0)).toBeCloseTo(20, 6);
  });
});

describe('baselinePadding on the text node', () => {
  const column = (node: Json): Json => ({
    type: 'frame',
    layout: { type: 'column', align: 'start' },
    height: 'hug',
    children: [node],
  });

  it('top greater than the font baseline: the hug measures top + what is left below', () => {
    const { at } = build(column(text('t', 14, 20, { baselinePadding: { top: 30 } })), {
      x: 0,
      y: 0,
      width: 300,
      height: 100,
    });
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBe(30);
    expect(t.height).toBeCloseTo(30 + (20 - BASE_14), 6);
  });

  it('top smaller than the font one: the font one applies (like Compose paddingFromBaseline)', () => {
    const { at } = build(column(text('t', 14, 20, { baselinePadding: { top: 5 } })));
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBeCloseTo(BASE_14, 6);
    expect(t.height).toBeCloseTo(20, 6);
  });

  it('bottom: the distance from the last baseline to the bottom, never smaller than the font one', () => {
    const big = build(column(text('t', 14, 20, { baselinePadding: { bottom: 10 } })));
    expect(big.at('t').node.height).toBeCloseTo(BASE_14 + 10, 6);
    expect((big.at('t').node as TextNode).style.baselineTop).toBeUndefined();
    const small = build(column(text('t', 14, 20, { baselinePadding: { bottom: 1 } })));
    expect(small.at('t').node.height).toBeCloseTo(20, 6);
  });

  it('top and bottom together add up the two distances', () => {
    const { at } = build(
      column(text('t', 14, 20, { baselinePadding: { top: 30, bottom: 12 } })),
    );
    expect(at('t').node.height).toBeCloseTo(30 + 12, 6);
  });

  it('two lines: the height adds the distance between the first and the last baseline', () => {
    const { at } = build(
      column({
        type: 'text',
        name: 't',
        text: 'a\nb',
        font: { size: 14, lineHeight: 20 },
        baselinePadding: { top: 30, bottom: 12 },
      }),
    );
    expect(at('t').node.height).toBeCloseTo(30 + 20 + 12, 6);
  });

  it('without baselinePadding nothing changes: the height is the measure and the scene has no baselineTop', () => {
    const { at } = build(column(text('t', 14, 20)));
    expect(at('t').node.height).toBe(20);
    expect((at('t').node as TextNode).style.baselineTop).toBeUndefined();
  });

  it('the verticalAlign coming from an expression stops applying on the node that has top', () => {
    const { at } = build({
      type: 'frame',
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height: 60,
          text: 'Ok',
          font: {
            size: 14,
            lineHeight: 20,
            verticalAlign: { $switch: 'm', cases: { a: 'middle' }, default: 'bottom' },
          },
          baselinePadding: { top: 30 },
        },
      ],
    });
    const t = at('t').node as TextNode;
    expect(t.style.baselineTop).toBe(30);
    expect(t.style.verticalAlign).toBe('top');
  });

  it('top accepts an expression (field)', () => {
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column' },
        children: [text('t', 14, 20, { baselinePadding: { top: { $field: 'top' } } })],
      }) as never,
      { top: 40 },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    const t = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
    expect(t?.style.baselineTop).toBe(40);
  });
});

describe('layout.align: "baseline"', () => {
  const row = (children: Json[], extra: Json = {}): Json => ({
    type: 'frame',
    layout: { type: 'column' },
    children: [
      {
        type: 'frame',
        name: 'r',
        height: 'hug',
        layout: { type: 'row', align: 'baseline', gap: 4, ...extra },
        children,
      },
    ],
  });

  it('texts of 14 and 22 px stay on the same baseline and the row measures from top to bottom', () => {
    const { at } = build(row([text('a', 14, 20), text('b', 22, 28)]));
    const a = at('a');
    const b = at('b');
    expect(a.box.y + BASE_14).toBeCloseTo(b.box.y + BASE_22, 6);
    expect(Math.min(a.box.y, b.box.y)).toBeCloseTo(0, 6);
    const top = Math.max(BASE_14, BASE_22);
    const low = Math.max(20 - BASE_14, 28 - BASE_22);
    expect(at('r').node.height).toBeCloseTo(top + low, 6);
  });

  it('the text baselinePadding.top enters the baseline of the child', () => {
    const { at } = build(
      row([text('a', 14, 20, { baselinePadding: { top: 30 } }), text('b', 22, 28)]),
    );
    expect(at('a').box.y + 30).toBeCloseTo(at('b').box.y + BASE_22, 6);
  });

  it('a frame with text inside uses the baseline of the first child that has one', () => {
    const { at } = build(
      row([
        {
          type: 'frame',
          name: 'f',
          width: 80,
          height: 'hug',
          layout: { type: 'column', padding: 6 },
          children: [{ type: 'rect', height: 4 }, text('in', 22, 28)],
        },
        text('b', 14, 20),
      ]),
    );
    const inner = at('in');
    expect(inner.box.y + BASE_22).toBeCloseTo(at('b').box.y + BASE_14, 6);
  });

  it('a rect without a baseline aligns the bottom of the box with the baseline of the texts', () => {
    const { at } = build(
      row([{ type: 'rect', name: 'r1', width: 10, height: 12 }, text('b', 14, 20)]),
    );
    const bottomOfRect = at('r1').box.y + 12;
    expect(bottomOfRect).toBeCloseTo(at('b').box.y + BASE_14, 6);
  });

  it('in a row repeat, the lines also align by the baseline', () => {
    const { at } = build({
      type: 'frame',
      name: 'host',
      layout: { type: 'column' },
      children: [
        {
          type: 'repeat',
          name: 'rep',
          count: 2,
          direction: 'row',
          gap: 4,
          template: {
            type: 'frame',
            layout: { type: 'row', align: 'baseline' },
            height: 'hug',
            children: [text('x', 14, 20), text('y', 22, 28)],
          },
        },
      ],
    });
    const boxes = absoluteBoxes(at('host').node as never);
    const xs = [...walk(at('host').node as never)].filter((n) => n.name === 'x');
    const ys = [...walk(at('host').node as never)].filter((n) => n.name === 'y');
    expect(xs.length).toBe(2);
    xs.forEach((n, i) => {
      const other = ys[i] as SceneNode;
      expect((boxes.get(n.id)?.y ?? 0) + BASE_14).toBeCloseTo(
        (boxes.get(other.id)?.y ?? 0) + BASE_22,
        6,
      );
    });
  });

  it('in a column, baseline coming from an expression falls to start with the invalid value warning', () => {
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column', align: { $field: 'a' } },
        children: [text('a', 14, 20)],
      }) as never,
      { a: 'baseline' },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(result.warnings).toContain('invalid value in layout.align: baseline');
  });

  it('in a version 3, baseline coming from an expression also falls to start with the warning', () => {
    const result = instantiate(
      file(
        {
          type: 'frame',
          layout: { type: 'row', align: { $field: 'a' } },
          children: [text('a', 14, 20)],
        },
        3,
      ) as never,
      { a: 'baseline' },
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: approximateMeasurer },
    );
    expect(result.warnings).toContain('invalid value in layout.align: baseline');
  });
});

describe('measurer without a baseline', () => {
  it('falls to the approximate computation', () => {
    const bare: TextMeasurer = (value, font, maxWidth) => {
      const { width, height, lines } = approximateMeasurer(value, font, maxWidth);
      return { width, height, ...(lines ? { lines } : {}) };
    };
    const result = instantiate(
      file({
        type: 'frame',
        layout: { type: 'column' },
        height: 'hug',
        children: [text('t', 14, 20, { baselinePadding: { top: 30 } })],
      }) as never,
      {},
      { x: 0, y: 0, width: 300, height: 100 },
      { measure: bare },
    );
    const t = [...walk(result.root)].find((n): n is TextNode => n.type === 'text');
    expect(t?.style.baselineTop).toBe(30);
    expect(t?.height).toBeCloseTo(30 + 20 - BASE_14, 6);
  });
});

describe('validation of baselinePadding and align: "baseline"', () => {
  const label = (extra: Json, version = 4): Json =>
    file(
      {
        type: 'frame',
        children: [{ type: 'text', text: 'Ok', font: { size: 14 }, ...extra } as Json],
      },
      version,
    );
  const rowAlign = (align: unknown, type = 'row', version = 4): Json =>
    file(
      {
        type: 'frame',
        layout: { type, align },
        children: [text('a', 14, 20)],
      },
      version,
    );

  it('accepts top, bottom and expression in format 4', () => {
    expect(validateComponent(label({ baselinePadding: { top: 30, bottom: 8 } }))).toEqual(
      [],
    );
    expect(
      validateComponent(label({ baselinePadding: { top: { $field: 'x', default: 1 } } })),
    ).toEqual([]);
    expect(validateComponent(rowAlign('baseline'))).toEqual([]);
  });

  it.each([1, 2, 3])('in a version %i the new keys fail with v4Only', (version) => {
    expect(validateComponent(label({ baselinePadding: { top: 30 } }, version))).toEqual([
      `template.children[0].baselinePadding: ${V4}`,
    ]);
    expect(validateComponent(rowAlign('baseline', 'row', version))).toEqual([
      `template.layout.align: ${V4}`,
    ]);
  });

  it('literal baseline in a column is an error', () => {
    expect(validateComponent(rowAlign('baseline', 'column'))).toEqual([
      'template.layout.align: baseline is only valid in row',
    ]);
  });

  it('baselinePadding.top does not combine with verticalAlign literal', () => {
    for (const verticalAlign of ['top', 'middle', 'bottom', 'cap-middle'])
      expect(
        validateComponent(
          label({ baselinePadding: { top: 30 }, font: { size: 14, verticalAlign } }),
        ),
      ).toEqual([
        'template.children[0].baselinePadding.top: does not combine with verticalAlign',
      ]);
    expect(
      validateComponent(
        label({
          baselinePadding: { bottom: 8 },
          font: { size: 14, verticalAlign: 'middle' },
        }),
      ),
    ).toEqual([]);
  });

  it('rejects negative numbers, unknown key and wrong type', () => {
    expect(validateComponent(label({ baselinePadding: { top: -1 } }))).toEqual([
      'template.children[0].baselinePadding.top: expected a number greater than or equal to 0',
    ]);
    expect(validateComponent(label({ baselinePadding: { bottom: -2 } }))).toEqual([
      'template.children[0].baselinePadding.bottom: expected a number greater than or equal to 0',
    ]);
    expect(validateComponent(label({ baselinePadding: { left: 1 } }))).toEqual([
      'template.children[0].baselinePadding.left: unknown key: left',
    ]);
    expect(validateComponent(label({ baselinePadding: 4 }))).toEqual([
      'template.children[0].baselinePadding: expected an object',
    ]);
  });

  it('the JSON schema accepts the new keys', () => {
    expect(
      checkSchema(schema, label({ baselinePadding: { top: 30, bottom: 8 } })),
    ).toEqual([]);
    expect(checkSchema(schema, rowAlign('baseline'))).toEqual([]);
  });
});
