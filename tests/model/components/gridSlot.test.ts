// Slot em grade (`layout.type: "grid"`, decisão 15 da #1078): resolveSlotLayout, layoutChildren,
// contentExtent e a tela sem geometria (layoutScreen) com slot `grid`.
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

describe('resolveSlotLayout com grid', () => {
  it('lê columns, minColumnWidth, rows e minRowHeight', () => {
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

  it('valor inválido por expressão cai em uma trilha', () => {
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

  it('sem nenhuma trilha vale columns: 1', () => {
    expect(resolve({}).grid).toEqual({ count: 1, orientation: 'vertical' });
  });

  it('lineGap vale sem wrap; align e justify aceitam só start, center, end e stretch', () => {
    const l = resolve({ columns: 2, gap: 8, lineGap: 4, align: 'stretch' });
    expect(l).toMatchObject({ gap: 8, lineGap: 4, wrap: 'none', align: 'stretch' });
    expect(resolve({ columns: 2, align: 'baseline' }).align).toBe('start');
    expect(resolve({ columns: 2, justify: 'space-between' }).justify).toBe('start');
    expect(resolve({ columns: 2, justify: 'stretch' }).justify).toBe('stretch');
  });
});

describe('layoutChildren em grade', () => {
  const slot = box(10, 20, 400, 300);

  it('3 colunas, 7 filhas iguais: células arredondadas', () => {
    const layout = resolve({ columns: 3, gap: 8, lineGap: 4 });
    const out = layoutChildren(slot, layout, kids(7));
    // trilha: (400 - 16) / 3 = 128; passo 136.
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

  it('arredonda posições fracionárias', () => {
    const layout = resolve({ columns: 3 });
    const out = layoutChildren(box(0, 0, 100, 100), layout, kids(3, 10, 10));
    // 100 / 3 = 33,33...; passos 33,33 e 66,67
    expect(out.map((b) => b.x)).toEqual([0, 33, 67]);
  });

  it('minColumnWidth com o slot de 400 e gap 8 dá 3 colunas', () => {
    const layout = resolve({ minColumnWidth: 100, gap: 8 });
    const out = layoutChildren(slot, layout, kids(4));
    expect(out.map((b) => b.x)).toEqual([10, 146, 282, 10]);
    expect(out[3]?.y).toBe(50);
  });

  it('rows: 2 preenche colunas, de cima para baixo', () => {
    const layout = resolve({ rows: 2, gap: 8, lineGap: 6 });
    const out = layoutChildren(box(0, 0, 400, 200), layout, kids(5));
    // trilha (linha): (200 - 8) / 2 = 96, passo 104; colunas de 50 + 6.
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [0, 0],
      [0, 104],
      [56, 0],
      [56, 104],
      [112, 0],
    ]);
  });

  it('justify alinha na célula (eixo das trilhas)', () => {
    const base = { columns: 3, gap: 8 };
    const x = (justify: string) =>
      layoutChildren(slot, resolve({ ...base, justify }), kids(1))[0];
    expect(x('center')?.x).toBe(10 + 39);
    expect(x('end')?.x).toBe(10 + 78);
    expect(x('stretch')).toMatchObject({ x: 10, width: 128 });
  });

  it('align alinha na linha de fluxo (a extensão da maior filha)', () => {
    const children = [kid(50, 30), kid(50, 10)];
    const at = (align: string) =>
      layoutChildren(slot, resolve({ columns: 2, align }), children)[1];
    expect(at('start')).toMatchObject({ y: 20, height: 10 });
    expect(at('center')).toMatchObject({ y: 30, height: 10 });
    expect(at('end')).toMatchObject({ y: 40, height: 10 });
    expect(at('stretch')).toMatchObject({ y: 20, height: 30 });
  });

  it('align e justify numa grade horizontal trocam de eixo', () => {
    // rows: 2: trilhas são as linhas (eixo y), justify no y; align no x.
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

  it('reverse põe a última filha na primeira célula', () => {
    const layout = resolve({ columns: 2, reverse: true });
    const children = [kid(10, 10), kid(20, 10), kid(30, 10)];
    const out = layoutChildren(box(0, 0, 200, 100), layout, children);
    expect(out[2]).toMatchObject({ x: 0, y: 0, width: 30 });
    expect(out[1]).toMatchObject({ x: 100, y: 0, width: 20 });
    expect(out[0]).toMatchObject({ x: 0, y: 10, width: 10 });
  });

  it('padding recua a área de conteúdo', () => {
    const layout = resolve({ columns: 2, padding: 10 });
    const out = layoutChildren(box(0, 0, 220, 100), layout, kids(3, 20, 20));
    expect(out.map((b) => [b.x, b.y])).toEqual([
      [10, 10],
      [110, 10],
      [10, 30],
    ]);
  });

  it('filhas de tamanhos diferentes: a linha tem a extensão da maior', () => {
    const layout = resolve({ columns: 2, lineGap: 5 });
    const children = [kid(10, 20), kid(10, 40), kid(10, 10)];
    const out = layoutChildren(box(0, 0, 200, 200), layout, children);
    expect(out[2]?.y).toBe(45);
  });
});

describe('contentExtent em grade', () => {
  it('abraça n × a maior filha e a soma das linhas', () => {
    const layout = resolve({ columns: 3, gap: 8, lineGap: 4 });
    const children = [kid(40, 10), kid(60, 30), kid(50, 20), kid(30, 15)];
    // largura 3 × 60 + 16; linhas: 30 e 15, mais lineGap 4.
    expect(contentExtent(layout, children, null)).toEqual({ width: 196, height: 49 });
  });

  it('com minColumnWidth, o limite disponível decide quantas trilhas', () => {
    const layout = resolve({ minColumnWidth: 100, gap: 8 });
    const children = kids(4, 100, 20);
    expect(contentExtent(layout, children, null)).toEqual({ width: 100, height: 80 });
    expect(contentExtent(layout, children, 400)).toEqual({ width: 316, height: 40 });
  });

  it('grade horizontal abraça n × a maior alta e as colunas', () => {
    const layout = resolve({ rows: 2, gap: 8, lineGap: 2 });
    const children = [kid(30, 40), kid(20, 10), kid(50, 20)];
    expect(contentExtent(layout, children, null)).toEqual({ width: 82, height: 88 });
  });
});

// --- layoutScreen: tela sem geometria com slot grid ----------------------------------------------

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

/** Biblioteca com `fixed` (100×40), `filler` (fill × fill) e `grid` (slot em grade com o layout dado). */
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
            // Passa pelo analisador como `row`; a grade entra depois.
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
      name: 'Tela',
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
    if (!found) throw new Error(`sem instância ${id}`);
    return found.box;
  };
  return { result, at };
}

describe('layoutScreen com slot grid', () => {
  it('arruma a tela sem geometria em 3 colunas', () => {
    const { result, at } = run(
      { type: 'grid', columns: 3, gap: 10, lineGap: 4 },
      [1, 2, 3, 4, 5].map((n) => node(`k${n}`, 'fixed')),
    );
    expect(result.warnings).toEqual([]);
    // trilha: (320 - 20) / 3 = 100; passo 110; linhas de 40 + 4.
    expect(at('k1')).toEqual({ x: 0, y: 0, width: 100, height: 40 });
    expect(at('k3')).toEqual({ x: 220, y: 0, width: 100, height: 40 });
    expect(at('k4')).toEqual({ x: 0, y: 44, width: 100, height: 40 });
    expect(at('k5')).toEqual({ x: 110, y: 44, width: 100, height: 40 });
    // o container `hug` na altura abraça as duas linhas
    expect(at('g')).toEqual({ x: 0, y: 0, width: 320, height: 84 });
  });

  it('filho fill ocupa a célula e a linha; reverse e justify valem', () => {
    const { at } = run({ type: 'grid', columns: 2, reverse: true, justify: 'end' }, [
      node('a', 'small'),
      node('f', 'filler'),
      node('b', 'fixed'),
    ]);
    // ordem invertida: b, f na primeira linha; a sozinha na segunda.
    expect(at('b')).toEqual({ x: 60, y: 0, width: 100, height: 40 });
    expect(at('f')).toEqual({ x: 160, y: 0, width: 160, height: 40 });
    expect(at('a')).toEqual({ x: 130, y: 40, width: 30, height: 10 });
  });

  it('grade horizontal (rows) preenche colunas', () => {
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
