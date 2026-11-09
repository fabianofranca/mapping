// Formato 4, etapa "extensões" (FX3): justify space-around/space-evenly e layout.reverse no slot
// (arrange.ts: layoutChildren e dropIndex) e na arrumação da tela (layout.ts: layoutScreen).
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

describe('resolveSlotLayout: justify e reverse', () => {
  it('lê space-around, space-evenly e reverse (literal e por campo)', () => {
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
    expect(resolveSlotLayout(byField, { rtl: 'sim' }).reverse).toBe(true);
    expect(resolveSlotLayout(byField, { rtl: 'não' }).reverse).toBe(false);
  });

  it('type none ignora reverse', () => {
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
    ...over,
  };
}

const xs = (over: Partial<ResolvedSlotLayout>) =>
  layoutChildren(slotBox, layout(over), kids).map((b) => b.x);

describe('layoutChildren (slot): justify e reverse', () => {
  it('space-around e space-evenly', () => {
    // livre 40: around → 6,67 nas pontas e 13,33 entre; evenly → 10 em cada vão
    expect(xs({ justify: 'space-evenly' })).toEqual([10, 30, 60]);
    expect(xs({ justify: 'space-around' })).toEqual([7, 30, 63]);
  });

  it('um filho só: os dois centram', () => {
    const one = [{ box: { x: 0, y: 0, width: 10, height: 10 } }];
    for (const justify of ['space-around', 'space-evenly'] as const)
      expect(layoutChildren(slotBox, layout({ justify }), one)[0]?.x).toBe(45);
  });

  it('reverse em row: o primeiro filho vai para o fim', () => {
    expect(xs({ reverse: true })).toEqual([90, 70, 40]);
    expect(xs({ reverse: true, justify: 'end' })).toEqual([50, 30, 0]);
    expect(xs({ reverse: true, gap: 4 })).toEqual([90, 66, 32]);
    expect(xs({ reverse: true, justify: 'space-evenly' })).toEqual([80, 50, 10]);
  });

  it('reverse em column e com padding', () => {
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
    // conteúdo de 5 a 95; o primeiro (10) termina em 95
    expect(ys).toEqual([85, 65, 35]);
  });
});

describe('dropIndex com reverse', () => {
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

  it('em reverse, o índice conta os irmãos cujo centro vem depois do ponto', () => {
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
      name: 'Tela',
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

describe('layoutScreen: justify e reverse', () => {
  it('a biblioteca carrega sem problemas', () => {
    expect(library.problems).toEqual([]);
  });

  it('space-evenly e space-around', () => {
    expect(xsOf('row-evenly')).toEqual([10, 30, 60]);
    const around = xsOf('row-around');
    expect(around[0]).toBeCloseTo(20 / 3, 6);
    expect(around[1]).toBeCloseTo(20 / 3 + 10 + 40 / 3, 6);
  });

  it('reverse: o primeiro filho no fim; justify end vira o começo', () => {
    expect(xsOf('row-rev')).toEqual([90, 70, 40]);
    expect(xsOf('row-rev-end')).toEqual([50, 30, 0]);
  });
});
