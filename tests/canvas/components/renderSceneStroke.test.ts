// Format 4 in the drawing: cap/join, sides with a straight stroke and the enlarged clip of the root.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  type Stroke,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#112233' }],
  width: 2,
  align: 'center',
  ...extra,
});

function root(extra: Partial<FrameNode> = {}): Scene {
  const node: FrameNode = {
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [],
    ...extra,
  };
  return { root: node, warnings: [] };
}

function shapesOf(scene: Scene): Konva.Shape[] {
  return renderScene(scene).root.find('Shape') as Konva.Shape[];
}

describe('stroke with cap and join', () => {
  it('reach the shape (lineCap/lineJoin)', () => {
    const [shape] = shapesOf(root({ stroke: stroke({ cap: 'round', join: 'round' }) }));
    expect(shape?.lineCap()).toBe('round');
    expect(shape?.lineJoin()).toBe('round');
  });
});

describe('stroke per side (sides)', () => {
  it('["bottom"] on a 100×40 produces a single line, from (0,40) to (100,40), with the stroke width and color', () => {
    const shapes = shapesOf(root({ stroke: stroke({ sides: ['bottom'] }) }));
    expect(shapes).toHaveLength(1);
    const line = shapes[0] as Konva.Line;
    expect(line.className).toBe('Line');
    expect(line.points()).toEqual([0, 40, 100, 40]);
    expect(line.strokeWidth()).toBe(2);
    expect(line.stroke()).toBe('#112233');
  });

  it('with cornerRadius and ["top"] the stroke is straight, without an arc at the corner', () => {
    const shapes = shapesOf(
      root({ cornerRadius: 8, stroke: stroke({ sides: ['top'], align: 'inside' }) }),
    );
    expect(shapes.map((s) => s.className)).toEqual(['Line']);
    expect((shapes[0] as Konva.Line).points()).toEqual([0, 1, 100, 1]);
  });

  it('two sides are two lines, with the stroke cap and join', () => {
    const shapes = shapesOf(
      root({ stroke: stroke({ sides: ['left', 'right'], cap: 'square' }) }),
    );
    expect(shapes.map((s) => (s as Konva.Line).points())).toEqual([
      [0, 0, 0, 40],
      [100, 0, 100, 40],
    ]);
    expect(shapes[0]?.lineCap()).toBe('square');
  });
});

describe('enlarged clip of the root', () => {
  function clipRect(scene: Scene): number[] {
    const group = renderScene(scene).root;
    const calls: number[][] = [];
    const ctx = {
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arcTo() {},
      rect: (...a: number[]) => calls.push(a),
    };
    const clip = group.clipFunc() as unknown as ((c: Konva.Context) => void) | undefined;
    clip?.(ctx as unknown as Konva.Context);
    return calls[0] ?? [];
  }

  it('with clipBox the clip is the enlarged rectangle', () => {
    const scene = root({
      clip: true,
      clipBox: { x: -4, y: -4, width: 108, height: 48 },
      stroke: stroke({ width: 4, align: 'outside' }),
    });
    expect(clipRect(scene)).toEqual([-4, -4, 108, 48]);
  });

  it('without clipBox the clip follows the rounded box', () => {
    const group = renderScene(root({ clip: true, cornerRadius: 8 })).root;
    expect(group.clipFunc()).toBeDefined();
    expect(clipRect(root({ clip: true, cornerRadius: 8 }))).toEqual([]);
  });
});

describe('enlarged clip of a frame with a radius (1.6 of the retest)', () => {
  it('the children come out in a group clipped by the shape, not by the enlarged rectangle', () => {
    const child: FrameNode = {
      ...baseNode({ id: 'c', name: 'c', width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [],
    };
    const group = renderScene(
      root({
        clip: true,
        clipBox: { x: -4, y: -4, width: 108, height: 48 },
        cornerRadius: 8,
        children: [child],
      }),
    ).root;
    const rects: number[][] = [];
    const arcs: number[] = [];
    const ctx = {
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arcTo: () => arcs.push(1),
      rect: (...a: number[]) => rects.push(a),
    } as unknown as Konva.Context;
    (group.clipFunc() as (c: Konva.Context) => void)(ctx);
    expect(rects).toEqual([[-4, -4, 108, 48]]);
    const holder = group.getChildren(
      (n) => n.getClassName() === 'Group',
    )[0] as Konva.Group;
    rects.length = 0;
    (holder.clipFunc() as (c: Konva.Context) => void)(ctx);
    expect(rects).toEqual([]);
    expect(arcs.length).toBeGreaterThan(0);
  });
});
