// Glued strips of a `row` (weights 1:2:1) leave no light thread at the seam: the edges of the
// solid rectangles without rounded corners fall on whole device pixels, at any zoom.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type RectNode,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function bar(id: string, x: number, width: number, color: string): RectNode {
  return {
    ...baseNode({ id, name: id, width, height: 30, transform: translate(x, 0) }),
    type: 'rect',
    cornerRadius: 0,
    fills: [{ type: 'solid', color }],
  };
}

const row: FrameNode = {
  ...baseNode({ id: 'row', name: 'row', width: 200, height: 30 }),
  type: 'frame',
  clip: true,
  cornerRadius: 0,
  children: [
    bar('a', 0, 50, '#B3261E'),
    bar('b', 50, 100, '#1565C0'),
    bar('c', 150, 50, '#1B5E20'),
  ],
};

interface Recorded {
  readonly rects: { x: number; y: number; width: number; height: number }[];
}

/** Draws the rectangle `id` in a fake context with the `scale` and `pixelRatio` matrix, recording the `rect`. */
function drawn(id: string, scale: number, offset: number, pixelRatio = 1): Recorded {
  const { byId } = renderScene({ root: row, warnings: [] });
  const shape = byId.get(id)!.findOne('Rect')!;
  const m = { a: scale * pixelRatio, b: 0, c: 0, d: scale * pixelRatio, e: offset, f: 0 };
  // The node matrix inside the scene (the `bar` translation) and the world one (scale + offset).
  const node = byId.get(id)!;
  const world = {
    ...m,
    e: m.e + m.a * node.x(),
    f: m.f + m.d * node.y(),
  };
  const out: Recorded = { rects: [] };
  const ctx = {
    _context: { getTransform: () => world },
    beginPath: () => undefined,
    closePath: () => undefined,
    rect: (x: number, y: number, width: number, height: number) =>
      out.rects.push({ x, y, width, height }),
    fillStrokeShape: () => undefined,
    fillShape: () => undefined,
  };
  (shape as unknown as { _sceneFunc(c: unknown): void })._sceneFunc(ctx);
  return out;
}

/** The left and right edges of the rectangle, in device pixels. */
function deviceEdges(id: string, scale: number, offset: number, pixelRatio = 1) {
  const [r] = drawn(id, scale, offset, pixelRatio).rects;
  const node = renderScene({ root: row, warnings: [] }).byId.get(id)!;
  const a = scale * pixelRatio;
  const e = offset + a * node.x();
  return [e + a * r!.x, e + a * (r!.x + r!.width)];
}

describe('renderScene: seam between neighboring solid rectangles', () => {
  for (const scale of [1, 1.37, 0.83, 2.2]) {
    it(`edges on whole device pixels (zoom ${scale})`, () => {
      const edges = ['a', 'b', 'c'].map((id) => deviceEdges(id, scale, 10.3));
      for (const edge of edges.flat())
        expect(Math.abs(edge - Math.round(edge))).toBeLessThan(1e-6);
      // The seam is the same edge: the end of one strip is the start of the next.
      expect(edges[0]![1]).toBeCloseTo(edges[1]![0]!, 6);
      expect(edges[1]![1]).toBeCloseTo(edges[2]![0]!, 6);
    });
  }

  it('without a readable matrix (jsdom), draws the scene rectangle', () => {
    const { byId } = renderScene({ root: row, warnings: [] });
    const shape = byId.get('b')!.findOne('Rect') as Konva.Rect;
    const seen: number[][] = [];
    const ctx = {
      beginPath: () => undefined,
      closePath: () => undefined,
      rect: (...r: number[]) => seen.push(r),
      fillStrokeShape: () => undefined,
    };
    (shape as unknown as { _sceneFunc(c: unknown): void })._sceneFunc(ctx);
    expect(seen).toEqual([[0, 0, 100, 30]]);
  });
});
