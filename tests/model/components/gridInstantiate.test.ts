// L3 (decisions 10 to 13 and 16 of #1078): `layout.type: "grid"` (tracks, placement, `span`, alignment
// in the cell, size) and the weights (`weight`) in the engine, with the `approximateMeasurer`.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

function file(template: Json): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
  };
}

/** A rectangle of side `w` × `h` (px) with the given name. */
function rect(name: string, w: unknown = 100, h: unknown = 20, extra: Json = {}): Json {
  return { type: 'rect', name, width: w, height: h, ...extra };
}

/** `n` rectangles `k0…` of width `fill` and height 20 (the cell decides the width). */
function cells(n: number, extra: Json = {}): Json[] {
  return Array.from({ length: n }, (_, i) => rect(`k${i}`, 'fill', 20, extra));
}

function grid(layout: Json, children: Json[], extra: Json = {}): Json {
  return {
    type: 'frame',
    name: 'g',
    width: 'fill',
    height: 'fill',
    layout: { type: 'grid', ...layout },
    children,
    ...extra,
  };
}

/** A `hug` frame with a rectangle inside: the `hug` child that `stretch` stretches. */
function hugKid(name: string, w = 40, h = 20): Json {
  return {
    type: 'frame',
    name,
    width: 'hug',
    height: 'hug',
    layout: { type: 'row' },
    children: [rect(`${name}-r`, w, h)],
  };
}

const BOX = { x: 0, y: 0, width: 320, height: 200 };

function build(template: Json, box = BOX, values: Record<string, unknown> = {}) {
  const result = instantiate(file(template) as never, values as never, box, {
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
  return { ...result, at };
}

/** The grid as the root of a `row` (the `hug` grid needs a parent to measure). */
function hosted(gridFrame: Json, box = BOX, values: Record<string, unknown> = {}) {
  return build(
    {
      type: 'frame',
      name: 'host',
      width: 'fill',
      height: 'fill',
      layout: { type: 'row' },
      children: [gridFrame],
    },
    box,
    values,
  );
}

describe('grid: fixed columns', () => {
  it('columns 3 with 7 fill children: 3 lines, the last with 1; gap and lineGap', () => {
    const { at, warnings } = build(grid({ columns: 3, gap: 8, lineGap: 4 }, cells(7)));
    const track = (320 - 16) / 3;
    for (let i = 0; i < 7; i++) {
      const cell = at(`k${i}`);
      expect(cell.width).toBeCloseTo(track, 9);
      expect(cell.height).toBe(20);
      expect(cell.x).toBeCloseTo((i % 3) * (track + 8), 9);
      expect(cell.y).toBe(Math.floor(i / 3) * 24);
    }
    expect(at('k6').x).toBe(0);
    expect(at('k6').y).toBe(48);
    expect(warnings).toEqual([]);
  });

  it('padding moves the cells away and shrinks the tracks', () => {
    const { at } = build(grid({ columns: 2, padding: 10 }, cells(3)));
    expect(at('k0')).toMatchObject({ x: 10, y: 10, width: 150, height: 20 });
    expect(at('k1')).toMatchObject({ x: 160, y: 10, width: 150 });
    expect(at('k2')).toMatchObject({ x: 10, y: 30 });
  });

  it('minColumnWidth 120 in a width of 400 with gap 8: 3 columns of (400 − 16) / 3', () => {
    const box = { x: 0, y: 0, width: 400, height: 200 };
    const { at } = build(grid({ minColumnWidth: 120, gap: 8 }, cells(4)), box);
    expect(at('k0').width).toBe(128);
    expect(at('k1').x).toBe(136);
    expect(at('k2').x).toBe(272);
    expect(at('k3')).toMatchObject({ x: 0, y: 20 });
  });

  it('minColumnWidth in a smaller width fits fewer columns (and never fewer than one)', () => {
    const narrow = { x: 0, y: 0, width: 250, height: 200 };
    expect(
      build(grid({ minColumnWidth: 120, gap: 8 }, cells(3)), narrow).at('k1').x,
    ).toBe(129);
    const tiny = { x: 0, y: 0, width: 60, height: 200 };
    const { at } = build(grid({ minColumnWidth: 120 }, cells(2)), tiny);
    expect(at('k0').width).toBe(60);
    expect(at('k1').y).toBe(20);
  });
});

describe('grid: span', () => {
  const box = { x: 0, y: 0, width: 300, height: 200 };

  it('a span 2 that does not fit at the end of the line goes to the next one and leaves the hole', () => {
    const kids = [rect('a', 'fill', 20, { span: 2 }), ...cells(0)];
    const { at } = build(
      grid({ columns: 3 }, [
        ...kids,
        rect('b', 'fill', 20, { span: 2 }),
        rect('c', 'fill', 20),
      ]),
      box,
    );
    expect(at('a')).toMatchObject({ x: 0, y: 0, width: 200 });
    // One track is left on line 0, and `b` asks for two: it goes to line 1 and leaves the hole.
    expect(at('b')).toMatchObject({ x: 0, y: 20, width: 200 });
    expect(at('c')).toMatchObject({ x: 200, y: 20, width: 100 });
  });

  it('the span counts the gaps between the tracks it covers', () => {
    const { at } = build(
      grid({ columns: 3, gap: 10 }, [
        rect('a', 'fill', 20, { span: 2 }),
        rect('b', 'fill'),
      ]),
      box,
    );
    // track = (300 − 20) / 3
    const track = 280 / 3;
    expect(at('a').width).toBeCloseTo(2 * track + 10, 9);
    expect(at('b').x).toBeCloseTo(2 * (track + 10), 9);
  });

  it('a span larger than the tracks is limited to them', () => {
    const { at, warnings } = build(
      grid({ columns: 2 }, [rect('a', 'fill', 20, { span: 5 }), rect('b', 'fill')]),
      box,
    );
    expect(at('a')).toMatchObject({ x: 0, y: 0, width: 300 });
    expect(at('b')).toMatchObject({ x: 0, y: 20, width: 150 });
    expect(warnings).toEqual([]);
  });

  it('an invalid span by expression is 1, with the warning', () => {
    const { at, warnings } = build(
      grid({ columns: 3 }, [rect('a', 'fill', 20, { span: { $field: 's' } })]),
      box,
      { s: 'abc' },
    );
    expect(at('a').width).toBe(100);
    expect(warnings).toEqual(['invalid value in span: abc']);
  });

  it('a valid span by expression is read', () => {
    const { at } = build(
      grid({ columns: 3 }, [rect('a', 'fill', 20, { span: { $field: 's' } })]),
      box,
      { s: 2 },
    );
    expect(at('a').width).toBe(200);
  });
});

describe('grid: horizontal (rows)', () => {
  it('rows 2 fills the columns from top to bottom; lineGap between columns and gap between lines', () => {
    const kids = Array.from({ length: 5 }, (_, i) => rect(`k${i}`, 60, 'fill'));
    const { at } = build(grid({ rows: 2, gap: 8, lineGap: 10 }, kids));
    // track (height) = (200 − 8) / 2 = 96
    expect(at('k0')).toMatchObject({ x: 0, y: 0, width: 60, height: 96 });
    expect(at('k1')).toMatchObject({ x: 0, y: 104, width: 60, height: 96 });
    expect(at('k2')).toMatchObject({ x: 70, y: 0 });
    expect(at('k3')).toMatchObject({ x: 70, y: 104 });
    expect(at('k4')).toMatchObject({ x: 140, y: 0 });
  });

  it('minRowHeight: the number of lines comes from the height', () => {
    const kids = Array.from({ length: 4 }, (_, i) => rect(`k${i}`, 50, 'fill'));
    const { at } = build(grid({ minRowHeight: 60, gap: 10 }, kids));
    // floor((200 + 10) / 70) = 3 lines of (200 − 20) / 3 = 60
    expect(at('k0').height).toBe(60);
    expect(at('k2').y).toBe(140);
    expect(at('k3')).toMatchObject({ x: 50, y: 0 });
  });
});

describe('grid: alignment in the cell', () => {
  const box = { x: 0, y: 0, width: 200, height: 200 };

  it('justify (tracks axis): start, center, end', () => {
    const at = (justify: string) =>
      build(grid({ columns: 2, justify }, [rect('a', 40, 20), rect('b', 40, 20)]), box)
        .at;
    expect([at('start')('a').x, at('start')('b').x]).toEqual([0, 100]);
    expect([at('center')('a').x, at('center')('b').x]).toEqual([30, 130]);
    expect([at('end')('a').x, at('end')('b').x]).toEqual([60, 160]);
  });

  it('align (lines axis): the line has the height of the largest child', () => {
    const at = (align: string) =>
      build(grid({ columns: 2, align }, [rect('a', 40, 20), rect('b', 40, 40)]), box).at;
    expect([at('start')('a').y, at('start')('b').y]).toEqual([0, 0]);
    expect([at('center')('a').y, at('center')('b').y]).toEqual([10, 0]);
    expect([at('end')('a').y, at('end')('b').y]).toEqual([20, 0]);
  });

  it('a hug child with stretch fills the cell on both axes; px does not change', () => {
    const { at } = build(
      grid({ columns: 2, justify: 'stretch', align: 'stretch' }, [
        hugKid('a', 40, 20),
        rect('b', 40, 40),
      ]),
      box,
    );
    expect(at('a')).toMatchObject({ x: 0, y: 0, width: 100, height: 40 });
    expect(at('b')).toMatchObject({ x: 100, width: 40, height: 40 });
  });

  it('without stretch, the hug child keeps its size', () => {
    const { at } = build(grid({ columns: 2 }, [hugKid('a', 40, 20)]), box);
    expect(at('a')).toMatchObject({ width: 40, height: 20 });
  });

  it('justify space-between does not apply in the grid: it falls to start with the warning', () => {
    const { at, warnings } = build(
      grid({ columns: 2, justify: { $field: 'j' } }, [rect('a', 40, 20)]),
      box,
      { j: 'space-between' },
    );
    expect(at('a').x).toBe(0);
    expect(warnings).toEqual(['invalid value in layout.justify: space-between']);
  });
});

describe('grid: reverse', () => {
  it('reverses the order of the children before placing', () => {
    const box = { x: 0, y: 0, width: 300, height: 200 };
    const kids = Array.from({ length: 4 }, (_, i) => rect(`k${i}`, 'fill', 20));
    const { at } = build(grid({ columns: 3, reverse: true }, kids), box);
    expect(at('k3')).toMatchObject({ x: 0, y: 0 });
    expect(at('k2')).toMatchObject({ x: 100, y: 0 });
    expect(at('k1')).toMatchObject({ x: 200, y: 0 });
    expect(at('k0')).toMatchObject({ x: 0, y: 20 });
  });
});

describe('grid: hug', () => {
  const sized = (widths: number[], span: Json[] = []) =>
    widths.map((w, i) => rect(`k${i}`, w, 20, span[i] ?? {}));

  it('hug in width with columns 3 = 3 × the widest cell + gaps + padding', () => {
    const { at } = hosted(
      grid({ columns: 3, gap: 4, lineGap: 6, padding: 10 }, sized([50, 80, 60, 40]), {
        width: 'hug',
        height: 'hug',
      }),
    );
    expect(at('g').width).toBe(3 * 80 + 2 * 4 + 20);
    // 2 lines of 20 + lineGap 6 + padding 20
    expect(at('g').height).toBe(66);
    expect(at('k1')).toMatchObject({ x: 10 + 84, y: 10 });
    expect(at('k3')).toMatchObject({ x: 10, y: 36 });
  });

  it('hug with span: the track comes from the largest (width − span gaps) / span', () => {
    const wide = hosted(
      grid({ columns: 2, gap: 10 }, sized([100, 230], [{}, { span: 2 }]), {
        width: 'hug',
        height: 'hug',
      }),
    );
    // maxCell = max(100, (230 − 10) / 2 = 110)
    expect(wide.at('g').width).toBe(2 * 110 + 10);
    const narrow = hosted(
      grid({ columns: 2, gap: 10 }, sized([100, 150], [{}, { span: 2 }]), {
        width: 'hug',
        height: 'hug',
      }),
    );
    expect(narrow.at('g').width).toBe(2 * 100 + 10);
  });

  it('hug in height = sum of the text lines that wrap at the cell width + lineGaps', () => {
    const text = (name: string, value: string): Json => ({
      type: 'text',
      name,
      text: value,
      width: 'fill',
    });
    const { at } = hosted(
      grid(
        { columns: 2, lineGap: 4 },
        [
          text('a', 'aaaaa bbbbb'),
          text('b', 'aaaaa bbbbb ccccc'),
          text('c', 'aaaaa bbbbb'),
          text('d', 'aaaaa bbbbb'),
        ],
        { height: 'hug', width: 200 },
      ),
      { x: 0, y: 0, width: 200, height: 200 },
    );
    // Cells of 100: "aaaaa bbbbb" (84.7) fits in a line of 16.8; the second text wraps into 2.
    expect(at('a').height).toBeCloseTo(16.8, 9);
    expect(at('b').height).toBeCloseTo(33.6, 9);
    expect(at('g').height).toBeCloseTo(33.6 + 4 + 16.8, 9);
    expect(at('c').y).toBeCloseTo(37.6, 9);
  });

  it('minColumnWidth with hug: the number of columns comes from the available limit', () => {
    const { at } = hosted(
      grid({ minColumnWidth: 100 }, sized([60, 70]), { width: 'hug', height: 'hug' }),
    );
    // The parent limit is 320: floor(320 / 100) = 3 columns; the widest cell (70) decides for the 3.
    expect(at('g').width).toBe(3 * 70);
    expect(at('k1').x).toBe(70);
  });

  it('minColumnWidth with hug and no known limit: one column', () => {
    const size = measureComponent(
      file(
        grid({ minColumnWidth: 100 }, sized([60, 70]), { width: 'hug', height: 'hug' }),
      ) as never,
      {},
      { width: null, height: null },
      { measure: approximateMeasurer },
    );
    expect(size.width).toBe(70);
    expect(size.height).toBe(40);
  });
});

describe('grid: values by expression', () => {
  it('invalid columns falls to columns 1 with the warning', () => {
    const { at, warnings } = build(grid({ columns: { $field: 'n' } }, cells(2)), BOX, {
      n: 'abc',
    });
    expect(warnings).toEqual(['invalid value in layout.columns: abc']);
    expect(at('k0').width).toBe(320);
    expect(at('k1').y).toBe(20);
  });

  it('columns 0 and fractional are also invalid', () => {
    expect(
      build(grid({ columns: { $field: 'n' } }, cells(1)), BOX, { n: 0 }).warnings,
    ).toEqual(['invalid value in layout.columns: 0']);
    expect(
      build(grid({ columns: { $field: 'n' } }, cells(1)), BOX, { n: 2.5 }).warnings,
    ).toEqual(['invalid value in layout.columns: 2.5']);
  });

  it('columns by a valid $field defines the tracks', () => {
    const { at, warnings } = build(grid({ columns: { $field: 'n' } }, cells(4)), BOX, {
      n: 4,
    });
    expect(at('k3').x).toBe(240);
    expect(at('k0').width).toBe(80);
    expect(warnings).toEqual([]);
  });

  it('invalid minColumnWidth falls to columns 1; invalid rows, to rows 1', () => {
    const min = build(grid({ minColumnWidth: { $field: 'n' } }, cells(2)), BOX, {
      n: -5,
    });
    expect(min.warnings).toEqual(['invalid value in layout.minColumnWidth: -5']);
    expect(min.at('k1').y).toBe(20);
    const rows = build(
      grid({ rows: { $field: 'n' } }, [rect('a', 50, 'fill'), rect('b', 50, 'fill')]),
      BOX,
      { n: 'x' },
    );
    expect(rows.warnings).toEqual(['invalid value in layout.rows: x']);
    expect(rows.at('a').height).toBe(200);
    expect(rows.at('b').x).toBe(50);
  });

  it('type by expression that gives grid, with no track at all: one column, no warning', () => {
    const { at, warnings } = build(grid({ type: { $field: 't' } }, cells(2)), BOX, {
      t: 'grid',
    });
    expect(at('k1').y).toBe(20);
    expect(warnings).toEqual([]);
  });

  it('an invisible child does not take a cell', () => {
    const { at } = build(
      grid({ columns: 2 }, [
        rect('a', 'fill', 20),
        rect('b', 'fill', 20, { visible: false }),
        rect('c', 'fill', 20),
      ]),
    );
    expect(at('c')).toMatchObject({ x: 160, y: 0 });
  });
});

describe('grid: size warnings', () => {
  it('content larger than the box: sum of the lines beyond the height', () => {
    const { warnings } = build(grid({ columns: 1, lineGap: 10 }, cells(5)), {
      x: 0,
      y: 0,
      width: 320,
      height: 80,
    });
    expect(warnings).toEqual(['content larger than the box: g']);
  });

  it('a child with px larger than the cell warns', () => {
    const { warnings } = build(grid({ columns: 2 }, [rect('a', 200, 20)]));
    expect(warnings).toEqual(['content larger than the box: g']);
  });

  it('without excess, no warning', () => {
    expect(build(grid({ columns: 2 }, cells(4))).warnings).toEqual([]);
  });
});

describe('weights (weight): Modifier.weight and flex-grow', () => {
  const fills = (weights: unknown[], extra: Json[] = []) =>
    weights.map((w, i) =>
      rect(`k${i}`, 'fill', 'fill', { weight: w, ...(extra[i] ?? {}) }),
    );
  const row = (layout: Json, children: Json[]): Json => ({
    type: 'frame',
    name: 'host',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row', ...layout },
    children,
  });

  it('row with three fill of weight 1, 2 and 1 splits 25%, 50% and 25%', () => {
    const { at } = build(row({}, fills([1, 2, 1])));
    expect([0, 1, 2].map((i) => at(`k${i}`).width)).toEqual([80, 160, 80]);
    expect([0, 1, 2].map((i) => at(`k${i}`).x)).toEqual([0, 80, 240]);
  });

  it('the gaps come out before splitting', () => {
    const { at } = build(row({ gap: 8 }, fills([1, 2, 1])));
    expect([0, 1, 2].map((i) => at(`k${i}`).width)).toEqual([76, 152, 76]);
    expect(at('k2').x).toBe(76 + 8 + 152 + 8);
  });

  it('without weight, the default is 1 and the division is equal', () => {
    const { at } = build(row({}, fills([undefined, undefined])));
    expect(at('k0').width).toBe(160);
  });

  it('weight with maxWidth freezes and redistributes the rest in proportion to the weights', () => {
    const { at } = build(row({ gap: 8 }, fills([1, 2, 1], [{}, { maxWidth: 140 }, {}])));
    // free 304; the one of weight 2 would get 152 > 140: it freezes at 140, 164 are left for the two of weight 1.
    expect([0, 1, 2].map((i) => at(`k${i}`).width)).toEqual([82, 140, 82]);
  });

  it('weight with minWidth freezes on the other side', () => {
    const { at } = build(row({}, fills([1, 3], [{ minWidth: 100 }, {}])));
    // 80 / 240 by the weights; the first has min 100: it freezes and the other gets 220.
    expect([0, 1].map((i) => at(`k${i}`).width)).toEqual([100, 220]);
  });

  it('an invalid weight by expression is ignored (weight 1) with the warning', () => {
    const { at, warnings } = build(row({}, fills([{ $field: 'w' }, 1])), BOX, {
      w: 'abc',
    });
    expect(at('k0').width).toBe(160);
    expect(warnings).toEqual(['invalid value in weight: abc']);
  });

  it('weight 0 and negative are also invalid', () => {
    expect(build(row({}, fills([{ $field: 'w' }, 1])), BOX, { w: 0 }).warnings).toEqual([
      'invalid value in weight: 0',
    ]);
    expect(build(row({}, fills([{ $field: 'w' }, 1])), BOX, { w: -2 }).warnings).toEqual([
      'invalid value in weight: -2',
    ]);
  });

  it('a valid weight by expression is read', () => {
    const { at } = build(row({}, fills([{ $field: 'w' }, 1])), BOX, { w: 3 });
    expect([0, 1].map((i) => at(`k${i}`).width)).toEqual([240, 80]);
  });

  it('column splits the height', () => {
    const { at } = build({
      ...row({ type: 'column' }, [
        rect('k0', 'fill', 'fill', { weight: 1 }),
        rect('k1', 'fill', 'fill', { weight: 3 }),
      ]),
    });
    expect([0, 1].map((i) => at(`k${i}`).height)).toEqual([50, 150]);
    expect(at('k1').y).toBe(50);
  });

  it('fixed and fill mixed: the weight only splits what is left', () => {
    const { at } = build(
      row({}, [
        rect('f', 100, 20),
        ...fills([1, 3]).map((k, i) => ({ ...k, name: `w${i}` })),
      ]),
    );
    expect([0, 1].map((i) => at(`w${i}`).width)).toEqual([55, 165]);
  });

  it('inside a wrap line', () => {
    const { at } = build(row({ wrap: 'wrap' }, fills([1, 1, 2])));
    expect([0, 1, 2].map((i) => at(`k${i}`).width)).toEqual([80, 80, 160]);
    expect(at('k2').x).toBe(160);
  });
});
