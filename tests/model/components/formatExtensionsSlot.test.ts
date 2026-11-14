// Format 4, "extensions" stage (FX3): justify space-around/space-evenly and layout.reverse in the slot
// (arrange.ts: layoutChildren and dropIndex) and in the screen arrangement (layout.ts: layoutScreen).
import { describe, expect, it } from 'vitest';
import {
  dropIndex,
  layoutChildren,
  type ResolvedSlotLayout,
  resolveSlotLayout,
} from '../../../src/model/components/arrange';
import type {
  ComponentFile,
  SlotTemplate,
} from '../../../src/model/components/componentFormat';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { layoutScreen } from '../../../src/model/components/layout';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';

const slotWith = (layout: Record<string, unknown>): SlotTemplate =>
  ({ type: 'slot', layout }) as unknown as SlotTemplate;

describe('resolveSlotLayout: justify and reverse', () => {
  it('reads space-around, space-evenly and reverse (literal and by field)', () => {
    expect(
      resolveSlotLayout(slotWith({ type: 'row', justify: 'space-around' }), {}),
    ).toMatchObject({ justify: 'space-around', reverse: false });
    expect(
      resolveSlotLayout(
        slotWith({ type: 'row', justify: 'space-evenly', reverse: true }),
        {},
      ),
    ).toMatchObject({ justify: 'space-evenly', reverse: true });
    const byField = slotWith({ type: 'column', reverse: { $field: 'rtl' } });
    expect(resolveSlotLayout(byField, { rtl: 'yes' }).reverse).toBe(true);
    expect(resolveSlotLayout(byField, { rtl: 'no' }).reverse).toBe(false);
  });

  it('type none ignores reverse', () => {
    expect(resolveSlotLayout(slotWith({ type: 'none' }), {}).reverse).toBe(false);
  });
});

const slotBox = { x: 0, y: 0, width: 100, height: 100 };
const kids = [10, 20, 30].map((w) => ({ box: { x: 0, y: 0, width: w, height: 10 } }));

function layout(over: Partial<ResolvedSlotLayout>): ResolvedSlotLayout {
  return {
    type: 'row',
    gap: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    align: 'start',
    justify: 'start',
    reverse: false,
    wrap: 'none',
    lineGap: 0,
    ...over,
  };
}

const xs = (over: Partial<ResolvedSlotLayout>) =>
  layoutChildren(slotBox, layout(over), kids).map((b) => b.x);

describe('layoutChildren (slot): justify and reverse', () => {
  it('space-around and space-evenly', () => {
    // free 40: around → 6.67 at the ends and 13.33 between; evenly → 10 in each gap
    expect(xs({ justify: 'space-evenly' })).toEqual([10, 30, 60]);
    expect(xs({ justify: 'space-around' })).toEqual([7, 30, 63]);
  });

  it('a single child: both center', () => {
    const one = [{ box: { x: 0, y: 0, width: 10, height: 10 } }];
    for (const justify of ['space-around', 'space-evenly'] as const)
      expect(layoutChildren(slotBox, layout({ justify }), one)[0]?.x).toBe(45);
  });

  it('reverse in row: the first child goes to the end', () => {
    expect(xs({ reverse: true })).toEqual([90, 70, 40]);
    expect(xs({ reverse: true, justify: 'end' })).toEqual([50, 30, 0]);
    expect(xs({ reverse: true, gap: 4 })).toEqual([90, 66, 32]);
    expect(xs({ reverse: true, justify: 'space-evenly' })).toEqual([80, 50, 10]);
  });

  it('reverse in column and with padding', () => {
    const tall = [10, 20, 30].map((h) => ({ box: { x: 0, y: 0, width: 10, height: h } }));
    const ys = layoutChildren(
      slotBox,
      layout({
        type: 'column',
        reverse: true,
        padding: { top: 5, right: 0, bottom: 5, left: 0 },
      }),
      tall,
    ).map((b) => b.y);
    // content from 5 to 95; the first (10) ends at 95
    expect(ys).toEqual([85, 65, 35]);
  });
});

describe('dropIndex with reverse', () => {
  const screen = {
    id: 's',
    name: 'S',
    width: 100,
    height: 100,
    background: '#fff',
    instances: [
      { id: 'p', typeId: 't', values: {}, box: slotBox },
      {
        id: 'a',
        typeId: 't',
        values: {},
        parentId: 'p',
        box: { x: 90, y: 0, width: 10, height: 10 },
      },
      {
        id: 'b',
        typeId: 't',
        values: {},
        parentId: 'p',
        box: { x: 60, y: 0, width: 20, height: 10 },
      },
    ],
  } as unknown as Screen;

  it('in reverse, the index counts the siblings whose center comes after the point', () => {
    expect(dropIndex(screen, 'p', layout({ reverse: true }), { x: 95, y: 0 })).toBe(0);
    expect(dropIndex(screen, 'p', layout({ reverse: true }), { x: 5, y: 0 })).toBe(2);
    expect(dropIndex(screen, 'p', layout({ reverse: true }), { x: 80, y: 0 })).toBe(1);
  });
});

// --- layoutScreen ------------------------------------------------------------------------------

function block(id: string, width: number, height: number): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width, height },
    template: { type: 'frame', layout: { type: 'none' }, children: [] },
  } as unknown as ComponentFile;
}

function containerOf(id: string, layoutSpec: Record<string, unknown>): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 100, height: 40 },
    sizing: { width: 'fill', height: 60 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'slot',
          anchors: { left: 0, right: 0, top: 0, bottom: 0 },
          layout: layoutSpec,
        },
      ],
    },
  } as unknown as ComponentFile;
}

const COMPONENTS = [
  block('b10', 10, 10),
  block('b20', 20, 10),
  block('b30', 30, 10),
  containerOf('row-rev', { type: 'row', reverse: true }),
  containerOf('row-rev-end', { type: 'row', reverse: true, justify: 'end' }),
  containerOf('row-evenly', { type: 'row', justify: 'space-evenly' }),
  containerOf('row-around', { type: 'row', justify: 'space-around' }),
];

const library = loadLibrary([
  {
    path: 'spec.json',
    text: JSON.stringify({
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'ext',
      name: 'Ext',
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
    }),
  },
  ...COMPONENTS.map((c) => ({
    path: `components/${c.id}.json`,
    text: JSON.stringify(c),
  })),
]);

function xsOf(type: string): number[] {
  const result = layoutScreen(
    {
      id: 's',
      name: 'Screen',
      width: 100,
      height: 200,
      background: '#FFF',
      roots: [
        {
          node: {
            id: 'c',
            typeId: type,
            values: {},
            children: ['b10', 'b20', 'b30'].map((t, i) => ({
              id: `k${i}`,
              typeId: t,
              values: {},
              children: [],
            })),
          },
        },
      ],
    },
    library,
    approximateMeasurer,
  );
  return ['k0', 'k1', 'k2'].map(
    (id) => result.screen.instances.find((i) => i.id === id)?.box.x ?? Number.NaN,
  );
}

describe('layoutScreen: justify and reverse', () => {
  it('the library loads without problems', () => {
    expect(library.problems).toEqual([]);
  });

  it('space-evenly and space-around', () => {
    expect(xsOf('row-evenly')).toEqual([10, 30, 60]);
    const around = xsOf('row-around');
    expect(around[0]).toBeCloseTo(20 / 3, 6);
    expect(around[1]).toBeCloseTo(20 / 3 + 10 + 40 / 3, 6);
  });

  it('reverse: the first child at the end; justify end becomes the start', () => {
    expect(xsOf('row-rev')).toEqual([90, 70, 40]);
    expect(xsOf('row-rev-end')).toEqual([50, 30, 0]);
  });
});
