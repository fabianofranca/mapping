// FX4 no desenho da app: stroke.offset, wrap "none" cortado por pixel e quatro sides (decisões 17, 19 e 21).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
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
  it('desenha o contorno com raio, igual ao sides ausente', () => {
    const all = shapesOf(
      frameOf([], {
        cornerRadius: 8,
        stroke: stroke({ sides: ['top', 'right', 'bottom', 'left'] }),
      }),
    );
    const none = shapesOf(frameOf([], { cornerRadius: 8, stroke: stroke() }));
    expect(all.map((s) => s.className)).toEqual(['Rect']);
    expect((all[0] as Konva.Rect).cornerRadius()).toEqual(8);
    expect(all[0]?.attrs).toEqual(none[0]?.attrs);
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
