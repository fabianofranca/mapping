// Owner decision 23: the child of a slot with `clip` inside a rounded frame is cut by the rounded
// shape too (`clipShape`), one nested clip group per shape; without `clipShape` nothing changes.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  type LayerDrawing,
  ComponentLayerRenderer,
} from '../../../src/canvas/components/componentLayer';
import type { Placement, Rect } from '../../../src/model';
import type { ClipShape } from '../../../src/model/componentDrawings';
import { type FrameNode, baseNode, translate } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['img-1', { x: 0, y: 0, scale: 1 }],
]);
const all = () => true;
const CLIP: Rect = { x: 10, y: 10, width: 100, height: 40 };

function child(extra: Partial<LayerDrawing> = {}): LayerDrawing {
  const root: FrameNode = {
    ...baseNode({
      id: 'a',
      name: 'a',
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
  return { markingId: 'a', containerId: 'img-1', root, clip: CLIP, ...extra };
}

function mount(drawing: LayerDrawing): Konva.Group {
  const parent = new Konva.Group();
  new ComponentLayerRenderer(parent).render(new Map([['a', drawing]]), all, PLACEMENTS);
  return parent.find((n: Konva.Node) => n.getAttr('markingId') === 'a')[0] as Konva.Group;
}

type Op = [string, ...number[]];

/** The path calls that a group's clip function traces. */
function trace(node: Konva.Group): Op[] {
  const fn = node.clipFunc();
  const ops: Op[] = [];
  if (!fn) return ops;
  const rec =
    (name: string) =>
    (...a: number[]) =>
      ops.push([name, ...a]);
  const ctx = {
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    rect: rec('rect'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arcTo: rec('arcTo'),
  };
  fn(ctx as unknown as Parameters<typeof fn>[0], node);
  return ops;
}

/** The clipping groups from the outermost to the innermost (the one that holds the scene). */
function clipGroups(outer: Konva.Group): Konva.Group[] {
  const list: Konva.Group[] = [];
  let at: Konva.Group | undefined = outer;
  while (at?.clipFunc()) {
    list.push(at);
    at = at.getChildren()[0] as Konva.Group | undefined;
  }
  return list;
}

const arcs = (ops: Op[]) => ops.filter(([n]) => n === 'arcTo');
const BOX: Rect = { x: 10, y: 10, width: 100, height: 40 };
const shape = (radius: ClipShape['radius'], box: Rect = BOX): ClipShape => ({
  box,
  radius,
});

describe('clipShape: the child is cut by the rounded shape (Konva)', () => {
  it('a radius shape adds a rounded clip group inside the rectangular one', () => {
    const groups = clipGroups(mount(child({ clipShape: [shape(16)] })));
    expect(groups).toHaveLength(2);
    expect(trace(groups[0]!)).toContainEqual(['rect', 10, 10, 100, 40]);
    const ops = trace(groups[1]!);
    expect(arcs(ops)).toHaveLength(4);
    expect(ops).toContainEqual(['moveTo', 26, 10]);
    expect(ops).toContainEqual(['lineTo', 94, 10]);
  });

  it('per-corner radii: only the corners with radius have an arc of that size', () => {
    const groups = clipGroups(mount(child({ clipShape: [shape([16, 0, 0, 16])] })));
    const radii = arcs(trace(groups[1]!)).map((o) => o[5]);
    // Arc order: top-right, bottom-right, bottom-left, top-left.
    expect(radii).toEqual([0, 0, 16, 16]);
  });

  it('a radius larger than half the smaller side is capped like the frame clip', () => {
    const groups = clipGroups(mount(child({ clipShape: [shape(500)] })));
    const radii = arcs(trace(groups[1]!)).map((o) => o[5]);
    expect(radii).toEqual([20, 20, 20, 20]);
  });

  it('two shapes (child of a child) nest: both cut', () => {
    const inner: Rect = { x: 20, y: 12, width: 60, height: 30 };
    const groups = clipGroups(mount(child({ clipShape: [shape(16), shape(8, inner)] })));
    expect(groups).toHaveLength(3);
    expect(trace(groups[2]!)).toContainEqual(['moveTo', 28, 12]);
  });

  it('without clipShape the clip function is the rectangular one (unchanged)', () => {
    const groups = clipGroups(mount(child()));
    expect(groups).toHaveLength(1);
    expect(trace(groups[0]!).filter(([n]) => n === 'arcTo')).toHaveLength(0);
    expect(trace(groups[0]!)).toContainEqual(['rect', 10, 10, 100, 40]);
  });

  it('a screen pixel drawing ignores the clip shape', () => {
    const screen = {
      anchor: 'top-left' as const,
      rect: { x: 0, y: 0, width: 100, height: 40 },
    };
    const node = mount(child({ screen, clipShape: [shape(16)] }));
    expect(clipGroups(node)).toHaveLength(0);
  });
});
