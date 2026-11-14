// The component layer: diff by identity of the drawings, order, visibility and image position.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { Placement } from '../../../src/model';
import {
  type FrameNode,
  type SceneNode,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function drawing(
  markingId: string,
  containerId: string | null = 'img-1',
  x = 0,
  color = '#ffffff',
): LayerDrawing {
  const root: FrameNode = {
    ...baseNode({
      id: markingId,
      name: markingId,
      width: 100,
      height: 40,
      transform: translate(x, 10),
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 4,
    fills: [{ type: 'solid', color }],
    children: [],
  };
  return { markingId, containerId: containerId, root };
}

function toMap(...list: LayerDrawing[]): Map<string, LayerDrawing> {
  return new Map(list.map((d) => [d.markingId, d]));
}

const all = () => true;
const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 50, y: 20, scale: 0.5 }],
  ['img-2', { x: 400, y: 0, scale: 2 }],
]);

function setup() {
  const parent = new Konva.Group();
  const layer = new ComponentLayerRenderer(parent);
  /** Nodes of the drawings of an image, in drawing order. */
  const nodes = (containerId: string): Konva.Node[] => {
    const group = parent
      .getChildren()
      .find((n: Konva.Node) => n.getAttr('containerId') === containerId) as
      Konva.Group | undefined;
    return group ? [...group.getChildren()] : [];
  };
  return { parent, layer, nodes };
}

describe('ComponentLayerRenderer', () => {
  it('does not draw a dashed outline for the slot of a container', () => {
    const { layer, nodes } = setup();
    const base = drawing('row');
    const slot: SceneNode = {
      ...baseNode({
        id: 'slot',
        name: 'slot',
        width: 80,
        height: 20,
        transform: translate(0, 0),
      }),
      type: 'unknown',
      sourceType: 'slot',
    };
    const root: FrameNode = { ...(base.root as FrameNode), fills: [], children: [slot] };
    layer.render(toMap({ ...base, root }), all, PLACEMENTS);
    const rects = (nodes('img-1')[0] as Konva.Group).find('Rect') as Konva.Rect[];
    expect(rects.some((r) => (r.dash() ?? []).length > 0)).toBe(false);
  });

  it('creates one group per image positioned by the placement, without events', () => {
    const { parent, layer, nodes } = setup();
    const changed = layer.render(
      toMap(drawing('a'), drawing('b', 'img-2'), drawing('c')),
      all,
      PLACEMENTS,
    );
    expect(changed).toBe(true);
    expect(parent.getChildren()).toHaveLength(2);
    const [first, second] = parent.getChildren() as Konva.Group[];
    expect(first?.position()).toEqual({ x: 50, y: 20 });
    expect(first?.scaleX()).toBe(0.5);
    expect(second?.scaleY()).toBe(2);
    expect(first?.listening()).toBe(false);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['a', 'c']);
    expect(nodes('img-2').map((n) => n.getAttr('markingId'))).toEqual(['b']);
    // Each node is the marking scene, in the image coordinates.
    expect(nodes('img-1')[0]?.listening()).toBe(false);
    expect(nodes('img-1')[0]?.position()).toEqual({ x: 0, y: 10 });
  });

  it('the same Map returns false and does not touch the nodes', () => {
    const { layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b'));
    layer.render(drawings, all, PLACEMENTS);
    const before = nodes('img-1');
    expect(layer.render(drawings, all, PLACEMENTS)).toBe(false);
    nodes('img-1').forEach((n, i) => expect(n).toBe(before[i]));
  });

  it('redoes only the drawing whose object changed (identity)', () => {
    const { layer, nodes } = setup();
    const a = drawing('a');
    const b = drawing('b');
    const c = drawing('c');
    layer.render(toMap(a, b, c), all, PLACEMENTS);
    const [na, nb, nc] = nodes('img-1');
    const b2 = drawing('b', 'img-1', 7, '#ff0000');
    expect(layer.render(toMap(a, b2, c), all, PLACEMENTS)).toBe(true);
    const after = nodes('img-1');
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(na);
    expect(after[2]).toBe(nc);
    expect(after[1]).not.toBe(nb);
    // The new node stayed at the same position in the drawing order.
    expect(after[1]?.getAttr('markingId')).toBe('b');
    expect(after[1]?.x()).toBe(7);
    expect(nb?.getParent()).toBeNull();
  });

  it('redoing a drawing creates only its nodes', () => {
    const add = vi.spyOn(Konva.Group.prototype, 'add');
    const { layer } = setup();
    const a = drawing('a');
    const b = drawing('b');
    layer.render(toMap(a, b), all, PLACEMENTS);
    add.mockClear();
    layer.render(toMap(a, drawing('b', 'img-1', 1)), all, PLACEMENTS);
    // An `add` of the fill inside the scene of b + one of the scene inside the image group.
    expect(add).toHaveBeenCalledTimes(2);
    add.mockRestore();
  });

  it('destroys the drawing that disappeared and the image group that became empty', () => {
    const { parent, layer, nodes } = setup();
    layer.render(toMap(drawing('a'), drawing('b', 'img-2')), all, PLACEMENTS);
    const [nb] = nodes('img-2');
    expect(layer.render(toMap(drawing('a')), all, PLACEMENTS)).toBe(true);
    expect(parent.getChildren()).toHaveLength(1);
    expect(nb?.getParent()).toBeNull();
    expect(nodes('img-2')).toEqual([]);
  });

  it('the Map order is the drawing order; reordering redoes the order without redoing the nodes', () => {
    const { layer, nodes } = setup();
    const a = drawing('a');
    const b = drawing('b');
    const c = drawing('c');
    layer.render(toMap(a, b, c), all, PLACEMENTS);
    const [na, nb, nc] = nodes('img-1');
    expect(layer.render(toMap(c, a, b), all, PLACEMENTS)).toBe(true);
    const after = nodes('img-1');
    expect(after[0]).toBe(nc);
    expect(after[1]).toBe(na);
    expect(after[2]).toBe(nb);
    expect(layer.render(toMap(c, a, b), all, PLACEMENTS)).toBe(false);
  });

  it('visible hides (destroys) and goes back to drawing', () => {
    const { layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b'));
    layer.render(drawings, all, PLACEMENTS);
    expect(layer.render(drawings, (d) => d.markingId !== 'a', PLACEMENTS)).toBe(true);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['b']);
    expect(layer.render(drawings, all, PLACEMENTS)).toBe(true);
    expect(nodes('img-1').map((n) => n.getAttr('markingId'))).toEqual(['a', 'b']);
  });

  it('changing the placement moves the group without redoing the drawings; an image without a placement does not draw', () => {
    const { parent, layer, nodes } = setup();
    const drawings = toMap(drawing('a'), drawing('b', 'img-2'));
    layer.render(drawings, all, PLACEMENTS);
    const [na] = nodes('img-1');
    const moved = new Map(PLACEMENTS).set('img-1', { x: 5, y: 6, scale: 1 });
    expect(layer.render(drawings, all, moved)).toBe(true);
    const group = na?.getParent();
    expect(group?.position()).toEqual({ x: 5, y: 6 });
    expect(group?.scaleX()).toBe(1);
    expect(nodes('img-1')[0]).toBe(na);

    const withoutSecond = new Map(moved);
    withoutSecond.delete('img-2');
    expect(layer.render(drawings, all, withoutSecond)).toBe(true);
    expect(parent.getChildren()).toHaveLength(1);
  });

  it('a marking that changes image is redone in the new group', () => {
    const { layer, nodes } = setup();
    layer.render(toMap(drawing('a')), all, PLACEMENTS);
    layer.render(toMap(drawing('a', 'img-2')), all, PLACEMENTS);
    expect(nodes('img-1')).toEqual([]);
    expect(nodes('img-2').map((n) => n.getAttr('markingId'))).toEqual(['a']);
  });

  it('destroy removes the layer groups and leaves the parent', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('a')), all, PLACEMENTS);
    layer.destroy();
    expect(parent.getChildren()).toHaveLength(0);
    expect(layer.render(new Map(), all, PLACEMENTS)).toBe(false);
  });

  it('passes the theme palette to the placeholder', () => {
    const parent = new Konva.Group();
    const layer = new ComponentLayerRenderer(parent, {
      placeholder: { unknownLine: '#00aa00' },
    });
    const root: FrameNode = {
      ...baseNode({ id: 'm', name: 'm', width: 50, height: 50 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [
        {
          ...baseNode({ id: 'u', name: 'u', width: 10, height: 10 }),
          type: 'unknown',
          sourceType: 'BLOB',
        },
      ],
    };
    layer.render(toMap({ markingId: 'm', containerId: 'img-1', root }), all, PLACEMENTS);
    const rects = parent.find('Rect') as Konva.Rect[];
    expect(rects.some((r) => r.stroke() === '#00aa00')).toBe(true);
  });
});

// Canvas marking (v13): null `containerId`, its group uses the identity position.
describe('ComponentLayerRenderer: canvas space', () => {
  it('draws in the canvas group with the identity position, without needing `placements`', () => {
    const { parent, layer } = setup();
    const canvasGroup = () =>
      parent.getChildren().find((n: Konva.Node) => n.getAttr('containerId') === '') as
        Konva.Group | undefined;
    const note = drawing('note', null, 30);
    expect(layer.render(toMap(note), all, new Map())).toBe(true);
    const group = canvasGroup();
    expect(group).toBeDefined();
    expect(group?.getChildren()).toHaveLength(1);
    expect(group?.x()).toBe(0);
    expect(group?.y()).toBe(0);
    expect(group?.scaleX()).toBe(1);
    // The containers keep their placement, and the identity diff holds in both.
    const inImage = drawing('m1');
    layer.render(toMap(note, inImage), all, PLACEMENTS);
    expect(layer.size).toBe(2);
    expect(layer.render(toMap(note, inImage), all, PLACEMENTS)).toBe(false);
    expect(canvasGroup()?.getChildren()).toHaveLength(1);
  });

  it('the canvas group disappears when there is no drawing of it anymore', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('note', null), drawing('m1')), all, PLACEMENTS);
    expect(parent.getChildren()).toHaveLength(2);
    layer.render(toMap(drawing('m1')), all, PLACEMENTS);
    expect(parent.getChildren()).toHaveLength(1);
    expect(layer.size).toBe(1);
  });

  it('the same marking that moves from the container to the canvas is redrawn in the new group', () => {
    const { parent, layer } = setup();
    layer.render(toMap(drawing('m1')), all, PLACEMENTS);
    layer.render(toMap(drawing('m1', null)), all, PLACEMENTS);
    expect(layer.size).toBe(1);
    const groups = parent.getChildren() as Konva.Group[];
    const owner = groups.find((g) => g.getChildren().length > 0);
    expect(owner?.getAttr('containerId')).toBe('');
  });

  it('the visibility filter separates the floating ones from the others (two layers)', () => {
    const lower = new Konva.Group();
    const upper = new Konva.Group();
    const below = new ComponentLayerRenderer(lower);
    const above = new ComponentLayerRenderer(upper);
    const floating = new Set(['note']);
    const drawings = toMap(drawing('m1'), drawing('note', null));
    below.render(drawings, (d) => !floating.has(d.markingId), PLACEMENTS);
    above.render(drawings, (d) => floating.has(d.markingId), PLACEMENTS);
    expect(below.size).toBe(1);
    expect(above.size).toBe(1);
    // The floating one stops being one: the drawing changes layer.
    floating.clear();
    below.render(drawings, (d) => !floating.has(d.markingId), PLACEMENTS);
    above.render(drawings, (d) => floating.has(d.markingId), PLACEMENTS);
    expect(below.size).toBe(2);
    expect(above.size).toBe(0);
  });

  describe('remote images', () => {
    const A = 'https://cdn.example.com/a.png';
    const B = 'https://cdn.example.com/b.png';
    /** Drawing of a marking with a remote image (the `image` node of the component). */
    function withImage(markingId: string, url?: string): LayerDrawing {
      const base = drawing(markingId);
      const image: SceneNode = {
        ...baseNode({ id: `${markingId}-img`, name: 'img', width: 40, height: 40 }),
        type: 'rect',
        cornerRadius: 0,
        fills: [
          url === undefined
            ? { type: 'solid', color: '#111111' }
            : { type: 'image', url },
        ],
      };
      return {
        ...base,
        root: { ...(base.root as FrameNode), fills: [], children: [image] },
      };
    }
    const ready = { state: 'loaded', image: { width: 10, height: 10 } } as never;

    function imageSetup() {
      const states = new Map<string, unknown>();
      const resolve = vi.fn((url: string) => states.get(url) ?? 'loading');
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent, { remoteImage: resolve as never });
      const nodeOf = (id: string) =>
        parent.find((n: Konva.Node) => n.getAttr('markingId') === id)[0] as Konva.Group;
      return { states, resolve, layer, nodeOf, parent };
    }

    it('asks the function for the image when drawing and shows the placeholder while it loads', () => {
      const { resolve, layer, nodeOf } = imageSetup();
      layer.render(toMap(withImage('a', A)), all, PLACEMENTS);
      expect(resolve).toHaveBeenCalledWith(A);
      expect(nodeOf('a').find('Image')).toHaveLength(0);
    });

    it('refreshImages redoes only the markings of the URL, at the same position in the order', () => {
      const { states, resolve, layer, nodeOf, parent } = imageSetup();
      layer.render(
        toMap(withImage('a', A), withImage('b', B), withImage('c', A), withImage('d')),
        all,
        PLACEMENTS,
      );
      const before = ['a', 'b', 'c', 'd'].map(nodeOf);
      resolve.mockClear();
      states.set(A, ready);
      expect(layer.refreshImages(new Set([A]))).toBe(true);
      expect(resolve).toHaveBeenCalledTimes(2);
      // b (another URL) and d (no image) stay; a and c are new nodes, already with the image.
      expect(nodeOf('b')).toBe(before[1]);
      expect(nodeOf('d')).toBe(before[3]);
      expect(nodeOf('a')).not.toBe(before[0]);
      expect(nodeOf('c')).not.toBe(before[2]);
      expect(nodeOf('a').find('Image')).toHaveLength(1);
      const group = parent.getChildren()[0] as Konva.Group;
      expect(
        group.getChildren().map((n: Konva.Node) => n.getAttr('markingId') as string),
      ).toEqual(['a', 'b', 'c', 'd']);
    });

    it('with null redoes all that use an image (the consent changed)', () => {
      const { resolve, layer } = imageSetup();
      layer.render(
        toMap(withImage('a', A), withImage('b', B), withImage('d')),
        all,
        PLACEMENTS,
      );
      resolve.mockClear();
      expect(layer.refreshImages(null)).toBe(true);
      expect(resolve.mock.calls.map(([u]) => u).sort()).toEqual([A, B]);
    });

    it('a URL that no marking uses redoes nothing', () => {
      const { resolve, layer } = imageSetup();
      layer.render(toMap(withImage('a', A), withImage('d')), all, PLACEMENTS);
      resolve.mockClear();
      expect(layer.refreshImages(new Set(['https://other.example.com/x.png']))).toBe(
        false,
      );
      expect(resolve).not.toHaveBeenCalled();
    });

    it('without the image function, the layer draws the placeholder and refreshImages redoes without throwing', () => {
      const parent = new Konva.Group();
      const layer = new ComponentLayerRenderer(parent);
      layer.render(toMap(withImage('a', A)), all, PLACEMENTS);
      expect(layer.refreshImages(null)).toBe(true);
      expect(parent.find('Image')).toHaveLength(0);
    });
  });
});
