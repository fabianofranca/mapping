// L2 (#1078): a filha de um slot com `clip` é recortada pela caixa do slot da mãe na camada de
// componentes; sem `clip` o nó é o de sempre, e o desenho em pixels de tela ignora o recorte.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { Placement, Rect } from '../../../src/model';
import { type FrameNode, baseNode, translate } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function child(markingId: string, extra: Partial<LayerDrawing> = {}): LayerDrawing {
  const root: FrameNode = {
    ...baseNode({
      id: markingId,
      name: markingId,
      width: 100,
      height: 40,
      transform: translate(10, 10),
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    fills: [{ type: 'solid', color: '#ff0000' }],
    children: [],
  };
  return { markingId, containerId: 'img-1', root, ...extra };
}

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 0, y: 0, scale: 1 }],
]);
const all = () => true;
const CLIP: Rect = { x: 20, y: 5, width: 30, height: 40 };

function setup() {
  const parent = new Konva.Group();
  const layer = new ComponentLayerRenderer(parent);
  const nodeOf = (id: string): Konva.Group =>
    parent.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as Konva.Group;
  return { parent, layer, nodeOf };
}

/** O retângulo que a função de recorte do nó traça (espaço do container). */
function clipRect(node: Konva.Group): number[] | null {
  const fn = node.clipFunc();
  if (!fn) return null;
  const rects: number[][] = [];
  const ctx = {
    beginPath() {},
    closePath() {},
    rect: (...a: number[]) => rects.push(a),
  };
  fn(ctx as unknown as Konva.Context);
  return rects[0] ?? null;
}

describe('recorte da filha de um slot com clip', () => {
  it('recorta o nó da filha pela caixa do slot', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toEqual([20, 5, 30, 40]);
  });

  it('sem clip o nó não é recortado e continua sendo o da cena', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a')]]), all, PLACEMENTS);
    const node = nodeOf('a');
    expect(clipRect(node)).toBeNull();
    expect(node.name()).toBe('a');
    expect(node.x()).toBe(10);
  });

  it('o clip mudou: o desenho novo refaz o nó com o recorte novo', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    const before = nodeOf('a');
    const next = child('a', { clip: { x: 0, y: 0, width: 60, height: 10 } });
    expect(layer.render(new Map([['a', next]]), all, PLACEMENTS)).toBe(true);
    const after = nodeOf('a');
    expect(after).not.toBe(before);
    expect(clipRect(after)).toEqual([0, 0, 60, 10]);
  });

  it('o recorte some quando o desenho deixa de ter clip', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    layer.render(new Map([['a', child('a')]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toBeNull();
  });

  it('o mesmo objeto de desenho não refaz o nó (pan e zoom)', () => {
    const { layer, nodeOf } = setup();
    const d = child('a', { clip: CLIP });
    layer.render(new Map([['a', d]]), all, PLACEMENTS);
    const before = nodeOf('a');
    expect(layer.render(new Map([['a', d]]), all, PLACEMENTS, 2)).toBe(false);
    expect(nodeOf('a')).toBe(before);
  });

  it('desenho em pixels de tela ignora o clip', () => {
    const { layer, nodeOf } = setup();
    const screen = {
      anchor: 'top-left' as const,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };
    layer.render(new Map([['a', child('a', { clip: CLIP, screen })]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toBeNull();
  });

  it('o arrasto leva o nó recortado para o grupo de arrasto e de volta', () => {
    const { layer, nodeOf } = setup();
    const d = child('a', { clip: CLIP });
    const target = new Konva.Group();
    layer.render(new Map([['a', d]]), all, PLACEMENTS);
    const node = nodeOf('a');
    layer.setDragged(new Set(['a']), target);
    layer.render(new Map([['a', d]]), all, PLACEMENTS);
    expect(target.find((n: Konva.Node) => n.getAttr('markingId') === 'a')[0]).toBe(node);
    expect(node.getParent()?.name()).toBe('component-layer-drag');
    layer.setDragged(null, target);
    layer.render(new Map([['a', d]]), all, PLACEMENTS);
    expect(node.getParent()?.name()).toBe('component-layer-image');
    expect(clipRect(node)).toEqual([20, 5, 30, 40]);
  });

  it('a filha cuja parte visível (caixa ∩ clip) está fora da tela não nasce', () => {
    const { layer } = setup();
    // a caixa da filha (10..110) cruza a tela (80..300), mas o clip (20..50) não
    const area: Rect = { x: 80, y: 0, width: 220, height: 100 };
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS, 1, area);
    expect(layer.mountedCount).toBe(0);
    layer.render(new Map([['b', child('b')]]), all, PLACEMENTS, 1, area);
    expect(layer.mountedCount).toBe(1);
  });
});
