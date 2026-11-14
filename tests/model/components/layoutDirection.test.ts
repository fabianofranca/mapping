// R1 (#1106, decision 5 of #1096): screens without geometry in `rtl`. `ScreenAnchor` (`LayoutAnchor`)
// `start`/`end` are logical; the roots in flow, the `row`/`column`/`grid`/`none` slots and
// `wrap` mirror inside the content; `ltr` does not change.
import { describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import {
  type LayoutAnchor,
  type LayoutNode,
  type LayoutRoot,
  layoutScreen,
} from '../../../src/model/components/layout';
import { loadLibrary } from '../../../src/model/components/library';

function component(
  id: string,
  template: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, ...template },
    ...extra,
  } as ComponentFile;
}

const block = (id: string, width: number, height = 20) =>
  component(id, {}, { size: { width, height } });

function container(id: string, layout: Record<string, unknown>) {
  return component(
    id,
    {
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout,
        },
      ],
    },
    { size: { width: 300, height: 120 }, sizing: { width: 'fill', height: 120 } },
  );
}

const COMPONENTS: ComponentFile[] = [
  block('a', 40),
  block('b', 60),
  block('c', 80),
  container('row', { type: 'row', gap: 10, padding: [0, 8, 0, 30] }),
  container('row-rev', { type: 'row', gap: 10, reverse: true }),
  container('col', { type: 'column', align: 'start' }),
  container('grid', { type: 'grid', columns: 2, gap: 10 }),
  container('none', { type: 'none', justify: 'start' }),
  container('wrap', { type: 'row', wrap: 'wrap', gap: 10, lineGap: 4 }),
];

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: 'layout-dir',
  name: 'Layout',
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#1E88E5',
      annotationTypes: COMPONENTS.map((c) => ({
        id: c.id,
        name: c.id,
        component: `components/${c.id}.json`,
        fields: [],
      })),
    },
  ],
};

const library = loadLibrary([
  { path: 'spec.json', text: JSON.stringify(SPEC) },
  ...COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c),
  })),
]);

const W = 300;

function run(
  roots: readonly LayoutRoot[],
  direction: 'ltr' | 'rtl' | undefined,
  width = W,
) {
  return layoutScreen(
    {
      id: 's',
      name: 'Screen',
      width,
      height: 600,
      background: '#FFF',
      roots,
      ...(direction === undefined ? {} : { direction }),
    },
    library,
    approximateMeasurer,
  );
}

const node = (
  id: string,
  typeId: string,
  children: readonly LayoutNode[] = [],
): LayoutNode => ({ id, typeId, values: {}, children });

function boxOf(result: ReturnType<typeof run>, id: string) {
  const instance = result.screen.instances.find((i) => i.id === id);
  if (!instance) throw new Error(`no instance ${id}`);
  return instance.box;
}

it('the test library loads without problems', () => {
  expect(library.problems).toEqual([]);
});

describe('layoutScreen in rtl: logical ScreenAnchor', () => {
  const anchored = (anchor: LayoutAnchor, direction: 'ltr' | 'rtl', margin = 16) =>
    run([{ node: node('x', 'a'), anchor, margin }], direction);

  it('top-start in rtl is on the right; in ltr, on the left', () => {
    expect(boxOf(anchored('top-start', 'ltr'), 'x')).toMatchObject({ x: 16, y: 16 });
    expect(boxOf(anchored('top-start', 'rtl'), 'x')).toMatchObject({
      x: W - 16 - 40,
      y: 16,
    });
  });

  it.each<LayoutAnchor>([
    'top-start',
    'top-end',
    'start',
    'end',
    'bottom-start',
    'bottom-end',
  ])(
    '%s: start and end swap sides in rtl, the vertical axis does not change',
    (anchor) => {
      const ltr = boxOf(anchored(anchor, 'ltr'), 'x');
      const rtl = boxOf(anchored(anchor, 'rtl'), 'x');
      expect(rtl.x).toBeCloseTo(W - ltr.x - ltr.width, 6);
      expect(rtl.y).toBe(ltr.y);
    },
  );

  it('top, center and bottom (without start/end) are the same in both directions', () => {
    for (const anchor of ['top', 'center', 'bottom'] as const)
      expect(boxOf(anchored(anchor, 'rtl'), 'x')).toEqual(
        boxOf(anchored(anchor, 'ltr'), 'x'),
      );
  });
});

describe('layoutScreen in rtl: the slots mirror inside the content', () => {
  const kids = () => [node('k1', 'a'), node('k2', 'b'), node('k3', 'c')];

  /** Each child x' = screen width − x − w (the `fill` container takes the screen). */
  function expectMirrored(typeId: string, ids: string[]): void {
    const roots = [{ node: node('h', typeId, kids()) }];
    const ltr = run(roots, 'ltr');
    const rtl = run(roots, 'rtl');
    for (const id of ids) {
      const a = boxOf(ltr, id);
      const b = boxOf(rtl, id);
      expect(b.x, `${id}.x`).toBeCloseTo(W - a.x - a.width, 6);
      expect(b.y, `${id}.y`).toBe(a.y);
      expect(b.width, `${id}.width`).toBe(a.width);
    }
  }

  it('row: the first child on the right; the padding stays physical', () => {
    const roots = [{ node: node('h', 'row', kids()) }];
    const ltr = run(roots, 'ltr');
    const rtl = run(roots, 'rtl');
    // padding [top, right, bottom, left] = [0, 8, 0, 30]
    expect(boxOf(ltr, 'k1').x).toBe(30);
    expect(boxOf(rtl, 'k1').x).toBe(W - 8 - 40);
    expect(boxOf(rtl, 'k1').x).toBeGreaterThan(boxOf(rtl, 'k2').x);
  });

  it('row with reverse composes with rtl (back to left-to-right order)', () => {
    const roots = [{ node: node('h', 'row-rev', kids()) }];
    const rtl = run(roots, 'rtl');
    expect(boxOf(rtl, 'k1').x).toBeLessThan(boxOf(rtl, 'k2').x);
  });

  it('column align start, grid, aligned none and wrap mirror', () => {
    expectMirrored('col', ['k1', 'k2', 'k3']);
    expectMirrored('grid', ['k1', 'k2', 'k3']);
    expectMirrored('none', ['k1', 'k2', 'k3']);
    expectMirrored('wrap', ['k1', 'k2', 'k3']);
  });

  it('roots in flow (the screen is a column, align start) are on the right in rtl', () => {
    const roots = [{ node: node('f', 'a') }];
    expect(boxOf(run(roots, 'ltr'), 'f').x).toBe(0);
    expect(boxOf(run(roots, 'rtl'), 'f').x).toBe(W - 40);
  });

  it('the computed Screen carries the rtl direction; in ltr (or without direction) it does not get the key', () => {
    const roots = [{ node: node('h', 'row', kids()) }];
    expect(run(roots, 'rtl').screen.direction).toBe('rtl');
    expect(run(roots, 'ltr').screen).not.toHaveProperty('direction');
    expect(run(roots, undefined).screen).not.toHaveProperty('direction');
  });

  it('without direction the screen is the ltr one', () => {
    const roots = [{ node: node('h', 'row', kids()) }];
    expect(JSON.stringify(run(roots, undefined).screen)).toBe(
      JSON.stringify(run(roots, 'ltr').screen),
    );
  });
});
