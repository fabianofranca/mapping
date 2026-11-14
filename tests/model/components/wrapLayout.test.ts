// MC4 (decisions 11 to 13 of #898): `layout.wrap`, `lineGap`, `maxPerLine` and `maxLines` on the frame,
// on `repeat` and the validation of the new keys.
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
  measureComponent,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';
import { checkSchema } from '../../support/jsonSchema';

const schema: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
);

type Json = Record<string, unknown>;
const V4 = 'only allowed with formatVersion 4';

function file(template: Json, formatVersion = 4, extra: Json = {}): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
    ...extra,
  };
}

/** A rectangle of `w` × `h` with the given name (child of the test frame). */
function rect(name: string, w = 100, h = 20, extra: Json = {}): Json {
  return { type: 'rect', name, width: w, height: h, ...extra };
}

function kids(n: number, w = 100, h = 20): Json[] {
  return Array.from({ length: n }, (_, i) => rect(`k${i}`, w, h));
}

function frame(layout: Json, children: Json[], extra: Json = {}): Json {
  return {
    type: 'frame',
    name: 'host',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row', ...layout },
    children,
    ...extra,
  };
}

const BOX = { x: 0, y: 0, width: 320, height: 200 };

function build(template: Json, box = BOX, formatVersion = 4) {
  const result = instantiate(file(template, formatVersion) as never, {}, box, {
    measure: approximateMeasurer,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const at = (name: string): { x: number; y: number; width: number; height: number } => {
    const node = nodes.find((n) => n.name === name) as SceneNode | undefined;
    if (node === undefined) throw new Error(`no node ${name}`);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  const has = (name: string): boolean => nodes.some((n) => n.name === name);
  return { ...result, at, has };
}

describe('wrap: the FlowRow (decision 13)', () => {
  it('5 children of 100 in a row of 320, gap 8, lineGap 12: 3 + 2 at the FlowRow positions', () => {
    const { at, warnings } = build(
      frame({ wrap: 'wrap', gap: 8, lineGap: 12, align: 'start' }, kids(5)),
    );
    // 3 × 100 + 2 × 8 = 316 ≤ 320; the fourth does not fit (316 + 8 + 100 > 320).
    expect([0, 1, 2].map((i) => at(`k${i}`).x)).toEqual([0, 108, 216]);
    expect([0, 1, 2].map((i) => at(`k${i}`).y)).toEqual([0, 0, 0]);
    expect([3, 4].map((i) => at(`k${i}`).x)).toEqual([0, 108]);
    expect([3, 4].map((i) => at(`k${i}`).y)).toEqual([32, 32]);
    expect(warnings).toEqual([]);
  });

  it('without wrap (default), the same children stay on a single line, as today', () => {
    const { at } = build(frame({ gap: 8 }, kids(5)));
    expect(at('k4').y).toBe(0);
    expect(at('k4').x).toBe(432);
  });

  it('literal wrap: "none" counts as no wrap', () => {
    const { at } = build(frame({ wrap: 'none', gap: 8 }, kids(5)));
    expect(at('k4').y).toBe(0);
  });

  it('column with wrap: the columns line up from left to right', () => {
    const { at } = build(
      {
        ...frame({ type: 'column', wrap: 'wrap', gap: 4, lineGap: 10 }, kids(5, 60, 80)),
      },
      { x: 0, y: 0, width: 320, height: 200 },
    );
    // 2 × 80 + 4 = 164 ≤ 200; the third does not fit (164 + 4 + 80 > 200).
    expect([0, 1].map((i) => at(`k${i}`).y)).toEqual([0, 84]);
    expect([2, 3].map((i) => at(`k${i}`).y)).toEqual([0, 84]);
    expect([0, 2, 4].map((i) => at(`k${i}`).x)).toEqual([0, 70, 140]);
    expect(at('k4').y).toBe(0);
  });

  it('wrap-reverse: the new line sits above the first', () => {
    const { at } = build(frame({ wrap: 'wrap-reverse', gap: 8, lineGap: 12 }, kids(5)));
    // two lines of 20, lineGap 12 → block of 52; the first line goes at the bottom.
    expect([0, 1, 2].map((i) => at(`k${i}`).y)).toEqual([32, 32, 32]);
    expect([3, 4].map((i) => at(`k${i}`).y)).toEqual([0, 0]);
    expect(at('k0').x).toBe(0);
    expect(at('k3').x).toBe(0);
  });

  it('justify applies in each line: space-between and space-evenly', () => {
    const between = build(
      frame({ wrap: 'wrap', gap: 8, justify: 'space-between' }, kids(5)),
    );
    // line 1: 3 children in 320 → extra (320 − 300) / 2 = 10; line 2: 2 children, slack 120.
    expect([0, 1, 2].map((i) => between.at(`k${i}`).x)).toEqual([0, 110, 220]);
    expect([3, 4].map((i) => between.at(`k${i}`).x)).toEqual([0, 220]);
    const evenly = build(
      frame({ wrap: 'wrap', gap: 0, justify: 'space-evenly' }, kids(5)),
    );
    // line 1: 3 × 100, slack 20 → 5 per gap; line 2: 2 × 100, slack 120 → 40 per gap.
    expect([0, 1, 2].map((i) => evenly.at(`k${i}`).x)).toEqual([5, 110, 215]);
    expect([3, 4].map((i) => evenly.at(`k${i}`).x)).toEqual([40, 180]);
  });

  it('reverse mirrors each line (not the stack of lines)', () => {
    const { at } = build(frame({ wrap: 'wrap', gap: 8, reverse: true }, kids(5)));
    // line 1 (k0..k2) mirrored: k0 at the end; line 2 (k3, k4), `start` becomes the end.
    expect([0, 1, 2].map((i) => at(`k${i}`).x)).toEqual([220, 112, 4]);
    expect([3, 4].map((i) => at(`k${i}`).x)).toEqual([220, 112]);
    expect(at('k3').y).toBe(20);
  });

  it('align center on the cross axis applies within each line', () => {
    const children = [
      rect('a', 100, 40),
      rect('b', 100, 20),
      rect('c', 100, 20),
      rect('d', 100, 10),
    ];
    const { at } = build(
      frame({ wrap: 'wrap', gap: 8, align: 'center', lineGap: 6 }, children),
    );
    // line 1: a, b, c (height 40): b and c centered; line 2: d alone (height 10) at y = 46.
    expect(at('a').y).toBe(0);
    expect(at('b').y).toBe(10);
    expect(at('c').y).toBe(10);
    expect(at('d').y).toBe(46);
  });

  it('align baseline applies per line, by the first baseline of each line', () => {
    const text = (name: string, size: number, lineHeight: number): Json => ({
      type: 'text',
      name,
      text: 'Ok',
      width: 'hug',
      font: { size, lineHeight },
    });
    const children = [
      text('a', 14, 20),
      text('b', 22, 28),
      text('c', 14, 20),
      text('d', 14, 20),
      text('e', 22, 28),
    ];
    // Widths: the text "Ok" is narrow; force the break with `maxPerLine` 2.
    const { at } = build(
      frame(
        { wrap: 'wrap', align: 'baseline', maxPerLine: 2, gap: 4, lineGap: 2 },
        children,
      ),
    );
    const small = lineBaseline(0, 20, {
      ascent: APPROX_ASCENT_RATIO * 14,
      descent: APPROX_DESCENT_RATIO * 14,
    });
    const big = lineBaseline(0, 28, {
      ascent: APPROX_ASCENT_RATIO * 22,
      descent: APPROX_DESCENT_RATIO * 22,
    });
    // line 1 (a, b): the baselines coincide; line 2 (c, d): equal, no shift; line 3: e alone.
    expect(at('a').y + small).toBeCloseTo(at('b').y + big, 6);
    expect(at('c').y).toBeCloseTo(at('d').y, 6);
    // line 2 starts after line 1 (the height of line 1 + lineGap).
    const line1 = Math.max(at('a').y + 20, at('b').y + 28);
    expect(at('c').y).toBeCloseTo(line1 + 2, 6);
  });
});

describe('wrap: maxPerLine, maxLines and a child larger than the line', () => {
  it('maxPerLine 2 breaks every 2 children even with room', () => {
    const { at } = build(frame({ wrap: 'wrap', maxPerLine: 2, gap: 4 }, kids(5, 50)));
    expect([0, 1].map((i) => at(`k${i}`).y)).toEqual([0, 0]);
    expect([2, 3].map((i) => at(`k${i}`).y)).toEqual([20, 20]);
    expect(at('k4').y).toBe(40);
    expect(at('k1').x).toBe(54);
  });

  it('maxLines 1 does not draw what goes past the line and warns "<n> children outside maxLines: <node>"', () => {
    const result = build(frame({ wrap: 'wrap', gap: 8, maxLines: 1 }, kids(5)));
    expect(result.has('k2')).toBe(true);
    expect(result.has('k3')).toBe(false);
    expect(result.has('k4')).toBe(false);
    expect(result.warnings).toContain('2 children outside maxLines: host');
    expect(result.messages.map((m) => m.code)).toContain(
      'engine.childrenOutsideMaxLines',
    );
  });

  it('maxLines with all children inside does not warn', () => {
    const result = build(frame({ wrap: 'wrap', gap: 8, maxLines: 2 }, kids(5)));
    expect(result.has('k4')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('a child larger than the whole line stays alone on a line (and warns it does not fit)', () => {
    const children = [rect('a', 100), rect('big', 400), rect('b', 100)];
    const { at, warnings } = build(frame({ wrap: 'wrap', gap: 8, lineGap: 4 }, children));
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('big')).toMatchObject({ x: 0, y: 24 });
    expect(at('b')).toMatchObject({ x: 0, y: 48 });
    expect(warnings).toContain('content larger than the box: host');
  });
});

describe('wrap: hug', () => {
  function measured(
    layout: Json,
    children: Json[],
    size: { width: number | null; height: number | null },
  ) {
    return measureComponent(
      file(
        frame(layout, children, {
          width: size.width ?? 'hug',
          height: size.height ?? 'hug',
        }),
        4,
        { sizing: { width: size.width === null ? 'hug' : size.width, height: 'hug' } },
      ) as never,
      {},
      size,
      { measure: approximateMeasurer },
    );
  }

  it('hug on the main axis with no given width measures a single line (max-content)', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 12 }, kids(5), {
      width: null,
      height: null,
    });
    expect(size.width).toBe(5 * 100 + 4 * 8);
    expect(size.height).toBe(20);
  });

  it('hug on the cross axis is the sum of the lines with the lineGaps', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 12 }, kids(5), {
      width: 320,
      height: null,
    });
    expect(size.height).toBe(20 + 12 + 20);
  });

  it('hug on both axes with maxPerLine: the width is that of the fullest line', () => {
    const size = measured({ wrap: 'wrap', gap: 8, lineGap: 4, maxPerLine: 2 }, kids(5), {
      width: null,
      height: null,
    });
    expect(size.width).toBe(2 * 100 + 8);
    expect(size.height).toBe(3 * 20 + 2 * 4);
  });
});

describe('wrap: repeat', () => {
  function repeatFile(extra: Json): Json {
    return frame({ type: 'column' }, [
      {
        type: 'repeat',
        name: 'rep',
        count: 5,
        direction: 'row',
        gap: 8,
        width: 'fill',
        template: { type: 'frame', name: 'cell', width: 100, height: 20, children: [] },
        ...extra,
      },
    ]);
  }

  it('a row repeat with wrap, lineGap and maxLines breaks the lines like the frame', () => {
    const result = build(repeatFile({ wrap: 'wrap', lineGap: 12 }));
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(cells).toHaveLength(5);
    const boxes = absoluteBoxes(result.root);
    const ys = cells.map((c) => boxes.get(c.id)?.y);
    expect(ys).toEqual([0, 0, 0, 32, 32]);
    const limited = build(repeatFile({ wrap: 'wrap', lineGap: 12, maxLines: 1 }));
    expect([...walk(limited.root)].filter((n) => n.name === 'cell')).toHaveLength(3);
    expect(limited.warnings).toContain('2 children outside maxLines: rep');
  });

  it('a row repeat with wrap and no width takes the width of the parent (otherwise it would have nowhere to break)', () => {
    const result = build(
      frame({ type: 'column' }, [
        {
          type: 'repeat',
          name: 'rep',
          count: 5,
          direction: 'row',
          gap: 8,
          wrap: 'wrap',
          lineGap: 12,
          template: { type: 'frame', name: 'cell', width: 100, height: 20, children: [] },
        },
      ]),
    );
    const boxes = absoluteBoxes(result.root);
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(cells.map((c) => boxes.get(c.id)?.y)).toEqual([0, 0, 0, 32, 32]);
  });

  it('the repeat without wrap stays on a single line', () => {
    const result = build(repeatFile({}));
    const boxes = absoluteBoxes(result.root);
    const cells = [...walk(result.root)].filter((n) => n.name === 'cell');
    expect(new Set(cells.map((c) => boxes.get(c.id)?.y))).toEqual(new Set([0]));
  });
});

describe('wrap: validation', () => {
  const issues = (template: Json, version = 4): string[] =>
    validateComponent(file(template, version));

  const flow = (layout: Json): Json => frame(layout, kids(2));

  it('the valid new keys pass, also by expression', () => {
    expect(
      issues(
        flow({
          wrap: 'wrap-reverse',
          lineGap: { $field: 'g', default: 4 },
          maxPerLine: 3,
          maxLines: 2,
        }),
      ),
    ).toEqual([]);
    expect(issues(flow({ wrap: { $field: 'w' }, lineGap: 2 }))).toEqual([]);
  });

  it('lineGap, maxPerLine and maxLines without wrap (absent or "none") are an error', () => {
    expect(issues(flow({ lineGap: 4 }))).toContain(
      'template.layout.lineGap: only valid with wrap',
    );
    expect(issues(flow({ wrap: 'none', maxPerLine: 2 }))).toContain(
      'template.layout.maxPerLine: only valid with wrap',
    );
    expect(issues(flow({ maxLines: 2 }))).toContain(
      'template.layout.maxLines: only valid with wrap',
    );
  });

  it('invalid values', () => {
    expect(issues(flow({ wrap: 'yes' })).join('\n')).toMatch(/template\.layout\.wrap/);
    expect(issues(flow({ wrap: 'wrap', lineGap: -1 })).join('\n')).toMatch(
      /template\.layout\.lineGap: .*greater than or equal to 0/,
    );
    expect(issues(flow({ wrap: 'wrap', maxPerLine: 0 })).join('\n')).toMatch(
      /template\.layout\.maxPerLine: .*integer/,
    );
    expect(issues(flow({ wrap: 'wrap', maxLines: 1.5 })).join('\n')).toMatch(
      /template\.layout\.maxLines: .*integer/,
    );
  });

  it('layout none does not accept wrap (only type counts)', () => {
    const list = issues(frame({ type: 'none', wrap: 'wrap' }, kids(1)));
    expect(list.join('\n')).toMatch(/template\.layout\.wrap: unknown key: wrap/);
  });

  it.each([1, 2, 3])('in formatVersion %i the new keys are an error', (version) => {
    const list = issues(
      flow({ wrap: 'wrap', lineGap: 4, maxPerLine: 2, maxLines: 2 }),
      version,
    );
    for (const key of ['wrap', 'lineGap', 'maxPerLine', 'maxLines'])
      expect(list).toContain(`template.layout.${key}: ${V4}`);
  });

  it('the repeat accepts the four keys and checks the values', () => {
    const repeat = (extra: Json): Json =>
      frame({ type: 'column' }, [
        {
          type: 'repeat',
          count: 3,
          direction: 'row',
          template: { type: 'frame', children: [] },
          ...extra,
        },
      ]);
    expect(
      issues(repeat({ wrap: 'wrap', lineGap: 4, maxPerLine: 2, maxLines: 3 })),
    ).toEqual([]);
    expect(issues(repeat({ lineGap: 4 }))).toContain(
      'template.children[0].lineGap: only valid with wrap',
    );
    expect(issues(repeat({ wrap: 'x' })).join('\n')).toMatch(
      /template\.children\[0\]\.wrap/,
    );
    expect(issues(repeat({ wrap: 'wrap' }), 3)).toContain(
      `template.children[0].wrap: ${V4}`,
    );
  });

  it('the JSON schema accepts the new keys (frame, slot and repeat)', () => {
    const doc = file(
      frame({ wrap: 'wrap', lineGap: 4, maxPerLine: 3, maxLines: 2 }, [
        {
          type: 'repeat',
          count: 3,
          wrap: 'wrap-reverse',
          lineGap: 2,
          maxPerLine: 2,
          maxLines: 2,
          template: { type: 'frame', children: [] },
        },
        { type: 'slot', layout: { type: 'row', wrap: 'wrap', lineGap: 1 } },
      ]),
    );
    expect(checkSchema(schema, doc)).toEqual([]);
    // An expression in `wrap` (`$if`, `$switch`) takes the values of `wrap`, not those of `justify`.
    const byField = (wrap: Json) => file(frame({ wrap }, kids(1)));
    expect(
      checkSchema(
        schema,
        byField({ $if: { $field: 'x' }, then: 'wrap', else: 'wrap-reverse' }),
      ),
    ).toEqual([]);
    expect(
      checkSchema(
        schema,
        byField({ $switch: 'm', cases: { a: 'wrap' }, default: 'none' }),
      ),
    ).toEqual([]);
    expect(
      checkSchema(
        schema,
        byField({ $if: { $field: 'x' }, then: 'space-between', else: 'none' }),
      ).length,
    ).toBeGreaterThan(0);
    const bad = file(frame({ wrap: 'zig' }, []));
    expect(checkSchema(schema, bad).length).toBeGreaterThan(0);
  });
});
