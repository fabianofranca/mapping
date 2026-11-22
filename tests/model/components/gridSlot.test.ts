// Grid slot (`layout.type: "grid"`, decision 15 of #1078): resolveSlotLayout, layoutChildren,
// contentExtent and the screen without geometry (layoutScreen) with a `grid` slot.
import { describe, expect, it } from 'vitest';
import {
  contentExtent,
  layoutChildren,
  resolveSlotLayout,
} from '../../../src/model/components/arrange';
import type {
  ComponentFile,
  SlotTemplate,
} from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { layoutScreen, type LayoutNode } from '../../../src/model/components/layout';
import { type Library, loadLibrary } from '../../../src/model/components/library';

const slotOf = (layout: Record<string, unknown>): SlotTemplate =>
  ({ type: 'slot', layout }) as unknown as SlotTemplate;

const resolve = (layout: Record<string, unknown>, values = {}) =>
  resolveSlotLayout(slotOf({ type: 'grid', ...layout }), values);

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const kid = (width: number, height: number) => ({ box: box(0, 0, width, height) });
const kids = (n: number, width = 50, height = 30) =>
  Array.from({ length: n }, () => kid(width, height));

describe('resolveSlotLayout with grid', () => {
  it('reads columns, minColumnWidth, rows and minRowHeight', () => {
    expect(resolve({ columns: 3 })).toMatchObject({
      type: 'grid',
      grid: { count: 3, orientation: 'vertical' },
    });
    expect(resolve({ minColumnWidth: 100 })).toMatchObject({
      type: 'grid',
      grid: { min: 100, orientation: 'vertical' },
    });
    expect(resolve({ rows: 2 })).toMatchObject({
      grid: { count: 2, orientation: 'horizontal' },
    });
    expect(resolve({ minRowHeight: 40 })).toMatchObject({
      grid: { min: 40, orientation: 'horizontal' },
    });
  });

  it('an invalid value by expression falls to one track', () => {
    const n = { $field: 'n' };
    expect(resolve({ columns: n }, { n: 0 }).grid).toEqual({
      count: 1,
      orientation: 'vertical',
    });
    expect(resolve({ columns: n }, { n: 2.5 }).grid?.count).toBe(1);
    expect(resolve({ minColumnWidth: n }, { n: -5 }).grid).toEqual({
      count: 1,
      orientation: 'vertical',
    });
    expect(resolve({ rows: n }, { n: 'x' }).grid).toEqual({
      count: 1,
      orientation: 'horizontal',
    });
    expect(resolve({ minRowHeight: n }, { n: 0 }).grid).toEqual({
      count: 1,
      orientation: 'horizontal',
    });
  });

  it('without any track, columns: 1 applies', () => {
    expect(resolve({}).grid).toEqual({ count: 1, orientation: 'vertical' });
  });

  it('lineGap applies without wrap; align and justify accept only start, center, end and stretch', () => {
    const l = resolve({ columns: 2, gap: 8, lineGap: 4, align: 'stretch' });
    expect(l).toMatchObject({ gap: 8, lineGap: 4, wrap: 'none', align: 'stretch' });
    expect(resolve({ columns: 2, align: 'baseline' }).align).toBe('start');
    expect(resolve({ columns: 2, justify: 'space-between' }).justify).toBe('start');
    expect(resolve({ columns: 2, justify: 'stretch' }).justify).toBe('stretch');
  });
});

describe('layoutChildren in a grid', () => {
  const slot = box(10, 20, 400, 300);

  it('3 columns, 7 equal children: rounded cells', () => {
    const layout = resolve({ columns: 3, gap: 8, lineGap: 4 });
    const out = layoutChildren(slot, layout, kids(7));
    // track: (400 - 16) / 3 = 128; step 136.
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [10, 20],
      [146, 20],
      [282, 20],
      [10, 54],
      [146, 54],
      [282, 54],
      [10, 88],
    ]);
    expect(out.every((b) => b.width === 50 && b.height === 30)).toBe(true);
  });

  it('rounds fractional positions', () => {
    const layout = resolve({ columns: 3 });
    const out = layoutChildren(box(0, 0, 100, 100), layout, kids(3, 10, 10));
    // 100 / 3 = 33.33...; steps 33.33 and 66.67
    expect(out.map((b) => b.x)).toEqual([0, 33, 67]);
  });

  it('minColumnWidth with a slot of 400 and gap 8 gives 3 columns', () => {
    const layout = resolve({ minColumnWidth: 100, gap: 8 });
    const out = layoutChildren(slot, layout, kids(4));
    expect(out.map((b) => b.x)).toEqual([10, 146, 282, 10]);
    expect(out[3]?.y).toBe(50);
  });

  it('rows: 2 fills columns, from top to bottom', () => {
    const layout = resolve({ rows: 2, gap: 8, lineGap: 6 });
    const out = layoutChildren(box(0, 0, 400, 200), layout, kids(5));
    // track (line): (200 - 8) / 2 = 96, step 104; columns of 50 + 6.
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [0, 0],
      [0, 104],
      [56, 0],
      [56, 104],
      [112, 0],
    ]);
  });

  it('justify aligns in the cell (tracks axis)', () => {
    const base = { columns: 3, gap: 8 };
    const x = (justify: string) =>
      layoutChildren(slot, resolve({ ...base, justify }), kids(1))[0];
    expect(x('center')?.x).toBe(10 + 39);
    expect(x('end')?.x).toBe(10 + 78);
    expect(x('stretch')).toMatchObject({ x: 10, width: 128 });
  });

  it('align aligns in the flow line (the extent of the largest child)', () => {
    const children = [kid(50, 30), kid(50, 10)];
    const at = (align: string) =>
      layoutChildren(slot, resolve({ columns: 2, align }), children)[1];
    expect(at('start')).toMatchObject({ y: 20, height: 10 });
    expect(at('center')).toMatchObject({ y: 30, height: 10 });
    expect(at('end')).toMatchObject({ y: 40, height: 10 });
    expect(at('stretch')).toMatchObject({ y: 20, height: 30 });
  });

  it('align and justify in a horizontal grid swap axes', () => {
    // rows: 2: the tracks are the lines (y axis), justify on y; align on x.
    const children = [kid(30, 50), kid(10, 50)];
    const out = layoutChildren(
      box(0, 0, 200, 200),
      resolve({ rows: 1, justify: 'end', align: 'end' }),
      children,
    );
    expect(out[0]).toMatchObject({ x: 0, y: 150 });
    expect(out[1]).toMatchObject({ x: 30, y: 150 });
    expect(
      layoutChildren(box(0, 0, 200, 200), resolve({ rows: 2 }), children),
    ).toHaveLength(2);
  });

  it('reverse puts the last child in the first cell', () => {
    const layout = resolve({ columns: 2, reverse: true });
    const children = [kid(10, 10), kid(20, 10), kid(30, 10)];
    const out = layoutChildren(box(0, 0, 200, 100), layout, children);
    expect(out[2]).toMatchObject({ x: 0, y: 0, width: 30 });
    expect(out[1]).toMatchObject({ x: 100, y: 0, width: 20 });
    expect(out[0]).toMatchObject({ x: 0, y: 10, width: 10 });
  });

  it('padding insets the content area', () => {
    const layout = resolve({ columns: 2, padding: 10 });
    const out = layoutChildren(box(0, 0, 220, 100), layout, kids(3, 20, 20));
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [10, 10],
      [110, 10],
      [10, 30],
    ]);
  });

  it('children of different sizes: the line has the extent of the largest', () => {
    const layout = resolve({ columns: 2, lineGap: 5 });
    const children = [kid(10, 20), kid(10, 40), kid(10, 10)];
    const out = layoutChildren(box(0, 0, 200, 200), layout, children);
    expect(out[2]?.y).toBe(45);
  });
});

describe('a track list in the grid slot (DX6, decisions 21 to 24 of #1903)', () => {
  const slot = box(10, 20, 400, 300);
  const px = (value: number) => ({ kind: 'px', px: value });
  const fr = (value: number) => ({ kind: 'fr', fr: value });
  const HUG = { kind: 'hug' };

  it('resolveSlotLayout reads a list in columns and rows', () => {
    expect(resolve({ columns: [60, '1fr', 'hug'] }).grid).toEqual({
      count: 3,
      tracks: [px(60), fr(1), HUG],
      orientation: 'vertical',
    });
    expect(resolve({ rows: ['2.5fr', 0] }).grid).toEqual({
      count: 2,
      tracks: [fr(2.5), px(0)],
      orientation: 'horizontal',
    });
  });

  it('an invalid list by expression falls to one track; a valid one applies', () => {
    const n = { $field: 'n' };
    expect(resolve({ columns: n }, { n: [10, 'auto'] }).grid).toEqual({
      count: 1,
      orientation: 'vertical',
    });
    expect(resolve({ columns: n }, { n: [] }).grid).toEqual({
      count: 1,
      orientation: 'vertical',
    });
    expect(resolve({ columns: n }, { n: [30, '1fr'] }).grid?.tracks).toEqual([
      px(30),
      fr(1),
    ]);
  });

  it('[60, "1fr", "2fr"] in 400 px with gap 8: the children go to 60, 108 and 216 px tracks', () => {
    const layout = resolve({ columns: [60, '1fr', '2fr'], gap: 8, justify: 'stretch' });
    const out = layoutChildren(slot, layout, kids(4));
    // free = 400 − 60 − 16 = 324 → 108 and 216; starts 0, 68, 184.
    expect(out.map((b) => [b.x, b.width])).toEqual([
      [10, 60],
      [78, 108],
      [194, 216],
      [10, 60],
    ]);
    expect(out[3]?.y).toBe(50);
  });

  it('a hug track measures the children placed in it', () => {
    const layout = resolve({ columns: ['hug', '1fr'], gap: 8, justify: 'stretch' });
    const out = layoutChildren(slot, layout, [
      kid(40, 30),
      kid(50, 30),
      kid(70, 30),
      kid(10, 30),
    ]);
    // hug = max(40, 70) = 70; fr = 400 − 70 − 8 = 322.
    expect(out.map((b) => [b.x, b.width])).toEqual([
      [10, 70],
      [88, 322],
      [10, 70],
      [88, 322],
    ]);
  });

  it('justify aligns inside the cell of each track', () => {
    const layout = resolve({ columns: [100, '1fr'], justify: 'center' });
    const out = layoutChildren(slot, layout, [kid(40, 30), kid(40, 30)]);
    expect(out[0]?.x).toBe(10 + 30);
    expect(out[1]?.x).toBe(10 + 100 + (300 - 40) / 2);
  });

  it('rows as a list in the horizontal grid: the tracks are the lines', () => {
    const layout = resolve({ rows: [40, '1fr', 'hug'], gap: 10, lineGap: 4 });
    const out = layoutChildren(box(0, 0, 400, 300), layout, [
      kid(50, 30),
      kid(50, 30),
      kid(50, 20),
      kid(60, 30),
    ]);
    // hug row = 20; fr = 300 − 40 − 20 − 20 = 220; starts 0, 50, 280.
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [0, 0],
      [0, 50],
      [0, 280],
      [54, 0],
    ]);
  });

  it('reverse and the integer path stay unchanged', () => {
    const layout = resolve({ columns: [60, '1fr'], reverse: true });
    const out = layoutChildren(slot, layout, [kid(10, 10), kid(20, 10), kid(30, 10)]);
    expect(out[2]).toMatchObject({ x: 10, y: 20 });
    expect(out[1]).toMatchObject({ x: 70, y: 20 });
    expect(out[0]).toMatchObject({ x: 10, y: 30 });
  });

  it('contentExtent hugs px + hug tracks + gaps; with fr, the largest need ÷ n × the fr total', () => {
    const noFr = resolve({ columns: [40, 'hug'], gap: 8 });
    expect(contentExtent(noFr, [kid(10, 10), kid(70, 20)], null)).toEqual({
      width: 40 + 8 + 70,
      height: 20,
    });
    const withFr = resolve({ columns: [40, '1fr', '2fr'], gap: 10 });
    // max(50 / 1, 120 / 2) = 60 → 180; 40 + 180 + 20.
    expect(contentExtent(withFr, [kid(30, 10), kid(50, 10), kid(120, 10)], null)).toEqual(
      { width: 240, height: 10 },
    );
  });
});

describe('contentExtent in a grid', () => {
  it('hugs n × the largest child and the sum of the lines', () => {
    const layout = resolve({ columns: 3, gap: 8, lineGap: 4 });
    const children = [kid(40, 10), kid(60, 30), kid(50, 20), kid(30, 15)];
    // width 3 × 60 + 16; lines: 30 and 15, plus lineGap 4.
    expect(contentExtent(layout, children, null)).toEqual({ width: 196, height: 49 });
  });

  it('with minColumnWidth, the available limit decides how many tracks', () => {
    const layout = resolve({ minColumnWidth: 100, gap: 8 });
    const children = kids(4, 100, 20);
    expect(contentExtent(layout, children, null)).toEqual({ width: 100, height: 80 });
    expect(contentExtent(layout, children, 400)).toEqual({ width: 316, height: 40 });
  });

  it('horizontal grid hugs n × the tallest and the columns', () => {
    const layout = resolve({ rows: 2, gap: 8, lineGap: 2 });
    const children = [kid(30, 40), kid(20, 10), kid(50, 20)];
    expect(contentExtent(layout, children, null)).toEqual({ width: 82, height: 88 });
  });
});

// --- layoutScreen: screen without geometry with a grid slot --------------------------------------

function comp(id: string, template: object, extra: object = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id,
    name: id,
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, ...template },
    ...extra,
  } as ComponentFile;
}

/** Library with `fixed` (100×40), `filler` (fill × fill) and `grid` (grid slot with the given layout). */
function gridLibrary(slotLayout: Record<string, unknown>): Library {
  const components = [
    comp('fixed', {}),
    comp('small', {}, { size: { width: 30, height: 10 } }),
    comp('filler', {}, { sizing: { width: 'fill', height: 'fill' } }),
    comp(
      'grid',
      {
        children: [
          {
            type: 'slot',
            anchors: { left: 0, right: 0, top: 0, bottom: 0 },
            // Goes through the parser as `row`; the grid comes in afterwards.
            layout: { type: 'row' },
          },
        ],
      },
      { sizing: { width: 'fill', height: 'hug' } },
    ),
  ];
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'grid-test',
    name: 'Grid',
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: components.map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  };
  const loaded = loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    ...components.map((c) => ({
      path: `components/${c.id}.json`,
      text: JSON.stringify(c),
    })),
  ]);
  const types = loaded.types.map((type) => {
    const component = type.component;
    if (type.id !== 'grid' || component === undefined) return type;
    const template = component.template as unknown as { children: object[] };
    const slot = template.children[0] as { layout: object };
    return {
      ...type,
      component: {
        ...component,
        template: { ...template, children: [{ ...slot, layout: slotLayout }] },
      } as unknown as ComponentFile,
    };
  });
  return { ...loaded, types };
}

const node = (id: string, typeId: string, children: LayoutNode[] = []): LayoutNode => ({
  id,
  typeId,
  values: {},
  children,
});

function run(slotLayout: Record<string, unknown>, children: LayoutNode[], width = 320) {
  const result = layoutScreen(
    {
      id: 's',
      name: 'Screen',
      width,
      height: 600,
      background: '#FFF',
      roots: [{ node: node('g', 'grid', children) }],
    },
    gridLibrary(slotLayout),
    approximateMeasurer,
  );
  const at = (id: string) => {
    const found = result.screen.instances.find((i) => i.id === id);
    if (!found) throw new Error(`no instance ${id}`);
    return found.box;
  };
  return { result, at };
}

describe('layoutScreen with a grid slot', () => {
  it('arranges the screen without geometry in 3 columns', () => {
    const { result, at } = run(
      { type: 'grid', columns: 3, gap: 10, lineGap: 4 },
      [1, 2, 3, 4, 5].map((n) => node(`k${n}`, 'fixed')),
    );
    expect(result.warnings).toEqual([]);
    // track: (320 - 20) / 3 = 100; step 110; lines of 40 + 4.
    expect(at('k1')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(at('k3')).toEqual({ x: 220, y: 0, width: 100, height: 40 });
    expect(at('k4')).toEqual({ x: 0, y: 44, width: 100, height: 40 });
    expect(at('k5')).toEqual({ x: 110, y: 44, width: 100, height: 40 });
    // the `hug` container in height hugs the two lines
    expect(at('g')).toEqual({ x: 0, y: 0, width: 320, height: 84 });
  });

  it('a fill child takes the cell and the line; reverse and justify apply', () => {
    const { at } = run({ type: 'grid', columns: 2, reverse: true, justify: 'end' }, [
      node('a', 'small'),
      node('f', 'filler'),
      node('b', 'fixed'),
    ]);
    // reversed order: b, f on the first line; a alone on the second.
    expect(at('b')).toEqual({ x: 60, y: 0, width: 100, height: 40 });
    expect(at('f')).toEqual({ x: 160, y: 0, width: 160, height: 40 });
    expect(at('a')).toEqual({ x: 130, y: 40, width: 30, height: 10 });
  });

  it('horizontal grid (rows) fills columns', () => {
    const { at } = run({ type: 'grid', rows: 2, gap: 5 }, [
      node('a', 'small'),
      node('b', 'small'),
      node('c', 'small'),
    ]);
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('b')).toMatchObject({ x: 0, y: 15 });
    expect(at('c')).toMatchObject({ x: 30, y: 0 });
  });
});

describe('layoutScreen with a track list in the grid slot (DX6)', () => {
  it('the screen without geometry puts each child in its track', () => {
    const { result, at } = run(
      { type: 'grid', columns: [50, '1fr', 'hug'], gap: 10, justify: 'stretch' },
      [1, 2, 3, 4].map((n) => node(`k${n}`, n % 3 === 0 ? 'small' : 'fixed')),
    );
    expect(result.warnings).toEqual([]);
    // hug = 30 (`small`); fr = 320 − 50 − 30 − 20 = 220; starts 0, 60, 290.
    expect(at('k1')).toMatchObject({ x: 0, y: 0 });
    expect(at('k2')).toMatchObject({ x: 60, y: 0 });
    expect(at('k3')).toMatchObject({ x: 290, y: 0, width: 30 });
    expect(at('k4')).toMatchObject({ x: 0, y: 40 });
  });

  it('a stretched child fills its cell', () => {
    const { at } = run(
      { type: 'grid', columns: [50, '1fr'], gap: 10, justify: 'stretch' },
      [node('a', 'filler'), node('b', 'filler')],
    );
    expect(at('a')).toMatchObject({ x: 0, width: 50 });
    expect(at('b')).toMatchObject({ x: 60, width: 260 });
  });

  it('rows as a list in the horizontal grid', () => {
    const { at } = run({ type: 'grid', rows: [20, '1fr'], gap: 5 }, [
      node('a', 'small'),
      node('b', 'small'),
      node('c', 'small'),
    ]);
    expect(at('a')).toMatchObject({ x: 0, y: 0 });
    expect(at('b')).toMatchObject({ x: 0, y: 25 });
    expect(at('c')).toMatchObject({ x: 30, y: 0 });
  });
});

describe('layoutScreen with an aligned none slot (L5)', () => {
  const small = () => [node('a', 'small')];

  it('without align and justify the child stays at the corner (as always)', () => {
    const { at } = run({ type: 'none' }, small());
    expect(at('a')).toEqual({ x: 0, y: 0, width: 30, height: 10 });
  });

  it('justify puts the child in the middle, at the end or stretches it to the content width', () => {
    expect(run({ type: 'none', justify: 'center' }, small()).at('a')).toMatchObject({
      x: 145,
      width: 30,
    });
    expect(run({ type: 'none', justify: 'end' }, small()).at('a')).toMatchObject({
      x: 290,
    });
    expect(run({ type: 'none', justify: 'stretch' }, small()).at('a')).toMatchObject({
      x: 0,
      width: 320,
    });
  });

  it('the children overlap, each one aligned on its own', () => {
    const { at } = run({ type: 'none', justify: 'end' }, [
      node('a', 'small'),
      node('b', 'fixed'),
    ]);
    expect(at('a').x).toBe(290);
    expect(at('b').x).toBe(220);
  });
});
