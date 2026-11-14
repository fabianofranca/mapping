// L2 (#1078): the child of a slot with `clip` is clipped by the box of the parent slot in the component
// layer; without `clip` the node is the usual one, and the screen pixel drawing ignores the clip.
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

/** The rectangle that the node clip function traces (container space). */
function clipRect(node: Konva.Group): number[] | null {
  const fn = node.clipFunc();
  if (!fn) return null;
  const rects: number[][] = [];
  const ctx = {
    beginPath() {},
    closePath() {},
    rect: (...a: number[]) => rects.push(a),
  };
  fn(ctx as unknown as Parameters<typeof fn>[0], node);
  return rects[0] ?? null;
}

describe('clipping the child of a slot with clip', () => {
  it('clips the child node by the slot box', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toEqual([20, 5, 30, 40]);
  });

  it('without clip the node is not clipped and stays the scene one', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a')]]), all, PLACEMENTS);
    const node = nodeOf('a');
    expect(clipRect(node)).toBeNull();
    expect(node.name()).toBe('a');
    expect(node.x()).toBe(10);
  });

  it('the clip changed: the new drawing redoes the node with the new clip', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    const before = nodeOf('a');
    const next = child('a', { clip: { x: 0, y: 0, width: 60, height: 10 } });
    expect(layer.render(new Map([['a', next]]), all, PLACEMENTS)).toBe(true);
    const after = nodeOf('a');
    expect(after).not.toBe(before);
    expect(clipRect(after)).toEqual([0, 0, 60, 10]);
  });

  it('the clip disappears when the drawing no longer has a clip', () => {
    const { layer, nodeOf } = setup();
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS);
    layer.render(new Map([['a', child('a')]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toBeNull();
  });

  it('the same drawing object does not redo the node (pan and zoom)', () => {
    const { layer, nodeOf } = setup();
    const d = child('a', { clip: CLIP });
    layer.render(new Map([['a', d]]), all, PLACEMENTS);
    const before = nodeOf('a');
    expect(layer.render(new Map([['a', d]]), all, PLACEMENTS, 2)).toBe(false);
    expect(nodeOf('a')).toBe(before);
  });

  it('a screen pixel drawing ignores the clip', () => {
    const { layer, nodeOf } = setup();
    const screen = {
      anchor: 'top-left' as const,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };
    layer.render(new Map([['a', child('a', { clip: CLIP, screen })]]), all, PLACEMENTS);
    expect(clipRect(nodeOf('a'))).toBeNull();
  });

  it('the drag takes the clipped node to the drag group and back', () => {
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

  it('the child whose visible part (box ∩ clip) is off the screen is not born', () => {
    const { layer } = setup();
    // with the 64 margin, the child box (10..110) reaches the screen (x ≥ 120), the clip (20..50) does not
    const area: Rect = { x: 120, y: 0, width: 180, height: 100 };
    layer.render(new Map([['a', child('a', { clip: CLIP })]]), all, PLACEMENTS, 1, area);
    expect(layer.mountedCount).toBe(0);
    layer.render(new Map([['b', child('b')]]), all, PLACEMENTS, 1, area);
    expect(layer.mountedCount).toBe(1);
  });
});
