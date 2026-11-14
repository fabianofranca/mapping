// L5 (#1101, decisions 24 and 25 of #1078): what Material 3 needs from the engine to adopt the new layout.
//  - the `none` slot with `align`/`justify` positions the children in Arrange (the `Box(contentAlignment)`);
//  - `columns` and `minColumnWidth` coexist by expression and the first one with a value applies (the
//    `GridCells.Fixed` or the `GridCells.Adaptive` chosen by a field).
import { describe, expect, it } from 'vitest';
import {
  contentExtent,
  layoutChildren,
  resolveSlotLayout,
} from '../../../src/model/components/arrange';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { SlotTemplate } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { absoluteBoxes, walk } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

const slotOf = (layout: Record<string, unknown>): SlotTemplate =>
  ({ type: 'slot', layout }) as unknown as SlotTemplate;
const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const kid = (width: number, height: number) => ({ box: box(7, 9, width, height) });

describe('aligned none slot: resolveSlotLayout and layoutChildren', () => {
  it('reads align and justify of none; without them, start and start (nothing changes)', () => {
    const plain = resolveSlotLayout(slotOf({ type: 'none' }), {});
    expect([plain.type, plain.align, plain.justify]).toEqual(['none', 'start', 'start']);
    const aligned = resolveSlotLayout(
      slotOf({ type: 'none', align: 'end', justify: { $field: 'j' } }),
      { j: 'center' },
    );
    expect([aligned.type, aligned.align, aligned.justify]).toEqual([
      'none',
      'end',
      'center',
    ]);
    // A value outside the none set falls back to start.
    expect(resolveSlotLayout(slotOf({ type: 'none', align: 'baseline' }), {}).align).toBe(
      'start',
    );
  });

  const slot = box(20, 30, 200, 120);
  const place = (align: string, justify: string, w = 100, h = 40) =>
    layoutChildren(
      slot,
      resolveSlotLayout(slotOf({ type: 'none', align, justify }), {}),
      [kid(w, h)],
    )[0];

  it('puts the child at the nine points: justify horizontal, align vertical', () => {
    // x: start 20, center 70, end 120; y: start 30, center 70, end 110.
    expect(place('start', 'start')).toEqual(box(20, 30, 100, 40));
    expect(place('center', 'center')).toEqual(box(70, 70, 100, 40));
    expect(place('end', 'end')).toEqual(box(120, 110, 100, 40));
    expect(place('start', 'center')).toEqual(box(70, 30, 100, 40));
    expect(place('end', 'start')).toEqual(box(20, 110, 100, 40));
  });

  it('stretch fills the whole axis and keeps the other', () => {
    expect(place('stretch', 'center')).toEqual(box(70, 30, 100, 120));
    expect(place('center', 'stretch')).toEqual(box(20, 70, 200, 40));
  });

  it('the children overlap: each one is placed on its own', () => {
    const layout = resolveSlotLayout(
      slotOf({ type: 'none', align: 'center', justify: 'center' }),
      {},
    );
    const out = layoutChildren(slot, layout, [kid(100, 40), kid(60, 20)]);
    expect(out).toEqual([box(70, 70, 100, 40), box(90, 80, 60, 20)]);
  });

  it('the hug of the none slot is the largest, not the sum (the children overlap)', () => {
    const layout = resolveSlotLayout(slotOf({ type: 'none', align: 'center' }), {});
    expect(contentExtent(layout, [kid(100, 40), kid(60, 20)], null)).toEqual({
      width: 100,
      height: 40,
    });
  });
});

describe('grid tracks by expression: the first one with a value', () => {
  const both = (columns: unknown, min: unknown, values = {}) =>
    resolveSlotLayout(slotOf({ type: 'grid', columns, minColumnWidth: min }), values)
      .grid;

  it('given columns wins; without it minColumnWidth applies', () => {
    const cols = {
      $if: { $not: { $has: 'min' } },
      then: { $field: 'columns', default: 2 },
    };
    const min = { $field: 'min' };
    expect(both(cols, min, { min: null, columns: 3 })).toEqual({
      count: 3,
      orientation: 'vertical',
    });
    expect(both(cols, min, { min: 120, columns: 3 })).toEqual({
      min: 120,
      orientation: 'vertical',
    });
  });

  it('a present but invalid value does not pass to the next key (falls back to 1 column)', () => {
    expect(
      both({ $field: 'columns' }, { $field: 'min' }, { columns: 0, min: 120 }),
    ).toEqual({ count: 1, orientation: 'vertical' });
  });

  it('no key with a value: one column', () => {
    expect(both({ $field: 'a' }, { $field: 'b' })).toEqual({
      count: 1,
      orientation: 'vertical',
    });
  });
});

function gridComponent(layout: Json, version = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 300, height: 100 },
    template: {
      type: 'frame',
      width: 'fill',
      height: 'fill',
      layout,
      children: Array.from({ length: 5 }, (_, i) => ({
        type: 'rect',
        name: `k${i}`,
        width: 'fill',
        height: 20,
      })),
    },
  };
}

describe('validation: more than one track only when all are expressions', () => {
  const E = (name: string) => ({ $field: name });
  it('accepts columns and minColumnWidth by expression', () => {
    expect(
      validateComponent(
        gridComponent({ type: 'grid', columns: E('a'), minColumnWidth: E('b') }),
      ),
    ).toEqual([]);
  });
  it('several tracks only of the same orientation: columns with rows is an error', () => {
    const message =
      'template.layout: layout: give exactly one of columns, minColumnWidth, rows and minRowHeight';
    expect(
      validateComponent(gridComponent({ type: 'grid', columns: E('a'), rows: E('b') })),
    ).toEqual([message]);
    expect(
      validateComponent(
        gridComponent({ type: 'grid', rows: E('a'), minRowHeight: E('b') }),
      ),
    ).toEqual([]);
  });
  it('a literal track with another: still an error', () => {
    const message =
      'template.layout: layout: give exactly one of columns, minColumnWidth, rows and minRowHeight';
    expect(
      validateComponent(
        gridComponent({ type: 'grid', columns: 2, minColumnWidth: E('b') }),
      ),
    ).toEqual([message]);
    expect(
      validateComponent(gridComponent({ type: 'grid', columns: 2, minColumnWidth: 40 })),
    ).toEqual([message]);
  });
});

describe('instantiate: the track with a value decides in the frame', () => {
  const run = (values: Json) => {
    const component = gridComponent({
      type: 'grid',
      gap: 10,
      columns: {
        $if: { $not: { $has: 'min' } },
        then: { $field: 'columns', default: 2 },
      },
      minColumnWidth: { $field: 'min' },
    });
    const { root, warnings } = instantiate(
      component as never,
      values as never,
      box(0, 0, 300, 100),
      { measure: approximateMeasurer },
    );
    const boxes = absoluteBoxes(root);
    const xs = [...walk(root)]
      .filter((n) => n.name?.startsWith('k'))
      .map((n) => boxes.get(n.id)?.x ?? NaN);
    return { xs, warnings };
  };

  it('with columns 2: two columns of 145', () => {
    expect(run({ columns: 2, min: null })).toEqual({
      xs: [0, 155, 0, 155, 0],
      warnings: [],
    });
  });
  it('with minColumnWidth 90: floor((300 + 10) / 100) = 3 columns of 93.3', () => {
    const { xs, warnings } = run({ columns: 2, min: 90 });
    expect(warnings).toEqual([]);
    expect(xs.map((x) => Math.round(x))).toEqual([0, 103, 207, 0, 103]);
  });
});
