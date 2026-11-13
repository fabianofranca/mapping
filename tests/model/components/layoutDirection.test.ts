// R1 (#1106, decisão 5 da #1096): telas sem geometria em `rtl`. `ScreenAnchor` (`LayoutAnchor`)
// `start`/`end` são lógicos; as raízes em fluxo, os slots `row`/`column`/`grid`/`none` e o
// `wrap` espelham dentro do conteúdo; `ltr` não muda.
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
      name: 'Tela',
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
  if (!instance) throw new Error(`sem instância ${id}`);
  return instance.box;
}

it('a biblioteca de teste carrega sem problemas', () => {
  expect(library.problems).toEqual([]);
});

describe('layoutScreen em rtl: ScreenAnchor lógico', () => {
  const anchored = (anchor: LayoutAnchor, direction: 'ltr' | 'rtl', margin = 16) =>
    run([{ node: node('x', 'a'), anchor, margin }], direction);

  it('top-start em rtl fica à direita; em ltr, à esquerda', () => {
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
  ])('%s: start e end trocam de lado em rtl, o eixo vertical não muda', (anchor) => {
    const ltr = boxOf(anchored(anchor, 'ltr'), 'x');
    const rtl = boxOf(anchored(anchor, 'rtl'), 'x');
    expect(rtl.x).toBeCloseTo(W - ltr.x - ltr.width, 6);
    expect(rtl.y).toBe(ltr.y);
  });

  it('top, center e bottom (sem start/end) são os mesmos nos dois sentidos', () => {
    for (const anchor of ['top', 'center', 'bottom'] as const)
      expect(boxOf(anchored(anchor, 'rtl'), 'x')).toEqual(
        boxOf(anchored(anchor, 'ltr'), 'x'),
      );
  });
});

describe('layoutScreen em rtl: os slots espelham dentro do conteúdo', () => {
  const kids = () => [node('k1', 'a'), node('k2', 'b'), node('k3', 'c')];

  /** Cada filho x' = largura da tela − x − w (o contêiner `fill` ocupa a tela). */
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

  it('row: o primeiro filho à direita; o padding continua físico', () => {
    const roots = [{ node: node('h', 'row', kids()) }];
    const ltr = run(roots, 'ltr');
    const rtl = run(roots, 'rtl');
    // padding [top, right, bottom, left] = [0, 8, 0, 30]
    expect(boxOf(ltr, 'k1').x).toBe(30);
    expect(boxOf(rtl, 'k1').x).toBe(W - 8 - 40);
    expect(boxOf(rtl, 'k1').x).toBeGreaterThan(boxOf(rtl, 'k2').x);
  });

  it('row com reverse compõe com rtl (volta à ordem da esquerda para a direita)', () => {
    const roots = [{ node: node('h', 'row-rev', kids()) }];
    const rtl = run(roots, 'rtl');
    expect(boxOf(rtl, 'k1').x).toBeLessThan(boxOf(rtl, 'k2').x);
  });

  it('column align start, grade, none alinhado e wrap espelham', () => {
    expectMirrored('col', ['k1', 'k2', 'k3']);
    expectMirrored('grid', ['k1', 'k2', 'k3']);
    expectMirrored('none', ['k1', 'k2', 'k3']);
    expectMirrored('wrap', ['k1', 'k2', 'k3']);
  });

  it('as raízes em fluxo (a tela é uma coluna, align start) ficam à direita em rtl', () => {
    const roots = [{ node: node('f', 'a') }];
    expect(boxOf(run(roots, 'ltr'), 'f').x).toBe(0);
    expect(boxOf(run(roots, 'rtl'), 'f').x).toBe(W - 40);
  });

  it('sem direction a tela é a de ltr', () => {
    const roots = [{ node: node('h', 'row', kids()) }];
    expect(JSON.stringify(run(roots, undefined).screen)).toBe(
      JSON.stringify(run(roots, 'ltr').screen),
    );
  });
});
