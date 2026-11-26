// Arrange `weight` (LG6, decision 10 of #2829): the weighted children of a row/column slot share the
// line's free main-axis space; each stays between its floor and its ceiling.
import { describe, expect, it } from 'vitest';
import {
  contentExtent,
  layoutChildren,
  type ResolvedSlotLayout,
} from '../../../src/model/components/arrange';
import type { Box } from '../../../src/model/components/instantiate';

const flow = (
  type: ResolvedSlotLayout['type'],
  extra: Partial<ResolvedSlotLayout> = {},
): ResolvedSlotLayout => ({
  type,
  gap: 8,
  padding: { top: 8, right: 8, bottom: 8, left: 8 },
  align: 'center',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
  ...extra,
});

const box = (x: number, y: number, width: number, height: number): Box => ({
  x,
  y,
  width,
  height,
});

const SLOT = box(0, 0, 300, 56);
const own = (width: number) => ({ box: box(0, 0, width, 40) });
const weighted = (
  weight: number,
  extra: { minMain?: number; maxMain?: number; width?: number } = {},
) => ({
  box: box(0, 0, extra.width ?? 40, 40),
  weight,
  minMain: extra.minMain ?? 24,
  ...(extra.maxMain === undefined ? {} : { maxMain: extra.maxMain }),
});
const widths = (boxes: readonly Box[]) => boxes.map((b) => b.width);
const xs = (boxes: readonly Box[]) => boxes.map((b) => b.x);

describe('layoutChildren: weight on the main axis', () => {
  it('the example: 40, weight 1 and weight 2 in a 300 slot share the slack by weight', () => {
    const out = layoutChildren(SLOT, flow('row'), [own(40), weighted(1), weighted(2)]);
    expect(widths(out)).toEqual([40, 76, 152]);
    expect(xs(out)).toEqual([8, 56, 140]);
    expect(out.map((b) => b.y)).toEqual([8, 8, 8]);
  });

  it('a column shares the height the same way', () => {
    const slot = box(0, 0, 100, 300);
    const out = layoutChildren(slot, flow('column'), [
      { box: box(0, 0, 40, 40) },
      { box: box(0, 0, 40, 40), weight: 1, minMain: 24 },
      { box: box(0, 0, 40, 40), weight: 2, minMain: 24 },
    ]);
    expect(out.map((b) => b.height)).toEqual([40, 76, 152]);
    expect(out.map((b) => b.y)).toEqual([8, 56, 140]);
  });

  it('a child without weight keeps its size; weights do not need a floor', () => {
    const out = layoutChildren(SLOT, flow('row'), [
      own(40),
      { box: box(0, 0, 40, 40), weight: 1 },
    ]);
    expect(widths(out)).toEqual([40, 236]);
  });

  it('the ceiling freezes a child and the rest goes to the other one', () => {
    const out = layoutChildren(SLOT, flow('row'), [
      own(40),
      weighted(1),
      weighted(2, { maxMain: 60 }),
    ]);
    expect(widths(out)).toEqual([40, 168, 60]);
    expect(xs(out)).toEqual([8, 56, 232]);
  });

  it('free space below the sum of the floors leaves each child at its floor', () => {
    const out = layoutChildren(box(0, 0, 100, 56), flow('row'), [
      own(40),
      weighted(1),
      weighted(2),
    ]);
    expect(widths(out)).toEqual([40, 24, 24]);
    expect(xs(out)).toEqual([8, 56, 88]);
  });

  it('a floor above the share freezes that child and redistributes the rest', () => {
    const out = layoutChildren(box(0, 0, 316, 56), flow('row'), [
      weighted(1, { minMain: 100 }),
      weighted(9, { minMain: 0 }),
    ]);
    // content 300 − 8 gap = 292: the weight-1 share is 29.2 < its floor 100 → frozen; the rest, 192.
    expect(widths(out)).toEqual([100, 192]);
  });

  it('space-between with a weighted child spreads nothing: the weighted child takes the slack', () => {
    const out = layoutChildren(SLOT, flow('row', { justify: 'space-between' }), [
      own(40),
      weighted(1),
    ]);
    expect(widths(out)).toEqual([40, 236]);
    expect(xs(out)).toEqual([8, 56]);
  });

  it('justify only gets what is left when every weighted child is frozen at its ceiling', () => {
    const out = layoutChildren(SLOT, flow('row', { justify: 'space-between' }), [
      own(40),
      weighted(1, { maxMain: 100 }),
    ]);
    expect(widths(out)).toEqual([40, 100]);
    expect(xs(out)).toEqual([8, 192]);
  });

  it('wrap breaks the lines at the floors and grows per line', () => {
    const out = layoutChildren(
      box(0, 0, 116, 100),
      flow('row', { wrap: 'wrap', align: 'start' }),
      [
        { box: box(0, 0, 50, 20) },
        { box: box(0, 0, 40, 20), weight: 1, minMain: 20 },
        { box: box(0, 0, 40, 20), weight: 1, minMain: 20 },
      ],
    );
    // content 100: 50 + 8 + 20 = 78 fits; +8 + 20 = 106 does not → the second weighted child wraps.
    expect(widths(out)).toEqual([50, 42, 100]);
    expect(xs(out)).toEqual([8, 66, 8]);
    expect(out.map((b) => b.y)).toEqual([8, 8, 28]);
  });

  it('reverse mirrors the grown line', () => {
    const out = layoutChildren(
      box(0, 0, 300, 40),
      flow('row', { reverse: true, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0 }),
      [own(40), { box: box(0, 0, 40, 40), weight: 1 }],
    );
    expect(widths(out)).toEqual([40, 260]);
    expect(xs(out)).toEqual([260, 0]);
  });

  it('rtl mirrors the grown line, and reverse composes with it', () => {
    const slot = box(0, 0, 300, 40);
    const layout = flow('row', {
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      gap: 0,
    });
    const kids = [own(40), { box: box(0, 0, 40, 40), weight: 1 }];
    const rtl = layoutChildren(slot, layout, kids, 'rtl');
    expect(widths(rtl)).toEqual([40, 260]);
    expect(xs(rtl)).toEqual([260, 0]);
    const both = layoutChildren(slot, { ...layout, reverse: true }, kids, 'rtl');
    expect(xs(both)).toEqual([0, 40]);
  });

  it('grid and none ignore the weight', () => {
    const kids = [
      { box: box(0, 0, 40, 20) },
      { box: box(0, 0, 40, 20), weight: 3, minMain: 10 },
    ];
    const bare = kids.map((k) => ({ box: k.box }));
    const grid = flow('grid', { grid: { count: 2, orientation: 'vertical' } });
    expect(layoutChildren(SLOT, grid, kids)).toEqual(layoutChildren(SLOT, grid, bare));
    const none = flow('none', { justify: 'start' });
    expect(layoutChildren(SLOT, none, kids)).toEqual(layoutChildren(SLOT, none, bare));
  });
});

describe('contentExtent: a weighted child counts at its floor', () => {
  it('row: the sum with the gaps uses the floor, not the box', () => {
    const extent = contentExtent(
      flow('row'),
      [own(40), { box: box(0, 0, 100, 40), weight: 1, minMain: 24 }],
      null,
    );
    expect(extent).toEqual({ width: 40 + 8 + 24, height: 40 });
  });

  it('a weighted child without a floor counts 0', () => {
    const extent = contentExtent(
      flow('row'),
      [own(40), { box: box(0, 0, 100, 40), weight: 1 }],
      null,
    );
    expect(extent.width).toBe(40 + 8);
  });

  it('column: the height uses the floor', () => {
    const extent = contentExtent(
      flow('column'),
      [{ box: box(0, 0, 40, 100), weight: 2, minMain: 30 }, { box: box(0, 0, 40, 10) }],
      null,
    );
    expect(extent).toEqual({ width: 40, height: 30 + 8 + 10 });
  });

  it('a child without weight keeps counting its box', () => {
    const extent = contentExtent(flow('row'), [own(40), own(100)], null);
    expect(extent.width).toBe(148);
  });
});
