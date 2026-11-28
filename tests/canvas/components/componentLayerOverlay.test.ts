// `overlay` (format 4, stage #2915, DG5): the layer draws a drawing's overlay nodes in a second pass,
// above every drawing of the same space. The overlay group is born, redone, hidden, moved in a drag and
// destroyed together with its marking.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { Placement, Rect } from '../../../src/model';
import {
  type FrameNode,
  type RectNode,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 50, y: 20, scale: 0.5 }],
]);
const all = () => true;

/** A frame with a fill and, when `withBar`, a scrollbar rect flagged `overlay`. */
function drawing(
  markingId: string,
  { withBar = false, x = 0 }: { withBar?: boolean; x?: number } = {},
): LayerDrawing {
  const bar: RectNode = {
    ...baseNode({
      id: `${markingId}-bar`,
      name: `${markingId}-bar`,
      width: 4,
      height: 80,
      transform: translate(96, 0),
      fills: [{ type: 'solid', color: '#6b7280' }],
    }),
    type: 'rect',
    cornerRadius: 0,
    overlay: true,
  };
  const root: FrameNode = {
    ...baseNode({
      id: markingId,
      name: markingId,
      width: 100,
      height: 80,
      transform: translate(x, 10),
      fills: [{ type: 'solid', color: '#ffffff' }],
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: withBar ? [bar] : [],
  };
  return { markingId, containerId: 'img-1', root };
}

const toMap = (...list: LayerDrawing[]) => new Map(list.map((d) => [d.markingId, d]));

function setup() {
  const parent = new Konva.Group();
  const layer = new ComponentLayerRenderer(parent);
  const group = (): Konva.Group =>
    parent
      .getChildren()
      .find((n: Konva.Node) => n.getAttr('containerId') === 'img-1') as Konva.Group;
  /** The group's children as `id` (the base) or `id+` (the overlay). */
  const order = (container: Konva.Container = group()): string[] =>
    container.getChildren().map((n: Konva.Node) => {
      const overlay = n.getAttr('overlayOf') as string | undefined;
      return overlay === undefined ? String(n.getAttr('markingId')) : `${overlay}+`;
    });
  return { parent, layer, group, order };
}

describe('ComponentLayerRenderer: overlay', () => {
  it('draws the overlay of a drawing after the drawings of the whole space', () => {
    const { layer, order } = setup();
    layer.render(
      toMap(drawing('scroll', { withBar: true }), drawing('block')),
      all,
      PLACEMENTS,
    );
    expect(order()).toEqual(['scroll', 'block', 'scroll+']);
  });

  it('a drawing without an overlay creates no extra group', () => {
    const { layer, order } = setup();
    layer.render(toMap(drawing('a'), drawing('b')), all, PLACEMENTS);
    expect(order()).toEqual(['a', 'b']);
  });

  it('the overlay group does not repeat the ancestors paint', () => {
    const { layer, group } = setup();
    layer.render(toMap(drawing('scroll', { withBar: true })), all, PLACEMENTS);
    const overlay = group()
      .getChildren()
      .find((n: Konva.Node) => n.getAttr('overlayOf') === 'scroll') as Konva.Group;
    const fills = overlay.find('Rect').map((r: Konva.Node) => (r as Konva.Rect).fill());
    expect(fills).toContain('#6b7280');
    expect(fills).not.toContain('#ffffff');
  });

  it('removing the marking destroys its overlay', () => {
    const { layer, order } = setup();
    layer.render(
      toMap(drawing('scroll', { withBar: true }), drawing('block')),
      all,
      PLACEMENTS,
    );
    layer.render(toMap(drawing('block')), all, PLACEMENTS);
    expect(order()).toEqual(['block']);
  });

  it('the redraw of the child keeps the order, and the overlay stays the same node', () => {
    const { layer, group, order } = setup();
    const scroll = drawing('scroll', { withBar: true });
    layer.render(toMap(scroll, drawing('block')), all, PLACEMENTS);
    const before = group().getChildren()[2];
    layer.render(toMap(scroll, drawing('block', { x: 5 })), all, PLACEMENTS);
    expect(order()).toEqual(['scroll', 'block', 'scroll+']);
    expect(group().getChildren()[2]).toBe(before);
  });

  it('a new drawing object redoes the overlay in the same place', () => {
    const { layer, group, order } = setup();
    const block = drawing('block');
    layer.render(toMap(drawing('scroll', { withBar: true }), block), all, PLACEMENTS);
    const before = group().getChildren()[2];
    layer.render(toMap(drawing('scroll', { withBar: true }), block), all, PLACEMENTS);
    expect(order()).toEqual(['scroll', 'block', 'scroll+']);
    expect(group().getChildren()[2]).not.toBe(before);
  });

  it('a drawing that loses its overlay drops the group', () => {
    const { layer, order } = setup();
    layer.render(toMap(drawing('scroll', { withBar: true })), all, PLACEMENTS);
    layer.render(toMap(drawing('scroll')), all, PLACEMENTS);
    expect(order()).toEqual(['scroll']);
  });

  it('a drag takes both groups to the drag group and brings them back', () => {
    const { layer, group, order } = setup();
    const scroll = drawing('scroll', { withBar: true });
    const block = drawing('block');
    const target = new Konva.Group();
    layer.render(toMap(scroll, block), all, PLACEMENTS);
    const [base, , overlay] = group().getChildren();
    layer.setDragged(new Set(['scroll']), target);
    layer.render(toMap(scroll, block), all, PLACEMENTS);
    expect(base?.getParent()?.name()).toBe('component-layer-drag');
    expect(overlay?.getParent()).toBe(base?.getParent());
    expect(order()).toEqual(['block']);
    expect(order(base?.getParent() as Konva.Group)).toEqual(['scroll', 'scroll+']);
    layer.setDragged(null, target);
    layer.render(toMap(scroll, block), all, PLACEMENTS);
    expect(order()).toEqual(['scroll', 'block', 'scroll+']);
    expect(base?.getParent()).toBe(group());
    expect(overlay?.getParent()).toBe(group());
  });

  it('out of view, neither the base nor the overlay is mounted; coming into view mounts both', () => {
    const { layer, order } = setup();
    const scroll = drawing('scroll', { withBar: true });
    const off: Rect = { x: 2000, y: 2000, width: 100, height: 100 };
    layer.render(toMap(scroll), all, PLACEMENTS, 1, off);
    expect(layer.mountedCount).toBe(0);
    expect(order()).toEqual([]);
    const on: Rect = { x: 0, y: 0, width: 300, height: 300 };
    expect(layer.reveal(on, 1)).toBe(true);
    expect(order()).toEqual(['scroll', 'scroll+']);
  });

  it('the overlay hides with its drawing when it leaves the view and shows again', () => {
    const { layer, group } = setup();
    const scroll = drawing('scroll', { withBar: true });
    const on: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const off: Rect = { x: 2000, y: 2000, width: 100, height: 100 };
    layer.render(toMap(scroll), all, PLACEMENTS, 1, on);
    const [base, overlay] = group().getChildren();
    layer.reveal(off, 1);
    expect(base?.visible()).toBe(false);
    expect(overlay?.visible()).toBe(false);
    layer.reveal(on, 1);
    expect(base?.visible()).toBe(true);
    expect(overlay?.visible()).toBe(true);
  });

  it('stays in the renderer parent (the floating layer keeps it in its own group)', () => {
    const floating = new Konva.Group();
    const layer = new ComponentLayerRenderer(floating);
    layer.render(toMap(drawing('scroll', { withBar: true })), all, PLACEMENTS);
    expect(floating.find('Rect').length).toBeGreaterThan(0);
    const owner = floating
      .getChildren()
      .find((n: Konva.Node) => n.getAttr('containerId') === 'img-1') as Konva.Group;
    expect(owner.getChildren().map((n: Konva.Node) => n.getAttr('overlayOf'))).toEqual([
      undefined,
      'scroll',
    ]);
  });

  it('the imageCount and the destroy cover the overlay', () => {
    const { layer, parent } = setup();
    layer.render(toMap(drawing('scroll', { withBar: true })), all, PLACEMENTS);
    layer.destroy();
    expect(parent.getChildren()).toHaveLength(0);
  });
});
