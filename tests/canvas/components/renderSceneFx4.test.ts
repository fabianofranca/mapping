// FX4 no desenho da app: stroke.offset, wrap "none" cortado por pixel e quatro sides (decisões 17, 19 e 21).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { StrokeSide } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import {
  cutLineLeft,
  konvaLineHeight,
  visibleLineCount,
} from '../../../src/model/components/textWrap';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  type Stroke,
  type TextNode,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#112233' }],
  width: 2,
  align: 'center',
  ...extra,
});

const frameOf = (children: SceneNode[], extra: Partial<FrameNode> = {}): Scene => ({
  root: {
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  },
  warnings: [],
});

const shapesOf = (scene: Scene) => renderScene(scene).root.find('Shape') as Konva.Shape[];

describe('stroke.offset', () => {
  it('o anel de um retângulo de raio 8 fica afastado 2: caixa crescida e raio 8 + 2', () => {
    const [ring] = shapesOf(
      frameOf([], { cornerRadius: 8, stroke: stroke({ align: 'center', offset: 2 }) }),
    );
    const rect = ring as Konva.Rect;
    expect([rect.x(), rect.y(), rect.width(), rect.height()]).toEqual([-2, -2, 104, 44]);
    expect(rect.cornerRadius()).toEqual(10);
  });

  it('o align vale em relação ao contorno afastado (outside: mais meia largura)', () => {
    const [ring] = shapesOf(
      frameOf([], { cornerRadius: 8, stroke: stroke({ align: 'outside', offset: 2 }) }),
    );
    const rect = ring as Konva.Rect;
    expect([rect.x(), rect.y(), rect.width(), rect.height()]).toEqual([-3, -3, 106, 46]);
    expect(rect.cornerRadius()).toEqual(11);
  });

  it('raio 0 continua reto (como o outline-offset do CSS)', () => {
    const [ring] = shapesOf(frameOf([], { stroke: stroke({ offset: 3 }) }));
    expect((ring as Konva.Rect).cornerRadius()).toEqual(0);
  });

  it('numa elipse os dois raios crescem o offset', () => {
    const ellipse: SceneNode = {
      ...baseNode({ id: 'e', name: 'e', width: 40, height: 20 }),
      type: 'ellipse',
      stroke: stroke({ offset: 2 }),
    };
    const shape = shapesOf(frameOf([ellipse])).find(
      (s) => s.className === 'Ellipse',
    ) as Konva.Ellipse;
    expect([shape.radiusX(), shape.radiusY()]).toEqual([22, 12]);
  });

  it('com sides, o afastamento vale só nos lados pedidos', () => {
    const shapes = shapesOf(
      frameOf([], { stroke: stroke({ sides: ['bottom'], offset: 4, align: 'center' }) }),
    );
    expect((shapes[0] as Konva.Line).points()).toEqual([0, 44, 100, 44]);
  });
});

describe('stroke.sides com os quatro lados', () => {
  // A cena nunca traz os quatro lados (o `instantiate` os normaliza, MC0): o caminho é o do modelo.
  const sceneWith = (sides?: StrokeSide[]): Scene =>
    instantiate(
      {
        format: 'mapping-component',
        formatVersion: 4,
        id: 't',
        name: 'T',
        size: { width: 100, height: 40 },
        template: {
          type: 'frame',
          children: [
            {
              type: 'rect',
              width: 100,
              height: 40,
              cornerRadius: 8,
              stroke: { color: '#112233', width: 2, ...(sides ? { sides } : {}) },
            },
          ],
        },
      },
      {},
      { x: 0, y: 0, width: 100, height: 40 },
      { measure: approximateMeasurer },
    );

  it('desenha o contorno com raio, igual ao sides ausente', () => {
    const all = shapesOf(sceneWith(['top', 'right', 'bottom', 'left']));
    const none = shapesOf(sceneWith());
    expect(all.map((s) => s.className)).toEqual(none.map((s) => s.className));
    const ring = all.at(-1) as Konva.Rect;
    expect(ring.className).toBe('Rect');
    expect(ring.cornerRadius()).toEqual((none.at(-1) as Konva.Rect).cornerRadius());
    expect(ring.cornerRadius()).toBeGreaterThan(0);
    expect(all.map((s) => s.attrs)).toEqual(none.map((s) => s.attrs));
  });
});

describe('wrap "none" sem ellipsis', () => {
  const text = (align: 'left' | 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 30, height: 20 }),
    type: 'text',
    text: 'Texto bem comprido',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it.each(['left', 'center', 'right'] as const)(
    'align %s: o Text não leva width e o grupo recorta na caixa',
    (align) => {
      const result = renderScene(frameOf([text(align)]));
      const group = result.byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      expect(shape.attrs.width).toBeUndefined();
      const calls: number[][] = [];
      const ctx = {
        beginPath: () => undefined,
        closePath: () => undefined,
        rect: (...args: number[]) => calls.push(args),
      } as unknown as CanvasRenderingContext2D;
      const clip = group.clipFunc();
      expect(clip).toBeTypeOf('function');
      clip?.(ctx as never, group as never);
      expect(calls).toEqual([[0, -10000, 30, 20000]]);
    },
  );

  it('com ellipsis o Text continua com a largura, mais a folga da quebra (o Konva põe o …)', () => {
    const node = text('left');
    const withEllipsis: TextNode = { ...node, style: { ...node.style, ellipsis: true } };
    const group = renderScene(frameOf([withEllipsis])).byId.get('t') as Konva.Group;
    expect((group.find('Text')[0] as Konva.Text).attrs.width).toBe(30.5);
    expect(group.clipFunc()).toBeUndefined();
  });
});

describe('texto cortado de vários parágrafos (MC0, decisão 30)', () => {
  // O canvas falso mede 6 px por caractere: a 1ª linha tem 108 px, a 2ª 30; a caixa, 50.
  const two = (align: 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 50, height: 40 }),
    type: 'text',
    text: 'Texto bem comprido\ncurto',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it.each(['center', 'right'] as const)(
    'align %s: o começo de cada linha é o do cutLineLeft',
    (align) => {
      const group = renderScene(frameOf([two(align)])).byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      const block = shape.width();
      expect(shape.textArr.map((line) => line.width)).toEqual([108, 30]);
      for (const line of shape.textArr) {
        // O Konva alinha cada linha dentro do bloco (a largura do Text) e o Text começa em x.
        const inBlock =
          align === 'center' ? (block - line.width) / 2 : block - line.width;
        expect(shape.x() + inBlock).toBeCloseTo(
          cutLineLeft(align, 50, block, line.width),
          6,
        );
      }
    },
  );
});

describe('visibleLineCount contra o textArr do Konva em alturas limítrofes (MC0, decisão 31)', () => {
  // lineHeight 14,3 / fontSize 11: a soma acumulada em ponto flutuante não é n × lineHeight.
  const node = (height: number): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 100, height }),
    type: 'text',
    text: 'a\nb\nc\nd\ne\nf',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 11,
      fontWeight: 400,
      italic: false,
      lineHeight: 14.3,
      align: 'left',
      verticalAlign: 'top',
    },
  });
  const lh = konvaLineHeight(14.3, 11);

  it.each([1, 2, 3, 4, 5])(
    'a caixa de %i linhas (e um pouco menos ou mais) tem as linhas do visibleLineCount',
    (k) => {
      for (const height of [k * lh - 0.01, k * lh, k * lh + 0.01, (k + 0.5) * lh]) {
        const group = renderScene(frameOf([node(height)])).byId.get('t') as Konva.Group;
        const shape = group.find('Text')[0] as Konva.Text;
        expect(shape.textArr.length, `altura ${height}`).toBe(
          visibleLineCount(6, height, lh),
        );
      }
    },
  );
});

describe('só as linhas que cabem na altura (MC0, decisão 31)', () => {
  const lines = (height: number): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 100, height }),
    type: 'text',
    text: 'a\nb\nc\nd',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
    },
  });

  it.each([
    [20, 1],
    [40, 2],
    [50, 2],
  ])(
    'a caixa de %i px tem %i linhas no textArr, como o visibleLineCount',
    (height, count) => {
      const group = renderScene(frameOf([lines(height)])).byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      expect(shape.textArr).toHaveLength(count);
      expect(visibleLineCount(4, height, konvaLineHeight(20, 10))).toBe(count);
    },
  );
});
