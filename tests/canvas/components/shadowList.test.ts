// MF2 no Konva: a lista de sombras (cada uma numa forma à parte, a primeira por cima), o aviso
// "só a primeira sombra externa" que some, o `spread` (forma e raios), a sombra que volta pelo
// deslocamento (com giro e zoom) e o contorno com vão (`stroke.gaps`).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  baseNode,
  type SceneNode,
  type Shadow,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const shadow = (extra: Partial<Shadow> = {}): Shadow => ({
  color: '#000000',
  offset: { x: 0, y: 2 },
  blur: 4,
  ...extra,
});

const card = (effects: Shadow[], radius = 8): SceneNode => ({
  ...baseNode({
    id: 'c',
    name: 'c',
    width: 40,
    height: 20,
    effects,
    fills: [{ type: 'solid', color: '#ffffff80' }],
  }),
  type: 'rect',
  cornerRadius: radius,
});

const casters = (group: Konva.Group): Konva.Shape[] =>
  group.getChildren().filter((c): c is Konva.Shape => c.attrs['shadowCaster'] === true);

describe('lista de sombras (decisão 3)', () => {
  it('duas sombras externas desenham as duas, sem o aviso de só a primeira', () => {
    const first = shadow({ color: '#111111' });
    const second = shadow({ color: '#222222', blur: 8 });
    const { byId, warnings } = renderScene({ root: card([first, second]), warnings: [] });
    expect(warnings).toEqual([]);
    const group = byId.get('c')!;
    const list = casters(group);
    expect(list).toHaveLength(2);
    // A primeira da lista fica por cima: a última vem antes na ordem de desenho.
    expect(list.map((c) => c.attrs['shadowIndex'])).toEqual([1, 0]);
    // A forma do nó não leva sombra própria (a cor dela não muda) e vem depois das sombras.
    const fill = group.getChildren().at(-1) as Konva.Rect;
    expect(fill.fill()).toBe('#ffffff80');
    expect(fill.shadowBlur()).toBe(0);
    expect(list.every((c) => !c.listening())).toBe(true);
  });

  it('uma sombra sem spread continua na própria forma, como sempre', () => {
    const { byId } = renderScene({ root: card([shadow()]), warnings: [] });
    const group = byId.get('c')!;
    expect(casters(group)).toHaveLength(0);
    expect((group.getChildren()[0] as Konva.Rect).shadowBlur()).toBe(4);
  });

  it('a sombra interna segue ignorada com aviso, e as externas valem', () => {
    const { warnings, byId } = renderScene({
      root: card([shadow({ inner: true }), shadow(), shadow()]),
      warnings: [],
    });
    expect(warnings).toEqual([{ code: 'inner-shadow' }]);
    expect(casters(byId.get('c')!)).toHaveLength(2);
  });
});

/** Um contexto 2D que anota o que a forma da sombra faz. */
function recorder(matrix: { a: number; b: number; c: number; d: number }) {
  const calls: [string, ...number[]][] = [];
  const note =
    (name: string) =>
    (...args: number[]) =>
      void calls.push([name, ...args]);
  const native = {
    canvas: { width: 800, height: 600 },
    getTransform: () => matrix,
    save: note('save'),
    restore: note('restore'),
    translate: note('translate'),
    beginPath: note('beginPath'),
    moveTo: note('moveTo'),
    lineTo: note('lineTo'),
    arcTo: note('arcTo'),
    closePath: note('closePath'),
    ellipse: note('ellipse'),
    fill: note('fill'),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
  };
  return { native, calls };
}

function draw(
  effects: Shadow[],
  matrix: { a: number; b: number; c: number; d: number },
  node = card(effects),
) {
  const { byId } = renderScene({ root: node, warnings: [] });
  // A forma da primeira sombra da lista (a que fica por cima).
  const caster = casters(byId.get('c')!).find((c) => c.attrs['shadowIndex'] === 0);
  const { native, calls } = recorder(matrix);
  const fn = caster!.sceneFunc() as (ctx: unknown, shape: unknown) => void;
  fn({ _context: native }, caster);
  return { native, calls };
}

describe('a sombra que volta pelo deslocamento', () => {
  const I = { a: 1, b: 0, c: 0, d: 1 };
  /** Onde a origem da forma cai na tela somada ao deslocamento da sombra, menos a da forma. */
  const net = (
    native: ReturnType<typeof recorder>['native'],
    calls: ReturnType<typeof recorder>['calls'],
    m: typeof I,
  ) => {
    const t = calls.find(([name]) => name === 'translate')!;
    const [tx, ty] = [t[1]!, t[2]!];
    return {
      // A caixa começa em (−spread, −spread), no espaço local; o que sobra é o deslocamento puro.
      x: native.shadowOffsetX + m.a * tx + m.c * ty,
      y: native.shadowOffsetY + m.b * tx + m.d * ty,
    };
  };

  it.each([
    ['sem giro', I],
    ['girado 90°', { a: 0, b: 1, c: -1, d: 0 }],
    ['com zoom 2', { a: 2, b: 0, c: 0, d: 2 }],
    ['girado 30° com zoom 1,5', { a: 1.3, b: 0.75, c: -0.75, d: 1.3 }],
  ])('a forma cai longe da tela e a sombra volta ao lugar: %s', (_name, m) => {
    const first = shadow({ offset: { x: 3, y: 5 }, blur: 6 });
    const { native, calls } = draw([first, shadow()], m);
    const sx = Math.hypot(m.a, m.b);
    const sy = Math.hypot(m.c, m.d);
    const result = net(native, calls, m);
    expect(result.x).toBeCloseTo(3 * sx, 6);
    expect(result.y).toBeCloseTo(5 * sy, 6);
    // Longe: o deslocamento da forma passa a tela inteira.
    const t = calls.find(([name]) => name === 'translate')!;
    expect(Math.hypot(m.a * t[1]!, m.b * t[1]!)).toBeGreaterThan(800 + 600);
    expect(native.shadowBlur).toBeCloseTo(6 * Math.min(sx, sy), 6);
    expect(native.shadowColor).toBe('#000000');
  });
});

describe('shadow.spread no Konva (decisão 4)', () => {
  const I = { a: 1, b: 0, c: 0, d: 1 };

  it('a forma cresce o spread de cada lado, com os raios mais o spread', () => {
    const { calls } = draw([shadow({ spread: 3, blur: 0, offset: { x: 0, y: 0 } })], I);
    const moves = calls.filter(([name]) => name === 'moveTo');
    // Caixa 46 × 26 e raio 8 + 3 = 11: o caminho abre em (11, 0), no espaço da forma.
    expect(moves[0]).toEqual(['moveTo', 11, 0]);
    const lines = calls.filter(([name]) => name === 'lineTo');
    expect(lines[0]).toEqual(['lineTo', 46 - 11, 0]);
  });

  it('o spread negativo encolhe a forma; some quando passa da metade', () => {
    const small = draw([shadow({ spread: -4, offset: { x: 0, y: 0 } })], I).calls;
    expect(small.find(([name]) => name === 'moveTo')).toEqual(['moveTo', 4, 0]);
    // 40 × 20 com spread −10 vira 20 × 0: nada a desenhar.
    const gone = draw([shadow({ spread: -10 })], I).calls;
    expect(gone.some(([name]) => name === 'fill')).toBe(false);
  });

  it('um canto reto continua reto com o spread', () => {
    const { calls } = draw([shadow({ spread: 3 })], I, card([shadow({ spread: 3 })], 0));
    expect(calls.find(([name]) => name === 'moveTo')).toEqual(['moveTo', 0, 0]);
  });

  it('uma sombra de spread positivo sem desfoque nem deslocamento ainda desenha (é um anel)', () => {
    const { calls } = draw([shadow({ spread: 3, blur: 0, offset: { x: 0, y: 0 } })], I);
    expect(calls.some(([name]) => name === 'fill')).toBe(true);
  });

  it('a elipse leva a sombra pela elipse crescida', () => {
    const ellipse: SceneNode = {
      ...baseNode({
        id: 'c',
        name: 'c',
        width: 20,
        height: 10,
        fills: [{ type: 'solid', color: '#ffffff' }],
        effects: [shadow({ spread: 2 }), shadow()],
      }),
      type: 'ellipse',
    };
    const { calls } = draw([], I, ellipse);
    expect(calls.find(([name]) => name === 'ellipse')).toEqual([
      'ellipse',
      12,
      7,
      12,
      7,
      0,
      0,
      Math.PI * 2,
    ]);
  });
});

describe('contorno com vão no Konva (decisão 7)', () => {
  it('o contorno vira linhas abertas que pulam o vão, sem a forma fechada', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'o', name: 'o', width: 100, height: 40 }),
      type: 'rect',
      cornerRadius: 6,
      stroke: {
        paints: [{ type: 'solid', color: '#ff0000' }],
        width: 2,
        align: 'center',
        gaps: [{ side: 'top', from: 20, to: 50 }],
      },
    };
    const { byId } = renderScene({ root: node, warnings: [] });
    const shapes = byId.get('o')!.getChildren();
    expect(shapes.every((s) => s instanceof Konva.Line)).toBe(true);
    expect(shapes).toHaveLength(1);
    const line = shapes[0] as Konva.Line;
    expect(line.closed()).toBe(false);
    expect(line.stroke()).toBe('#ff0000');
    const points = line.points();
    // Começa onde o vão termina (50, 0) e termina onde ele começa (20, 0).
    expect(points.slice(0, 2)).toEqual([50, 0]);
    expect(points.slice(-2)).toEqual([20, 0]);
  });

  it('sem gaps o contorno é o retângulo de sempre', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'o', name: 'o', width: 100, height: 40 }),
      type: 'rect',
      cornerRadius: 6,
      stroke: {
        paints: [{ type: 'solid', color: '#ff0000' }],
        width: 2,
        align: 'center',
      },
    };
    const { byId } = renderScene({ root: node, warnings: [] });
    expect(byId.get('o')!.getChildren()[0]).toBeInstanceOf(Konva.Rect);
  });
});
