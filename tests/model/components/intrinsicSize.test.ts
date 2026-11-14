// L4 (decisions 17 and 18 of #1078): `min-content` and `max-content` in `width`/`height` of the node and in
// the `sizing` of the instance, in the engine, with the `approximateMeasurer` (font size 10: 5.5 px per
// character; 12 px line).
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';
import { fitComponentSize, resolveSizing } from '../../../src/model/components/sizing';

type Json = Record<string, unknown>;

const CHAR = 5.5;
const LINE_HEIGHT = 12;
const V4 = 'only allowed with formatVersion 4';

/** 16 characters: the whole line measures 88 and the widest word ("bbbbbbbb") 44. */
const SENTENCE = 'aaaa bbbbbbbb cc';
const SENTENCE_MAX = 16 * CHAR;
const SENTENCE_MIN = 8 * CHAR;
/** 5 characters: a line of 27.5; the widest word is "yy" (11). */
const SHORT = 'xx yy';
const SHORT_MAX = 5 * CHAR;
const SHORT_MIN = 2 * CHAR;

function file(template: Json, formatVersion = 4, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 400, height: 200 },
    template,
    ...extra,
  };
}

function text(name: string, value: string, extra: Json = {}): Json {
  return { type: 'text', name, text: value, font: { size: 10 }, ...extra };
}

function frame(name: string, layout: Json, children: Json[], extra: Json = {}): Json {
  return { type: 'frame', name, layout, children, ...extra };
}

/** The `host` frame (column that fills the root) with the child `kid` inside. */
function host(kid: Json): Json {
  return frame('host', { type: 'column' }, [kid], { width: 'fill', height: 'fill' });
}

const BOX = { x: 0, y: 0, width: 400, height: 200 };

function build(template: Json, box = BOX, measure: TextMeasurer = approximateMeasurer) {
  const result = instantiate(file(template) as never, {} as never, box, { measure });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { x: number; y: number; width: number; height: number } => {
    const node = nodes.find((n) => n.name === name) as SceneNode | undefined;
    if (node === undefined) throw new Error(`no node ${name}`);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  return { ...result, at };
}

describe('text: min-content and max-content', () => {
  it('max-content is the widest line without wrapping, even in a narrower parent', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'max-content', height: 'hug' })),
      { x: 0, y: 0, width: 50, height: 200 },
    );
    expect(at('t').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(at('t').height).toBe(LINE_HEIGHT);
  });

  it('min-content is the widest word and the text wraps one word per line', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'min-content', height: 'hug' })),
    );
    expect(at('t').width).toBeCloseTo(SENTENCE_MIN, 9);
    expect(at('t').height).toBe(3 * LINE_HEIGHT);
  });

  it('wrap none: min-content and max-content are the whole line', () => {
    const font = { size: 10, wrap: 'none' };
    const min = build(host(text('t', SENTENCE, { width: 'min-content', font }))).at('t');
    const max = build(host(text('t', SENTENCE, { width: 'max-content', font }))).at('t');
    expect(min.width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(max.width).toBeCloseTo(SENTENCE_MAX, 9);
  });

  it('text with \\n: max-content is the widest line and min-content the widest word', () => {
    const value = 'aa\nbbbb cc';
    const max = build(host(text('t', value, { width: 'max-content' }))).at('t');
    const min = build(host(text('t', value, { width: 'min-content' }))).at('t');
    expect(max.width).toBeCloseTo(7 * CHAR, 9);
    expect(min.width).toBeCloseTo(4 * CHAR, 9);
  });

  it('the non-breaking space (NBSP) does not separate words in min-content', () => {
    const { at } = build(host(text('t', '10\u00a0kg aa', { width: 'min-content' })));
    expect(at('t').width).toBeCloseTo(5 * CHAR, 9);
  });

  it('rich text: a word that spans runs is a single word and the chip is atomic', () => {
    const runs = [
      { text: 'Ch' },
      { text: 'eck' },
      { text: ' later ' },
      { text: 'ab cd', background: '#cccccc', padding: [2, 4] },
    ];
    const min = build(host(text('t', '', { runs, width: 'min-content' }))).at('t');
    const max = build(host(text('t', '', { runs, width: 'max-content' }))).at('t');
    // Words: "Check" (27.5), "later" (27.5); the "ab cd" chip measures 27.5 + 2 × 4 = 35.5.
    expect(min.width).toBeCloseTo(5 * CHAR + 8, 9);
    // All on one line: "Check later " (12 characters with the spaces between the runs) and the chip.
    expect(max.width).toBeCloseTo(12 * CHAR + 5 * CHAR + 8, 9);
  });

  it('the maxWidth limit of the node itself still cuts the max-content', () => {
    const { at } = build(
      host(text('t', SENTENCE, { width: 'max-content', maxWidth: 60 })),
    );
    expect(at('t').width).toBe(60);
  });
});

describe('frames: min-content and max-content', () => {
  const A = (extra: Json = {}) => text('a', SENTENCE, extra);
  const B = (extra: Json = {}) => text('b', SHORT, extra);

  it('row: max-content sums the max-content of the children + gaps + padding', () => {
    const row = frame('r', { type: 'row', gap: 4, padding: 6 }, [A(), B()], {
      width: 'max-content',
      height: 'hug',
    });
    const { at } = build(host(row), { x: 0, y: 0, width: 50, height: 200 });
    expect(at('r').width).toBeCloseTo(SENTENCE_MAX + SHORT_MAX + 4 + 12, 9);
    expect(at('a').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(at('r').height).toBe(LINE_HEIGHT + 12);
  });

  it('row: min-content sums the min-content of the children + gaps + padding', () => {
    const row = frame('r', { type: 'row', gap: 4, padding: 6 }, [A(), B()], {
      width: 'min-content',
      height: 'hug',
    });
    const { at } = build(host(row));
    expect(at('r').width).toBeCloseTo(SENTENCE_MIN + SHORT_MIN + 4 + 12, 9);
  });

  it('row with wrap: max-content is a single line; min-content is the largest min-content', () => {
    const wrapped = (width: string) =>
      frame('r', { type: 'row', gap: 4, wrap: 'wrap' }, [A(), B()], {
        width,
        height: 'hug',
      });
    expect(build(host(wrapped('max-content'))).at('r').width).toBeCloseTo(
      SENTENCE_MAX + SHORT_MAX + 4,
      9,
    );
    expect(build(host(wrapped('min-content'))).at('r').width).toBeCloseTo(
      SENTENCE_MIN,
      9,
    );
  });

  it('column and none: the largest child (none sums the anchors)', () => {
    const column = (width: string) =>
      frame('c', { type: 'column', gap: 3 }, [A(), B()], { width, height: 'hug' });
    expect(build(host(column('max-content'))).at('c').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(build(host(column('min-content'))).at('c').width).toBeCloseTo(SENTENCE_MIN, 9);
    const none = (width: string) =>
      frame(
        'n',
        { type: 'none' },
        [A({ anchors: { left: 5 } }), B({ anchors: { right: 8 } })],
        {
          width,
          height: 'hug',
        },
      );
    expect(build(host(none('max-content'))).at('n').width).toBeCloseTo(
      5 + SENTENCE_MAX,
      9,
    );
    expect(build(host(none('min-content'))).at('n').width).toBeCloseTo(
      5 + SENTENCE_MIN,
      9,
    );
  });

  it('grid: n × the largest cell + gaps + padding', () => {
    const grid = (width: string) =>
      frame(
        'g',
        { type: 'grid', columns: 2, gap: 4, padding: 3 },
        [A(), B(), text('c', 'zz')],
        { width, height: 'hug' },
      );
    expect(build(host(grid('max-content'))).at('g').width).toBeCloseTo(
      2 * SENTENCE_MAX + 4 + 6,
      9,
    );
    expect(build(host(grid('min-content'))).at('g').width).toBeCloseTo(
      2 * SENTENCE_MIN + 4 + 6,
      9,
    );
  });

  it('adaptive grid: min-content is one column of minColumnWidth (or of the largest cell)', () => {
    const grid = (min: number) =>
      frame('g', { type: 'grid', minColumnWidth: min, gap: 4 }, [A(), B()], {
        width: 'min-content',
        height: 'hug',
      });
    expect(build(host(grid(120))).at('g').width).toBe(120);
    expect(build(host(grid(10))).at('g').width).toBeCloseTo(SENTENCE_MIN, 9);
  });

  it('a fill child contributes its own min/max-content; % contributes 0', () => {
    const row = (kid: Json, width: string) =>
      frame('r', { type: 'row' }, [kid, B()], { width, height: 'hug' });
    expect(
      build(host(row(A({ width: 'fill' }), 'max-content'))).at('r').width,
    ).toBeCloseTo(SENTENCE_MAX + SHORT_MAX, 9);
    expect(
      build(host(row(A({ width: 'fill' }), 'min-content'))).at('r').width,
    ).toBeCloseTo(SENTENCE_MIN + SHORT_MIN, 9);
    expect(
      build(host(row(A({ width: '50%' }), 'max-content'))).at('r').width,
    ).toBeCloseTo(SHORT_MAX, 9);
  });

  it('a child with a size in px contributes the px; a child with its own min-content contributes that', () => {
    const row = frame(
      'r',
      { type: 'row' },
      [A({ width: 30 }), B({ width: 'min-content' })],
      { width: 'max-content', height: 'hug' },
    );
    expect(build(host(row)).at('r').width).toBeCloseTo(30 + SHORT_MIN, 9);
  });

  it('nested: row max-content › column min-content › row with two texts', () => {
    const inner = () => frame('in', { type: 'row' }, [A(), B()], { width: 'fill' });
    const column = frame('col', { type: 'column' }, [inner(), inner()], {
      width: 'min-content',
      height: 'hug',
    });
    const outer = frame('out', { type: 'row', gap: 2 }, [column, column], {
      width: 'max-content',
      height: 'hug',
    });
    const { at } = build(host(outer));
    // The min-content of the column is that of the inner row (the sum of the children's min-content).
    expect(at('out').width).toBeCloseTo(2 * (SENTENCE_MIN + SHORT_MIN) + 2, 9);
  });

  it('hug stays the same: the shrink-to-fit limited by the space (max-content is not)', () => {
    const row = (width: string) =>
      host(
        frame('r', { type: 'column' }, [A({ width: 'fill' })], { width, height: 'hug' }),
      );
    const at60 = { x: 0, y: 0, width: 60, height: 200 };
    expect(build(row('hug'), BOX).at('r').width).toBeCloseTo(SENTENCE_MAX, 9);
    expect(build(row('hug'), at60).at('r').width).toBe(60);
    expect(build(row('max-content'), at60).at('r').width).toBeCloseTo(SENTENCE_MAX, 9);
  });

  it('height: min-content and max-content equal hug (the height at the already resolved width)', () => {
    const col = (height: string) =>
      frame('c', { type: 'column' }, [A({ width: 'min-content' })], {
        width: 'fill',
        height,
      });
    expect(build(host(col('max-content'))).at('c').height).toBe(3 * LINE_HEIGHT);
    expect(build(host(col('min-content'))).at('c').height).toBe(3 * LINE_HEIGHT);
    expect(build(host(col('hug'))).at('c').height).toBe(3 * LINE_HEIGHT);
  });

  it('a slot measures the content of the slot', () => {
    const slot = { type: 'slot', name: 's', width: 'max-content', height: 'hug' };
    const result = instantiate(file(host(slot)) as never, {} as never, BOX, {
      measure: approximateMeasurer,
      slotContent: { width: 77, height: 30 },
    });
    const node = [...walk(result.root)].find((n) => n.name === 's');
    expect(node?.width).toBe(77);
  });
});

describe('the intrinsic memo and the count of calls to the measurer', () => {
  function spy() {
    const calls = new Map<string, number>();
    const measure: TextMeasurer = (
      value: string,
      font: MeasureFont,
      maxWidth?: number,
    ) => {
      const key = `${value}|${maxWidth ?? ''}`;
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return approximateMeasurer(value, font, maxWidth);
    };
    return { calls, measure };
  }

  it('nested max-content does not measure the same (text, limit) twice', () => {
    const { calls, measure } = spy();
    const inner = (i: number) =>
      frame('in', { type: 'row' }, [text('a', `${SENTENCE} ${i}`), text('b', SHORT)], {
        width: 'fill',
      });
    const column = (i: number) =>
      frame('col', { type: 'column' }, [inner(i), inner(i), inner(i)], {
        width: 'min-content',
        height: 'hug',
      });
    const outer = frame(
      'out',
      { type: 'row' },
      [column(1), column(2), column(3), column(4)],
      { width: 'max-content', height: 'hug' },
    );
    build(host(outer), BOX, measure);
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
  });
});

describe('component measure (measureComponent and sizing)', () => {
  const component = (template: Json, sizing?: Json): never =>
    file(template, 4, sizing === undefined ? {} : { sizing }) as never;
  const body = frame('root', { type: 'column', padding: 4 }, [
    text('a', SENTENCE, { width: 'fill' }),
  ]);

  it('measureComponent measures the max-content/min-content axis of the root', () => {
    const maxContent = measureComponent(
      component(body),
      {},
      { width: 'max-content', height: null },
      { measure: approximateMeasurer },
    );
    expect(maxContent.width).toBeCloseTo(SENTENCE_MAX + 8, 9);
    expect(maxContent.height).toBe(LINE_HEIGHT + 8);
    const minContent = measureComponent(
      component(body),
      {},
      { width: 'min-content', height: null },
      { measure: approximateMeasurer },
    );
    expect(minContent.width).toBeCloseTo(SENTENCE_MIN + 8, 9);
    expect(minContent.height).toBe(3 * LINE_HEIGHT + 8);
  });

  it('sizing accepts min-content and max-content (literal and by expression)', () => {
    const literal = resolveSizing(
      component(body, { width: 'max-content', height: 'min-content' }),
      {},
    );
    expect(literal.width).toEqual({ spec: 'max-content', source: 'literal' });
    expect(literal.height).toEqual({ spec: 'min-content', source: 'literal' });
    const expr = resolveSizing(
      component(body, { width: { $switch: 'style', cases: { a: 'min-content' } } }),
      { style: 'a' } as never,
    );
    expect(expr.width).toEqual({ spec: 'min-content', source: 'expression' });
  });

  it('fitComponentSize: sizing max-content fits to the width without wrapping', () => {
    const fitted = fitComponentSize(
      component(body, { width: 'max-content' }),
      {},
      { measure: approximateMeasurer },
      { maxWidth: 80 },
    );
    // max-content does not wrap: the maxWidth limit of the measure does not apply.
    expect(fitted?.width).toBe(Math.ceil(SENTENCE_MAX + 8 - 1e-6));
  });

  it('fitComponentSize: sizing min-content fits to the widest word', () => {
    const fitted = fitComponentSize(
      component(body, { width: 'min-content' }),
      {},
      { measure: approximateMeasurer },
    );
    expect(fitted?.width).toBe(Math.ceil(SENTENCE_MIN + 8 - 1e-6));
  });
});

describe('validation: min-content and max-content only in formatVersion 4', () => {
  const nodeWith = (width: unknown): Json =>
    frame('r', { type: 'column' }, [text('t', 'a', { width })]);

  it('in v4 the literal applies in width, height and in sizing', () => {
    expect(validateComponent(file(nodeWith('max-content')))).toEqual([]);
    expect(validateComponent(file(nodeWith('min-content')))).toEqual([]);
    expect(
      validateComponent(
        file(frame('r', { type: 'column' }, []), 4, {
          sizing: { width: 'max-content', height: 'min-content' },
        }),
      ),
    ).toEqual([]);
  });

  it('in versions 1 to 3 the literal is v4-only, at the key path', () => {
    for (const version of [1, 2, 3]) {
      const list = validateComponent(file(nodeWith('max-content'), version));
      expect(list).toContain(`template.children[0].width: ${V4}`);
    }
    const sizingList = validateComponent(
      file(frame('r', { type: 'column' }, []), 3, { sizing: { width: 'min-content' } }),
    );
    expect(sizingList).toContain(`sizing.width: ${V4}`);
  });

  it('other text remains invalid', () => {
    expect(validateComponent(file(nodeWith('mid-content'))).length).toBeGreaterThan(0);
  });

  it('by expression, the invalid value falls back to the default with the warning', () => {
    const template = host(
      text('t', SENTENCE, {
        width: { $switch: 'style', cases: { a: 'max-content', b: 'banana' } },
      }),
    );
    const run = (style: string) => {
      const result = instantiate(file(template) as never, { style } as never, BOX, {
        measure: approximateMeasurer,
      });
      return {
        width: [...walk(result.root)].find((n) => n.name === 't')?.width,
        warnings: result.warnings,
      };
    };
    expect(run('a').width).toBeCloseTo(SENTENCE_MAX, 9);
    const bad = run('b');
    expect(bad.warnings).toContain('invalid value in width: banana');
  });

  it('in a v3, the value coming from an expression falls back to the default with the warning', () => {
    const old = instantiate(
      file(host(text('t', SENTENCE, { width: { $field: 'w' } })), 3) as never,
      { w: 'max-content' } as never,
      BOX,
      { measure: approximateMeasurer },
    );
    expect(old.warnings).toContain('invalid value in width: max-content');
  });
});
