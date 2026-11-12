// CL1 (P2): a contagem de trilhas lembrada da medida `hug` (`huggedCounts`) só vale para o quadro
// que abraça o conteúdo; numa grade `fill` o tamanho conhecido manda, mesmo que seja igual ao total
// que uma medida anterior (com outro limite) deu a outra contagem.
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
 * Uma grade `minColumnWidth: 100` com A (span 3, 150 px), B e C (20 px): com 3 trilhas e com 1 o
 * total é o mesmo (150). O pai `hug` a mede primeiro com o limite de 300 (3 trilhas) e depois a
 * entrega com 150, onde cabe uma trilha só.
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

describe('huggedCounts: a contagem lembrada não vaza para a grade de tamanho dado', () => {
  it('grade fill de 150 com minColumnWidth 100: uma trilha, B e C empilhados', () => {
    const at = draw('fill');
    expect(at('g').width).toBe(150);
    expect(at('B').x).toBe(at('C').x);
    expect(at('C').y).toBeGreaterThan(at('B').y);
  });

  it('grade hug: a contagem medida (3 trilhas) vale na passagem final', () => {
    const at = draw('hug');
    expect(at('B').y).toBe(at('C').y);
    expect(at('C').x).toBeGreaterThan(at('B').x);
  });
});

/**
 * #1692: dois limites (300 e 150) dão o mesmo total (150) com contagens diferentes (3 e 1 trilhas).
 * A passagem final lê a contagem pelo limite dela (150: uma trilha), nas duas ordens em que o pai
 * mede a grade `hug`.
 */
function drawHugged(
  order: 'natural-first' | 'narrow-first',
  wrapperWidth: 'hug' | 'max-content' | 'min-content' = 'hug',
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
    layout: { type: 'column' },
    // Um pai `hug` mede os filhos na ordem em que vêm: a grade antes ou depois do filho fixo.
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

describe('huggedCounts: o empate de total com contagens diferentes (#1692)', () => {
  const parents = ['hug'] as const;
  const cases = (['natural-first', 'narrow-first'] as const).flatMap((order) =>
    parents.map((parent) => [order, parent] as const),
  );
  for (const [order, parent] of cases) {
    it(`grade hug num pai ${parent} (${order}): a passagem final tem 1 trilha, como a grade fill`, () => {
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
