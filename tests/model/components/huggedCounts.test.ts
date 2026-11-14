// CL1 (P2): the track count remembered from the `hug` measure (`huggedCounts`) only applies to the frame
// that hugs the content; in a `fill` grid the known size decides, even if it equals the total
// that an earlier measure (with another limit) gave to another count.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

const file = (template: Json): never =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 300, height: 100 },
    template,
  }) as never;

const rect = (name: string, w: number, h: number, extra: Json = {}): Json => ({
  type: 'rect',
  name,
  width: w,
  height: h,
  ...extra,
});

/**
 * A `minColumnWidth: 100` grid with A (span 3, 150 px), B and C (20 px): with 3 tracks and with 1 the
 * total is the same (150). The `hug` parent measures it first with the limit of 300 (3 tracks) and then
 * hands it over with 150, where only one track fits.
 */
function draw(gridWidth: 'fill' | 'hug') {
  const grid: Json = {
    type: 'frame',
    name: 'g',
    width: gridWidth,
    height: 'hug',
    layout: { type: 'grid', minColumnWidth: 100 },
    children: [rect('A', 150, 20, { span: 3 }), rect('B', 20, 20), rect('C', 20, 20)],
  };
  const wrapper: Json = {
    type: 'frame',
    name: 'wrap',
    width: 'hug',
    height: 'hug',
    layout: { type: 'column' },
    children: [grid, rect('wide', 150, 10)],
  };
  const template: Json = {
    type: 'frame',
    name: 'host',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row' },
    children: [gridWidth === 'fill' ? wrapper : grid],
  };
  const result = instantiate(
    file(template),
    {} as never,
    { x: 0, y: 0, width: 300, height: 100 },
    { measure: approximateMeasurer },
  );
  const boxes = absoluteBoxes(result.root);
  const at = (name: string) => {
    const node = [...walk(result.root)].find((n) => n.name === name);
    return boxes.get(node!.id)!;
  };
  return at;
}

describe('huggedCounts: the remembered count does not leak into the grid of a given size', () => {
  it('fill grid of 150 with minColumnWidth 100: one track, B and C stacked', () => {
    const at = draw('fill');
    expect(at('g').width).toBe(150);
    expect(at('B').x).toBe(at('C').x);
    expect(at('C').y).toBeGreaterThan(at('B').y);
  });

  it('hug grid: the measured count (3 tracks) applies in the final pass', () => {
    const at = draw('hug');
    expect(at('B').y).toBe(at('C').y);
    expect(at('C').x).toBeGreaterThan(at('B').x);
  });
});

/**
 * #1692: two limits (300 and 150) give the same total (150) with different counts (3 and 1 tracks).
 * The final pass reads the count by its own limit (150: one track), in both orders in which the parent
 * measures the `hug` grid.
 */
function drawHugged(
  order: 'natural-first' | 'narrow-first',
  wrapperWidth: number | 'hug' | 'max-content' | 'min-content' = 'hug',
  wrapperLayout: 'column' | 'row' = 'column',
) {
  const grid: Json = {
    type: 'frame',
    name: 'g',
    width: 'hug',
    height: 'hug',
    layout: { type: 'grid', minColumnWidth: 100 },
    children: [rect('A', 150, 20, { span: 3 }), rect('B', 20, 20), rect('C', 20, 20)],
  };
  const wide = rect('wide', 150, 10);
  const wrapper: Json = {
    type: 'frame',
    name: 'wrap',
    width: wrapperWidth,
    height: 'hug',
    layout: { type: wrapperLayout },
    // A `hug` parent measures the children in the order they come: the grid before or after the fixed child.
    children: order === 'natural-first' ? [grid, wide] : [wide, grid],
  };
  const template: Json = {
    type: 'frame',
    name: 'host',
    width: 'fill',
    height: 'fill',
    layout: { type: 'row' },
    children: [wrapper],
  };
  const result = instantiate(
    file(template),
    {} as never,
    { x: 0, y: 0, width: 300, height: 100 },
    { measure: approximateMeasurer },
  );
  const boxes = absoluteBoxes(result.root);
  return (name: string) =>
    boxes.get([...walk(result.root)].find((n) => n.name === name)!.id)!;
}

describe('huggedCounts: the total tie with different counts (#1692)', () => {
  const parents = ['hug'] as const;
  const cases = (['natural-first', 'narrow-first'] as const).flatMap((order) =>
    parents.map((parent) => [order, parent] as const),
  );
  for (const [order, parent] of cases) {
    it(`hug grid in a ${parent} parent (${order}): the final pass has 1 track, like the fill grid`, () => {
      const at = drawHugged(order, parent);
      expect(at('g').width).toBe(150);
      const fill = draw('fill');
      expect(at('B').x).toBe(at('C').x);
      expect(at('C').y).toBeGreaterThan(at('B').y);
      expect(at('B').x - at('g').x).toBe(fill('B').x - fill('g').x);
      expect(at('C').y - at('B').y).toBe(fill('C').y - fill('B').y);
    });
  }
});

/**
 * #1749: under a `max-content` or `min-content` parent the width is resolved before measuring the grid, and
 * the drawing is equal to that of the same wrapper in px, at the width the intrinsic parent resolved.
 */
describe('huggedCounts: hug grid under a max-content/min-content parent (#1749)', () => {
  const orders = ['natural-first', 'narrow-first'] as const;
  const parents = ['max-content', 'min-content'] as const;
  const layouts = ['column', 'row'] as const;
  for (const parent of parents) {
    for (const layout of layouts) {
      for (const order of orders) {
        it(`${parent} in ${layout} (${order}): equal to the px parent of the resolved width`, () => {
          const at = drawHugged(order, parent, layout);
          const resolved = at('wrap').width;
          const ref = drawHugged(order, resolved, layout);
          expect(at('g').width).toBe(ref('g').width);
          for (const name of ['A', 'B', 'C']) {
            expect(at(name).x - at('g').x).toBe(ref(name).x - ref('g').x);
            expect(at(name).y - at('g').y).toBe(ref(name).y - ref('g').y);
          }
        });
      }
    }
  }
});
