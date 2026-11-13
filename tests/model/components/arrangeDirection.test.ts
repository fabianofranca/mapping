// R1 (#1096): a arrumação dos filhos de um slot na app aceita a direção (padrão ltr) e espelha no
// eixo horizontal dentro da área de conteúdo (o padding segue físico; reverse compõe com rtl).
import { describe, expect, it } from 'vitest';
import {
  dropIndex,
  layoutChildren,
  type ResolvedSlotLayout,
} from '../../../src/model/components/arrange';
import type { Screen } from '../../../src/model/components/screen';

const slot = { x: 0, y: 0, width: 100, height: 100 };
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
const xs = (over: Partial<ResolvedSlotLayout>, direction?: 'ltr' | 'rtl') =>
  layoutChildren(slot, layout(over), kids, direction).map((b) => b.x);

describe('layoutChildren com direção', () => {
  it('ltr explícito é igual ao padrão', () => {
    expect(xs({ gap: 4 }, 'ltr')).toEqual(xs({ gap: 4 }));
  });

  it('row em rtl corre da direita para a esquerda', () => {
    expect(xs({}, 'ltr')).toEqual([0, 10, 30]);
    expect(xs({}, 'rtl')).toEqual([90, 70, 40]);
    expect(xs({ gap: 4 }, 'rtl')).toEqual([90, 66, 32]);
  });

  it('justify start/end são lógicos; center não muda', () => {
    expect(xs({ justify: 'end' }, 'rtl')).toEqual([50, 30, 0]);
    expect(xs({ justify: 'center' }, 'ltr')).toEqual([20, 30, 50]);
    expect(xs({ justify: 'center' }, 'rtl')).toEqual([70, 50, 20]);
  });

  it('reverse compõe com rtl: volta à ordem física de ltr', () => {
    expect(xs({ reverse: true }, 'rtl')).toEqual(xs({}, 'ltr'));
    expect(xs({ reverse: true }, 'ltr')).toEqual(xs({}, 'rtl'));
  });

  it('o padding continua físico', () => {
    const padding = { top: 0, right: 5, bottom: 0, left: 15 };
    // conteúdo de 15 a 95: o primeiro (10) termina em 95
    expect(xs({ padding }, 'rtl')).toEqual([85, 65, 35]);
    expect(xs({ padding }, 'ltr')).toEqual([15, 25, 45]);
  });

  it('column: align start/end e stretch viram lógicos no eixo cruzado', () => {
    const col = (align: ResolvedSlotLayout['align'], direction: 'ltr' | 'rtl') =>
      layoutChildren(slot, layout({ type: 'column', align }), kids, direction).map(
        (b) => [b.x, b.width],
      );
    expect(col('start', 'rtl')).toEqual([
      [90, 10],
      [80, 20],
      [70, 30],
    ]);
    expect(col('end', 'rtl')).toEqual([
      [0, 10],
      [0, 20],
      [0, 30],
    ]);
    expect(col('stretch', 'rtl').map(([, w]) => w)).toEqual([100, 100, 100]);
  });

  it('wrap: cada linha espelha', () => {
    const wrapped = layout({ wrap: 'wrap' });
    const out = layoutChildren({ ...slot, width: 40 }, wrapped, kids, 'rtl');
    // linhas: [10,20] e [30]
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [30, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('grade: as colunas espelham', () => {
    const grid = layout({
      type: 'grid',
      grid: { count: 2, orientation: 'vertical' },
    } as unknown as Partial<ResolvedSlotLayout>);
    const ltr = layoutChildren(slot, grid, kids).map((b) => b.x);
    const rtl = layoutChildren(slot, grid, kids, 'rtl').map((b) => b.x);
    expect(ltr).not.toEqual(rtl);
    expect(rtl[0]).toBe(100 - ltr[0]! - 10);
  });

  it('none alinhado: justify start vai para a direita', () => {
    const none = layout({ type: 'none', justify: 'start' });
    expect(layoutChildren(slot, none, kids, 'rtl').map((b) => b.x)).toEqual([90, 80, 70]);
    expect(layoutChildren(slot, none, kids, 'ltr').map((b) => b.x)).toEqual([0, 0, 0]);
  });
});

describe('dropIndex com direção', () => {
  const screen = {
    id: 's',
    name: 'S',
    width: 100,
    height: 100,
    background: '#fff',
    instances: [
      { id: 'p', typeId: 't', values: {}, box: slot },
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

  it('em rtl a linha corre para a esquerda: antes do ponto são os irmãos à direita dele', () => {
    expect(dropIndex(screen, 'p', layout({}), { x: 95, y: 0 }, undefined, 'rtl')).toBe(0);
    expect(dropIndex(screen, 'p', layout({}), { x: 5, y: 0 }, undefined, 'rtl')).toBe(2);
    expect(dropIndex(screen, 'p', layout({}), { x: 5, y: 0 })).toBe(0);
  });

  it('reverse compõe com rtl', () => {
    expect(
      dropIndex(screen, 'p', layout({ reverse: true }), { x: 5, y: 0 }, undefined, 'rtl'),
    ).toBe(0);
  });
});

describe('arrange com direção', () => {
  it('repassa a direção: rtl espelha a row na caixa do container; o padrão é ltr', async () => {
    // Reusa o cenário de arrange.test.ts em miniatura: container row-start com 3 filhas.
    const { arrange } = await import('../../../src/model/components/arrange');
    const { approximateMeasurer } =
      await import('../../../src/model/components/instantiate');
    const { loadLibrary } = await import('../../../src/model/components/library');
    const comp = (id: string, template: unknown) =>
      JSON.stringify({
        format: 'mapping-component',
        formatVersion: 1,
        id,
        name: id,
        size: { width: 100, height: 40 },
        template,
      });
    const spec = {
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'm',
      name: 'M',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          annotationTypes: [
            { id: 'row', name: 'Row', component: 'components/row.json', fields: [] },
            { id: 'leaf', name: 'Leaf', component: 'components/leaf.json', fields: [] },
          ],
        },
      ],
    };
    const library = loadLibrary([
      { path: 'spec.json', text: JSON.stringify(spec) },
      {
        path: 'components/row.json',
        text: comp('row', {
          type: 'frame',
          name: 'row',
          layout: { type: 'none' },
          children: [{ type: 'slot', name: 's', layout: { type: 'row' } }],
        }),
      },
      {
        path: 'components/leaf.json',
        text: comp('leaf', { type: 'frame', name: 'leaf', layout: { type: 'none' } }),
      },
    ]);
    const leaf = (id: string, width: number) => ({
      id,
      typeId: 'leaf',
      values: {},
      parentId: 'p',
      box: { x: 0, y: 0, width, height: 10 },
    });
    const screen = {
      id: 's',
      name: 'S',
      width: 400,
      height: 100,
      background: '#fff',
      instances: [
        {
          id: 'p',
          typeId: 'row',
          values: {},
          box: { x: 0, y: 0, width: 200, height: 40 },
        },
        leaf('a', 20),
        leaf('b', 30),
      ],
    } as unknown as Screen;
    const xsOf = (s: Screen) => s.instances.filter((i) => i.parentId).map((i) => i.box.x);
    expect(library.problems).toEqual([]);
    expect(xsOf(arrange(screen, library, approximateMeasurer))).toEqual([0, 20]);
    expect(xsOf(arrange(screen, library, approximateMeasurer, 'ltr'))).toEqual([0, 20]);
    expect(xsOf(arrange(screen, library, approximateMeasurer, 'rtl'))).toEqual([
      180, 150,
    ]);
  });

  it('rtl: a caixa do slot também é a da direção (slot ao lado de um rect), não a de ltr', async () => {
    const { arrange } = await import('../../../src/model/components/arrange');
    const { approximateMeasurer } =
      await import('../../../src/model/components/instantiate');
    const { loadLibrary } = await import('../../../src/model/components/library');
    const comp = (id: string, template: unknown) =>
      JSON.stringify({
        format: 'mapping-component',
        formatVersion: 1,
        id,
        name: id,
        size: { width: 200, height: 40 },
        template,
      });
    const spec = {
      format: 'mapping-spec',
      formatVersion: 4,
      id: 'm',
      name: 'M',
      version: 1,
      layers: [
        {
          id: 'l',
          name: 'L',
          annotationTypes: [
            { id: 'row', name: 'Row', component: 'components/row.json', fields: [] },
            { id: 'leaf', name: 'Leaf', component: 'components/leaf.json', fields: [] },
          ],
        },
      ],
    };
    const library = loadLibrary([
      { path: 'spec.json', text: JSON.stringify(spec) },
      {
        path: 'components/row.json',
        text: comp('row', {
          type: 'frame',
          name: 'row',
          layout: { type: 'row' },
          children: [
            { type: 'rect', name: 'r', width: 40, height: 40 },
            { type: 'slot', name: 's', width: 'fill', layout: { type: 'row' } },
          ],
        }),
      },
      {
        path: 'components/leaf.json',
        text: comp('leaf', { type: 'frame', name: 'leaf', layout: { type: 'none' } }),
      },
    ]);
    const leaf = (id: string, width: number) => ({
      id,
      typeId: 'leaf',
      values: {},
      parentId: 'p',
      box: { x: 0, y: 0, width, height: 10 },
    });
    const screen = {
      id: 's',
      name: 'S',
      width: 400,
      height: 100,
      background: '#fff',
      instances: [
        {
          id: 'p',
          typeId: 'row',
          values: {},
          box: { x: 0, y: 0, width: 200, height: 40 },
        },
        leaf('a', 20),
        leaf('b', 30),
      ],
    } as unknown as Screen;
    const xsOf = (s: Screen) => s.instances.filter((i) => i.parentId).map((i) => i.box.x);
    expect(library.problems).toEqual([]);
    // rtl: o rect de 40 fica à direita (160..200); o slot ocupa 0..160 e as filhas espelham nele.
    expect(xsOf(arrange(screen, library, approximateMeasurer, 'rtl'))).toEqual([
      140, 110,
    ]);
  });
});
