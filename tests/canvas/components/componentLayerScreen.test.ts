// Desenho em pixels de tela (`screen`): tamanho fixo em qualquer zoom, ancorado no retângulo da
// marcação (que continua em pixels da imagem); e `stroke.scale: false` (traço em pixels de tela).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { Placement, Rect } from '../../../src/model';
import {
  type FrameNode,
  type Scene,
  type Stroke,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

type Anchor =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

const RECT: Rect = { x: 100, y: 60, width: 80, height: 20 };
const PLACEMENT: Placement = { x: 50, y: 20, scale: 0.5 };
const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([['img', PLACEMENT]]);

function screenDrawing(anchor: Anchor): LayerDrawing {
  const root: FrameNode = {
    ...baseNode({ id: 'm', name: 'm', width: 120, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [],
  };
  return { markingId: 'm', containerId: 'img', root, screen: { anchor, rect: RECT } };
}

/** O nó desenhado, com um grupo-pai que faz o papel do stage (escala = zoom). */
function draw(drawing: LayerDrawing, zoom: number) {
  const stage = new Konva.Group({ scaleX: zoom, scaleY: zoom });
  const layer = new ComponentLayerRenderer(stage);
  layer.render(new Map([[drawing.markingId, drawing]]), () => true, PLACEMENTS, zoom);
  const image = stage.getChildren()[0] as Konva.Group;
  const node = image.getChildren()[0] as Konva.Group;
  /** Pixels de tela (stage na origem) de um ponto do desenho (px locais). */
  const screenOf = (x: number, y: number) => node.getAbsoluteTransform().point({ x, y });
  return { layer, stage, node, screenOf };
}

/** Pixels de tela de um ponto do retângulo da marcação (px da imagem). */
function rectPoint(zoom: number, fx: number, fy: number) {
  return {
    x: zoom * (PLACEMENT.x + PLACEMENT.scale * (RECT.x + fx * RECT.width)),
    y: zoom * (PLACEMENT.y + PLACEMENT.scale * (RECT.y + fy * RECT.height)),
  };
}

describe('desenho com screen', () => {
  it.each([0.25, 4])(
    'top-left: mede 120×40 px de tela e fica no canto do retângulo (zoom %s)',
    (zoom) => {
      const { screenOf } = draw(screenDrawing('top-left'), zoom);
      const a = screenOf(0, 0);
      const b = screenOf(120, 40);
      expect(b.x - a.x).toBeCloseTo(120, 6);
      expect(b.y - a.y).toBeCloseTo(40, 6);
      const corner = rectPoint(zoom, 0, 0);
      expect(a.x).toBeCloseTo(corner.x, 6);
      expect(a.y).toBeCloseTo(corner.y, 6);
    },
  );

  const nine: readonly [Anchor, number, number][] = [
    ['top-left', 0, 0],
    ['top', 0.5, 0],
    ['top-right', 1, 0],
    ['left', 0, 0.5],
    ['center', 0.5, 0.5],
    ['right', 1, 0.5],
    ['bottom-left', 0, 1],
    ['bottom', 0.5, 1],
    ['bottom-right', 1, 1],
  ];

  it.each(nine)(
    'âncora %s: o ponto correspondente do desenho cai no do retângulo',
    (anchor, fx, fy) => {
      for (const zoom of [0.25, 1, 4]) {
        const { screenOf } = draw(screenDrawing(anchor), zoom);
        const at = screenOf(fx * 120, fy * 40);
        const target = rectPoint(zoom, fx, fy);
        expect(at.x).toBeCloseTo(target.x, 6);
        expect(at.y).toBeCloseTo(target.y, 6);
        // O tamanho segue fixo e o desenho pode passar do retângulo (80×20 px da imagem).
        const size = screenOf(120, 40);
        const origin = screenOf(0, 0);
        expect(size.x - origin.x).toBeCloseTo(120, 6);
      }
    },
  );

  it('trocar o zoom (setZoom) refaz só a escala, sem refazer o desenho', () => {
    const { layer, node, stage, screenOf } = draw(screenDrawing('center'), 1);
    stage.scale({ x: 4, y: 4 });
    expect(layer.setZoom(4)).toBe(true);
    expect(layer.setZoom(4)).toBe(false);
    const image = stage.getChildren()[0] as Konva.Group;
    expect(image.getChildren()[0]).toBe(node);
    const a = screenOf(0, 0);
    const b = screenOf(120, 40);
    expect(b.x - a.x).toBeCloseTo(120, 6);
    expect(b.y - a.y).toBeCloseTo(40, 6);
  });

  it('sem screen, o desenho escala com a imagem e o zoom', () => {
    const drawing: LayerDrawing = { ...screenDrawing('center'), screen: undefined };
    const { screenOf } = draw(drawing, 4);
    expect(screenOf(120, 0).x - screenOf(0, 0).x).toBeCloseTo(120 * 0.5 * 4, 6);
  });
});

describe('stroke.scale', () => {
  const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
    paints: [{ type: 'solid', color: '#112233' }],
    width: 2,
    align: 'center',
    ...extra,
  });

  function strokeShape(extra: Partial<Stroke>): Konva.Shape {
    const node: FrameNode = {
      ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [],
      stroke: stroke(extra),
    };
    const scene: Scene = { root: node, warnings: [] };
    const parent = new Konva.Group();
    parent.add(renderScene(scene).root);
    return parent.find('Shape')[0] as Konva.Shape;
  }

  /** Largura do traço em pixels de tela com o stage em `zoom`. */
  function screenWidth(shape: Konva.Shape, zoom: number): number {
    const stage = shape.getParent()!.getParent() as Konva.Group;
    stage.scale({ x: zoom, y: zoom });
    return shape.strokeScaleEnabled() === false
      ? shape.strokeWidth()
      : shape.strokeWidth() * shape.getAbsoluteScale().x;
  }

  it.each([0.5, 4])('scale: false mede 2 px de tela (zoom %s)', (zoom) => {
    const shape = strokeShape({ scale: false });
    expect(shape.strokeScaleEnabled()).toBe(false);
    expect(screenWidth(shape, zoom)).toBe(2);
  });

  it('o padrão escala com o zoom', () => {
    const shape = strokeShape({});
    expect(shape.strokeScaleEnabled()).not.toBe(false);
    expect(screenWidth(shape, 0.5)).toBe(1);
    expect(screenWidth(shape, 4)).toBe(8);
  });

  it('scale: true escala como o padrão', () => {
    expect(strokeShape({ scale: true }).strokeScaleEnabled()).not.toBe(false);
  });
});
