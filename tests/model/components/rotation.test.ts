// Formato 4, fase EX3: `rotation` por nó (graus, sentido horário, em volta do centro da caixa).
// É só desenho: a cena carrega o ângulo avaliado e a caixa, o layout e o `hug` não mudam.
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  type ComponentFile,
  type FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  type FrameNode,
  type SceneNode,
  nodeMatrix,
  walk,
} from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

const V4 = 'só é permitido com formatVersion 4';

function file(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

function parse(template: Raw): ComponentFile {
  const r = parseComponent(file(template));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

const bar = (extra: Raw = {}): Raw => ({
  type: 'rect',
  name: 'bar',
  width: 40,
  height: 10,
  fill: '#ff0000',
  ...extra,
});

const root = (children: Raw[], extra: Raw = {}): Raw => ({
  type: 'frame',
  layout: { type: 'row', align: 'center', justify: 'center' },
  children,
  ...extra,
});

function scene(template: Raw, values: FieldValues = {}): FrameNode {
  return instantiate(
    parse(template),
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer },
  ).root as FrameNode;
}

function named(node: SceneNode, name: string): SceneNode {
  for (const n of walk(node)) if (n.name === name) return n;
  throw new Error(`sem nó ${name}`);
}

describe('rotation no validador', () => {
  it('vale em qualquer nó que não seja a raiz, com número ou expressão', () => {
    const tpl = root([
      bar({ rotation: 45 }),
      { type: 'ellipse', rotation: { $mul: [{ $field: 'a' }, 360] } },
      { type: 'frame', rotation: { $field: 'a', default: -30 }, children: [] },
      { type: 'repeat', count: 2, rotation: 10, template: { type: 'frame' } },
    ]);
    expect(validateComponent(file(tpl))).toEqual([]);
  });

  it('na raiz é erro', () => {
    expect(validateComponent(file(root([], { rotation: 10 })))).toEqual([
      'template.rotation: não vale na raiz',
    ]);
  });

  it('literal que não é número falha no caminho da chave', () => {
    expect(validateComponent(file(root([bar({ rotation: 'x' })])))).toEqual([
      'template.children[0].rotation: esperava número',
    ]);
  });

  it('numa formatVersion 1 a 3 dá o erro de versão no caminho da chave', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(file(root([bar({ rotation: 45 })]), version))).toEqual([
        `template.children[0].rotation: ${V4}`,
      ]);
    }
  });
});

describe('rotation na cena', () => {
  it('a cena carrega o ângulo avaliado e a caixa do nó não muda', () => {
    const plain = named(scene(root([bar()])), 'bar');
    const turned = named(scene(root([bar({ rotation: 45 })])), 'bar');
    expect(turned.rotation).toBe(45);
    expect(plain.rotation).toBeUndefined();
    expect(turned.width).toBe(plain.width);
    expect(turned.height).toBe(plain.height);
    expect(turned.transform).toEqual(plain.transform);
  });

  it('avalia a expressão e o campo vazio vale 0 (sem rotação na cena)', () => {
    const tpl = root([bar({ rotation: { $mul: [{ $field: 'a' }, 90] } })]);
    expect(named(scene(tpl, { a: '2' }), 'bar').rotation).toBe(180);
    expect(named(scene(tpl, { a: '' }), 'bar').rotation).toBeUndefined();
    expect(named(scene(tpl, {}), 'bar').rotation).toBeUndefined();
  });

  it('0 fica sem rotação; negativo e maior que 360 são mantidos', () => {
    const at = (rotation: number) => named(scene(root([bar({ rotation })])), 'bar');
    expect(at(0).rotation).toBeUndefined();
    expect(at(-30).rotation).toBe(-30);
    expect(at(450).rotation).toBe(450);
  });

  it('o repeat passa a rotação ao quadro das linhas', () => {
    const tpl = root([
      {
        type: 'repeat',
        name: 'rows',
        count: 2,
        rotation: 90,
        template: { type: 'frame', width: 5, height: 5 },
      },
    ]);
    const frame = named(scene(tpl), 'rows');
    expect(frame.rotation).toBe(90);
  });

  it('layout e hug são iguais com e sem rotation', () => {
    const tpl = (extra: Raw) =>
      root(
        [
          bar(extra),
          {
            type: 'frame',
            name: 'hugged',
            width: 'hug',
            height: 'hug',
            ...extra,
            children: [bar({ name: 'inner', ...extra })],
          },
          { type: 'rect', name: 'after', width: 7, height: 7 },
        ],
        { layout: { type: 'row', gap: 4, padding: 3 } },
      );
    const boxes = (extra: Raw) =>
      [...walk(scene(tpl(extra)))].map((n) => [n.name, n.width, n.height, n.transform]);
    expect(boxes({ rotation: 45 })).toEqual(boxes({}));
    const measure = (extra: Raw) =>
      measureComponent(
        parse({ ...tpl(extra), width: 'hug', height: 'hug' }),
        {},
        { width: null, height: null },
        { measure: approximateMeasurer },
      );
    expect(measure({ rotation: 45 })).toEqual(measure({}));
  });
});

describe('nodeMatrix', () => {
  it('sem rotação é a própria transformação do nó', () => {
    const node = named(scene(root([bar()])), 'bar');
    expect(nodeMatrix(node)).toEqual(node.transform);
  });

  it('gira em volta do centro da caixa: 40×10 a 90° vira 10×40 no mesmo centro', () => {
    const node = named(scene(root([bar({ rotation: 90 })])), 'bar');
    const [a, b, c, d, e, f] = nodeMatrix(node);
    const at = (x: number, y: number) => ({
      x: a * x + c * y + e,
      y: b * x + d * y + f,
    });
    const [tx, ty] = [node.transform[4], node.transform[5]];
    const center = at(20, 5);
    expect(center.x).toBeCloseTo(tx + 20, 9);
    expect(center.y).toBeCloseTo(ty + 5, 9);
    // o canto superior esquerdo (0, 0) vai para o superior direito da caixa girada
    const corner = at(0, 0);
    expect(corner.x).toBeCloseTo(tx + 20 + 5, 9);
    expect(corner.y).toBeCloseTo(ty + 5 - 20, 9);
  });
});
