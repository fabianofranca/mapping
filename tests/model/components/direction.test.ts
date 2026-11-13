// R1 (#1106, decisões 4 a 8 da #1096): a direção de leitura no motor. A mesma cena em `ltr` e em
// `rtl`: cada filho sem `mirror` fica em x' = largura − x − w; `start`/`end` lógicos, `left`/`right`
// físicos; `font.align`; `direction` por nó; `$direction`; `mirror` do ícone e do caminho.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
  type InstantiateOptions,
} from '../../../src/model/components/instantiate';
import { absoluteBoxes, walk, type SceneNode } from '../../../src/model/components/scene';

type Json = Record<string, unknown>;

function file(template: Json, formatVersion = 4): Json {
  return {
    format: COMPONENT_FORMAT,
    formatVersion,
    id: 'c',
    name: 'C',
    size: { width: 320, height: 200 },
    template,
  };
}

const BOX = { x: 0, y: 0, width: 320, height: 200 };
const W = BOX.width;

function build(
  template: Json,
  direction: 'ltr' | 'rtl' | undefined,
  extra: Partial<InstantiateOptions> = {},
) {
  const result = instantiate(file(template) as never, {}, BOX, {
    measure: approximateMeasurer,
    ...(direction === undefined ? {} : { direction }),
    ...extra,
  });
  const boxes = absoluteBoxes(result.root);
  const nodes = [...walk(result.root)];
  const find = (name: string): SceneNode => {
    const node = nodes.find((n) => n.name === name);
    if (node === undefined) throw new Error(`sem nó ${name}`);
    return node;
  };
  const at = (name: string) => {
    const node = find(name);
    const b = boxes.get(node.id) ?? { x: 0, y: 0 };
    return { x: b.x, y: b.y, width: node.width, height: node.height };
  };
  return {
    ...result,
    at,
    find,
    has: (name: string) => nodes.some((n) => n.name === name),
  };
}

const rect = (name: string, w: number, h = 20, extra: Json = {}): Json => ({
  type: 'rect',
  name,
  width: w,
  height: h,
  ...extra,
});

const host = (layout: Json, children: Json[], extra: Json = {}): Json => ({
  type: 'frame',
  name: 'host',
  width: 'fill',
  height: 'fill',
  layout,
  children,
  ...extra,
});

/** Espelha na horizontal: x' = largura − x − w. */
const mirrored = (b: { x: number; width: number }) => W - b.x - b.width;

/** A mesma cena nos dois sentidos: cada filho sem `mirror` fica espelhado. */
function expectMirrored(template: Json, names: string[]): void {
  const ltr = build(template, 'ltr');
  const rtl = build(template, 'rtl');
  for (const name of names) {
    const a = ltr.at(name);
    const b = rtl.at(name);
    expect(b.x, `${name}.x`).toBeCloseTo(mirrored(a), 6);
    expect(b.y, `${name}.y`).toBeCloseTo(a.y, 6);
    expect(b.width, `${name}.width`).toBeCloseTo(a.width, 6);
  }
}

describe('direção no motor: o espelho das fileiras, colunas, none, grade e quebra', () => {
  const three = [rect('a', 40), rect('b', 60), rect('c', 80)];

  it("row: o primeiro filho fica à direita (x' = largura − x − w)", () => {
    const t = host({ type: 'row', gap: 10 }, three);
    expect(build(t, 'ltr').at('a').x).toBe(0);
    expect(build(t, 'rtl').at('a').x).toBe(W - 40);
    expectMirrored(t, ['a', 'b', 'c']);
  });

  it('row: justify start encosta à direita, end à esquerda; padding continua físico', () => {
    const t = host({ type: 'row', justify: 'start', padding: [0, 8, 0, 30] }, three);
    // padding [top, right, bottom, left] físico: o primeiro filho encosta no right (8).
    expect(build(t, 'rtl').at('a').x).toBe(W - 8 - 40);
    const e = host({ type: 'row', justify: 'end', padding: [0, 8, 0, 30] }, three);
    expect(build(e, 'rtl').at('c').x).toBe(30);
    expectMirrored(host({ type: 'row', justify: 'space-between', gap: 4 }, three), [
      'a',
      'b',
      'c',
    ]);
  });

  it('row: reverse compõe (volta à ordem da esquerda para a direita)', () => {
    const t = host({ type: 'row', reverse: true, gap: 10 }, three);
    const ltr = build(t, 'ltr');
    const rtl = build(t, 'rtl');
    // em ltr o reverse põe o primeiro filho no fim; em rtl, de novo no início (esquerda).
    expect(ltr.at('a').x).toBeGreaterThan(ltr.at('c').x);
    expect(rtl.at('a').x).toBeLessThan(rtl.at('c').x);
    expect(rtl.at('a').x).toBe(0);
  });

  it('column: align start vai à direita, end à esquerda, o eixo vertical não muda', () => {
    const t = host({ type: 'column', align: 'start', gap: 5 }, three);
    expect(build(t, 'rtl').at('a').x).toBe(W - 40);
    expect(build(t, 'rtl').at('b').y).toBe(25);
    expectMirrored(t, ['a', 'b', 'c']);
    const e = host({ type: 'column', align: 'end' }, three);
    expect(build(e, 'rtl').at('a').x).toBe(0);
    expectMirrored(host({ type: 'column', align: 'center' }, three), ['a', 'b']);
  });

  it('none alinhado: justify start/end e as âncoras lógicas espelham', () => {
    const t = host({ type: 'none', justify: 'start' }, [rect('a', 40)]);
    expect(build(t, 'rtl').at('a').x).toBe(W - 40);
    const e = host({ type: 'none', justify: 'end' }, [rect('a', 40)]);
    expect(build(e, 'rtl').at('a').x).toBe(0);
  });

  it('anchors.start/end lógicos; left/right físicos', () => {
    const t = host({ type: 'none' }, [
      rect('s', 40, 20, { anchors: { start: 10, top: 0 } }),
      rect('e', 40, 20, { anchors: { end: 12, top: 30 } }),
      rect('l', 40, 20, { anchors: { left: 10, top: 60 } }),
      rect('r', 40, 20, { anchors: { right: 12, top: 90 } }),
    ]);
    const ltr = build(t, 'ltr');
    const rtl = build(t, 'rtl');
    expect(ltr.at('s').x).toBe(10);
    expect(ltr.at('e').x).toBe(W - 12 - 40);
    expect(rtl.at('s').x).toBe(W - 10 - 40);
    expect(rtl.at('e').x).toBe(12);
    // físicos: iguais nos dois sentidos
    expect(rtl.at('l').x).toBe(10);
    expect(rtl.at('r').x).toBe(W - 12 - 40);
  });

  it('anchors.start com end estica entre as duas, nos dois sentidos', () => {
    const t = host({ type: 'none' }, [
      rect('a', 10, 20, { anchors: { start: 10, end: 30 } }),
    ]);
    expect(build(t, 'ltr').at('a')).toMatchObject({ x: 10, width: W - 40 });
    expect(build(t, 'rtl').at('a')).toMatchObject({ x: 30, width: W - 40 });
  });

  it('grid vertical: as trilhas preenchem da direita para a esquerda', () => {
    const cells = [rect('a', 20), rect('b', 20), rect('c', 20), rect('d', 20)];
    const t = host({ type: 'grid', columns: 2, gap: 10, justify: 'start' }, cells);
    expectMirrored(t, ['a', 'b', 'c', 'd']);
    expect(build(t, 'rtl').at('a').x).toBeGreaterThan(build(t, 'rtl').at('b').x);
  });

  it('grid horizontal: as linhas de fluxo correm da direita para a esquerda', () => {
    const cells = [rect('a', 20, 20), rect('b', 20, 20), rect('c', 20, 20)];
    const t = host({ type: 'grid', rows: 1, lineGap: 6 }, cells);
    expectMirrored(t, ['a', 'b', 'c']);
  });

  it('wrap em row: cada linha corre da direita para a esquerda', () => {
    const kids = [0, 1, 2, 3, 4].map((i) => rect(`k${i}`, 100));
    const t = host({ type: 'row', wrap: 'wrap', gap: 8, lineGap: 12 }, kids);
    expectMirrored(t, ['k0', 'k1', 'k2', 'k3', 'k4']);
    expect(build(t, 'rtl').at('k0').x).toBe(W - 100);
  });

  it('wrap em column: as colunas empilham da direita para a esquerda', () => {
    const kids = [0, 1, 2, 3].map((i) => rect(`k${i}`, 50, 90));
    const t = host({ type: 'column', wrap: 'wrap', gap: 4, lineGap: 10 }, kids);
    expectMirrored(t, ['k0', 'k1', 'k2', 'k3']);
  });

  it('em ltr nada muda: a cena sem direction é a de ltr', () => {
    const t = host({ type: 'row', gap: 10 }, three);
    const a = build(t, undefined);
    const b = build(t, 'ltr');
    expect(JSON.stringify(a.root)).toBe(JSON.stringify(b.root));
  });

  it('o eixo vertical e o eixo cruzado de uma row não mudam', () => {
    const t = host({ type: 'row', align: 'end' }, three);
    expect(build(t, 'rtl').at('a').y).toBe(build(t, 'ltr').at('a').y);
  });
});

describe('direção por nó e $direction', () => {
  const kids = [rect('a', 40), rect('b', 60)];

  it('direction: "ltr" num quadro trava a subárvore (o quadro ainda é posto pelo pai rtl)', () => {
    const inner = host({ type: 'row' }, [rect('x', 30), rect('y', 30)], {
      name: 'inner',
      direction: 'ltr',
      width: 100,
      height: 20,
    });
    const t = host({ type: 'row' }, [inner, rect('z', 20)]);
    const rtl = build(t, 'rtl');
    expect(rtl.at('inner').x).toBe(W - 100);
    // dentro do `inner`, a ordem é a de ltr: x à esquerda de y
    expect(rtl.at('x').x).toBe(W - 100);
    expect(rtl.at('y').x).toBe(W - 100 + 30);
  });

  it('direction: "rtl" num quadro espelha só a subárvore, mesmo em ltr', () => {
    const t = host({ type: 'row' }, [
      host({ type: 'row' }, kids, { name: 'inner', direction: 'rtl', width: 200 }),
    ]);
    const ltr = build(t, 'ltr');
    expect(ltr.at('inner').x).toBe(0);
    expect(ltr.at('a').x).toBe(200 - 40);
  });

  it('{ "$direction": "rtl" } em visible vale onde vale uma condição', () => {
    const t = host({ type: 'row' }, [
      rect('only-rtl', 10, 10, { visible: { $direction: 'rtl' } }),
      rect('only-ltr', 10, 10, { visible: { $direction: 'ltr' } }),
      rect('both', 10, 10, {
        visible: { $or: [{ $direction: 'rtl' }, { $direction: 'ltr' }] },
      }),
      rect('not-rtl', 10, 10, { visible: { $not: { $direction: 'rtl' } } }),
    ]);
    const ltr = build(t, 'ltr');
    const rtl = build(t, 'rtl');
    expect([ltr.has('only-rtl'), ltr.has('only-ltr')]).toEqual([false, true]);
    expect([rtl.has('only-rtl'), rtl.has('only-ltr')]).toEqual([true, false]);
    expect(ltr.has('both') && rtl.has('both')).toBe(true);
    expect([ltr.has('not-rtl'), rtl.has('not-rtl')]).toEqual([true, false]);
  });

  it('$direction num $if escolhe o valor e vê a direção travada da subárvore', () => {
    const t = host({ type: 'column' }, [
      {
        type: 'text',
        name: 't',
        text: 'x',
        width: 50,
        font: { size: 10 },
        color: { $if: { $direction: 'rtl' }, then: '#ff0000', else: '#0000ff' },
      },
      host(
        { type: 'column' },
        [
          {
            type: 'text',
            name: 'locked',
            text: 'y',
            width: 50,
            font: { size: 10 },
            color: { $if: { $direction: 'rtl' }, then: '#ff0000', else: '#0000ff' },
          },
        ],
        { direction: 'ltr', height: 20 },
      ),
    ]);
    const rtl = build(t, 'rtl');
    expect(rtl.find('t').fills[0]).toMatchObject({ color: '#ff0000' });
    expect(rtl.find('locked').fills[0]).toMatchObject({ color: '#0000ff' });
  });
});

describe('texto: font.align start/end e TextStyle.direction', () => {
  const text = (align?: string, extra: Json = {}): Json => ({
    type: 'text',
    name: 't',
    text: 'olá',
    width: 'fill',
    font: { size: 12, ...(align === undefined ? {} : { align }) },
    ...extra,
  });
  const style = (template: Json, direction: 'ltr' | 'rtl') =>
    (
      build(template, direction).find('t') as unknown as {
        style: Record<string, unknown>;
      }
    ).style;

  it('o padrão é start: left em ltr, right em rtl', () => {
    const t = host({ type: 'column' }, [text()]);
    expect(style(t, 'ltr').align).toBe('left');
    expect(style(t, 'rtl').align).toBe('right');
  });

  it('start e end resolvem pelo sentido; left, center e right continuam físicos', () => {
    const at = (align: string, d: 'ltr' | 'rtl') =>
      style(host({ type: 'column' }, [text(align)]), d).align;
    expect([at('start', 'ltr'), at('start', 'rtl')]).toEqual(['left', 'right']);
    expect([at('end', 'ltr'), at('end', 'rtl')]).toEqual(['right', 'left']);
    expect([at('left', 'rtl'), at('right', 'rtl'), at('center', 'rtl')]).toEqual([
      'left',
      'right',
      'center',
    ]);
  });

  it('a cena marca direction: "rtl" no texto, e só nele', () => {
    const t = host({ type: 'column' }, [text()]);
    expect(style(t, 'rtl').direction).toBe('rtl');
    expect('direction' in style(t, 'ltr')).toBe(false);
    const locked = host({ type: 'column' }, [text('start', { direction: 'ltr' })]);
    expect(style(locked, 'rtl').align).toBe('left');
    expect('direction' in style(locked, 'rtl')).toBe(false);
  });
});

describe('espelho: icon e path com mirror', () => {
  const icons: IconSet = {
    viewBox: [24, 24],
    icons: {
      back: { mirror: true, paths: [{ d: 'M15 5l-7 7 7 7', stroke: true, width: 2 }] },
      plain: { paths: [{ d: 'M5 12h14', stroke: true, width: 2 }] },
    },
  } as never;
  const iconNode = (name: string, extra: Json = {}): Json => ({
    type: 'icon',
    name,
    width: 24,
    height: 24,
    ...extra,
  });
  const pathNode = (extra: Json = {}): Json => ({
    type: 'path',
    name: 'p',
    d: 'M0 0L10 5L0 10',
    viewBox: [10, 10],
    width: 20,
    height: 20,
    ...extra,
  });
  const IDENTITY_ICON = [1, 0, 0, 1];

  /** O `transform` dos caminhos do ícone `name` (o grupo tem os filhos). */
  const childMatrix = (template: Json, d: 'ltr' | 'rtl') => {
    const group = build(template, d, { icons }).find('back') as unknown as {
      transform: number[];
      children: { transform: number[] }[];
      width: number;
    };
    return { group: group.transform, child: group.children[0]!.transform };
  };

  it('o mirror do conjunto espelha o ícone em rtl e a identidade fica em ltr', () => {
    const t = host({ type: 'row' }, [iconNode('back', { name: 'back' })]);
    const ltr = childMatrix(t, 'ltr');
    const rtl = childMatrix(t, 'rtl');
    expect(ltr.child.slice(0, 4)).toEqual(IDENTITY_ICON);
    expect(rtl.child[0]).toBe(-1);
    expect(rtl.child[3]).toBe(1);
    // o ícone espelhado continua na mesma caixa: x' + escala negativa cobre [0, w]
    expect(rtl.child[4]).toBe(24);
  });

  it('o ícone sem mirror não espelha, e o mirror do nó vence o do conjunto', () => {
    const plain = build(host({ type: 'row' }, [iconNode('plain')]), 'rtl', {
      icons,
    }).find('plain') as unknown as { children: { transform: number[] }[] };
    expect(plain.children[0]!.transform[0]).toBe(1);
    const off = host({ type: 'row' }, [
      iconNode('back', { name: 'back', mirror: false }),
    ]);
    expect(childMatrix(off, 'rtl').child[0]).toBe(1);
    const on = build(
      host({ type: 'row' }, [iconNode('plain', { mirror: true })]),
      'rtl',
      {
        icons,
      },
    ).find('plain') as unknown as { children: { transform: number[] }[] };
    expect(on.children[0]!.transform[0]).toBe(-1);
  });

  it('o mirror do nó vale com expressão e com $direction', () => {
    const t = host({ type: 'row' }, [
      iconNode('back', { name: 'back', mirror: { $direction: 'rtl' } }),
    ]);
    expect(childMatrix(t, 'rtl').child[0]).toBe(-1);
    expect(childMatrix(t, 'ltr').child[0]).toBe(1);
  });

  it('path: mirror leva a matriz [-sx, 0, 0, sy, x + w, y] em rtl e a identidade em ltr', () => {
    const t = host({ type: 'row' }, [pathNode({ mirror: true })]);
    const ltr = build(t, 'ltr').find('p') as unknown as { transform: number[] };
    const rtl = build(t, 'rtl').find('p') as unknown as { transform: number[] };
    expect(ltr.transform).toEqual([2, 0, 0, 2, 0, 0]);
    // em rtl o nó fica à direita: x = 300, w = 20 → x + w = 320
    expect(rtl.transform).toEqual([-2, 0, 0, 2, 320, 0]);
  });

  it('path sem mirror (o padrão é false) não espelha', () => {
    const t = host({ type: 'row' }, [pathNode()]);
    const rtl = build(t, 'rtl').find('p') as unknown as { transform: number[] };
    expect(rtl.transform[0]).toBe(2);
  });

  it('mirror só vale com a direção efetiva do nó: direction "ltr" trava e não espelha', () => {
    const t = host({ type: 'row' }, [pathNode({ mirror: true, direction: 'ltr' })]);
    const rtl = build(t, 'rtl').find('p') as unknown as { transform: number[] };
    expect(rtl.transform[0]).toBe(2);
  });
});
