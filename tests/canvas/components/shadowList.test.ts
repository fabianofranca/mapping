// MF2 in Konva: the shadow list (each in its own shape, the first on top), the "only the first
// outer shadow" warning that goes away, the `spread` (shape and radii), the shadow that comes back through the
// offset (with rotation and zoom) and the outline with a gap (`stroke.gaps`).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  baseNode,
  type SceneNode,
  type Shadow,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const shadow = (extra: Partial<Shadow> = {}): Shadow => ({
  color: '#000000',
  offset: { x: 0, y: 2 },
  blur: 4,
  ...extra,
});

const card = (effects: Shadow[], radius = 8): SceneNode => ({
  ...baseNode({
    id: 'c',
    name: 'c',
    width: 40,
    height: 20,
    effects,
    fills: [{ type: 'solid', color: '#ffffff80' }],
  }),
  type: 'rect',
  cornerRadius: radius,
});

/**
 * The shadow shapes of the group: the `Konva.Shape`s that do not listen to the pointer (the node
 * shapes do), in drawing order, the last shadow of the list first.
 */
const casters = (group: Konva.Group): Konva.Shape[] =>
  group
    .getChildren()
    .filter((c): c is Konva.Shape => c instanceof Konva.Shape && !c.listening());

describe('shadow list (decision 3)', () => {
  it('two outer shadows draw both, without the only-the-first warning', () => {
    const first = shadow({ color: '#111111' });
    const second = shadow({ color: '#222222', blur: 8 });
    const { byId, warnings } = renderScene({ root: card([first, second]), warnings: [] });
    expect(warnings).toEqual([]);
    const group = byId.get('c')!;
    const list = casters(group);
    expect(list).toHaveLength(2);
    // The first of the list stays on top: the last one comes first in drawing order.
    const colors = list.map((c) => {
      const { native } = recorder({ a: 1, b: 0, c: 0, d: 1 });
      (c.sceneFunc() as (ctx: unknown, shape: unknown) => void)({ _context: native }, c);
      return native.shadowColor;
    });
    expect(colors).toEqual(['#222222', '#111111']);
    // The node shape carries no shadow of its own (its color does not change) and comes after the shadows.
    const fill = group.getChildren().at(-1) as Konva.Rect;
    expect(fill.fill()).toBe('#ffffff80');
    expect(fill.shadowBlur()).toBe(0);
    expect(list.every((c) => !c.listening())).toBe(true);
  });

  it('a shadow without spread stays on the shape itself, as always', () => {
    const { byId } = renderScene({ root: card([shadow()]), warnings: [] });
    const group = byId.get('c')!;
    expect(casters(group)).toHaveLength(0);
    expect((group.getChildren()[0] as Konva.Rect).shadowBlur()).toBe(4);
  });

  it('the inner shadow is still ignored with a warning, and the outer ones apply', () => {
    const { warnings, byId } = renderScene({
      root: card([shadow({ inner: true }), shadow(), shadow()]),
      warnings: [],
    });
    expect(warnings).toEqual([{ code: 'inner-shadow' }]);
    expect(casters(byId.get('c')!)).toHaveLength(2);
  });
});

/** A 2D context that records what the shadow shape does. */
function recorder(matrix: { a: number; b: number; c: number; d: number }) {
  const calls: [string, ...number[]][] = [];
  const note =
    (name: string) =>
    (...args: number[]) =>
      void calls.push([name, ...args]);
  const native = {
    canvas: { width: 800, height: 600 },
    getTransform: () => matrix,
    save: note('save'),
    restore: note('restore'),
    translate: note('translate'),
    beginPath: note('beginPath'),
    moveTo: note('moveTo'),
    lineTo: note('lineTo'),
    arcTo: note('arcTo'),
    closePath: note('closePath'),
    ellipse: note('ellipse'),
    fill: note('fill'),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
  };
  return { native, calls };
}

function draw(
  effects: Shadow[],
  matrix: { a: number; b: number; c: number; d: number },
  node = card(effects),
) {
  const { byId } = renderScene({ root: node, warnings: [] });
  // The shape of the first shadow of the list (the one on top).
  const caster = casters(byId.get('c')!).at(-1);
  const { native, calls } = recorder(matrix);
  const fn = caster!.sceneFunc() as (ctx: unknown, shape: unknown) => void;
  fn({ _context: native }, caster);
  return { native, calls };
}

describe('the shadow that comes back through the offset', () => {
  const I = { a: 1, b: 0, c: 0, d: 1 };
  /** Where the shape origin lands on the screen plus the shadow offset, minus the shape one. */
  const net = (
    native: ReturnType<typeof recorder>['native'],
    calls: ReturnType<typeof recorder>['calls'],
    m: typeof I,
  ) => {
    const t = calls.find(([name]) => name === 'translate')!;
    const [tx, ty] = [t[1]!, t[2]!];
    return {
      // The box starts at (−spread, −spread), in local space; what is left is the pure offset.
      x: native.shadowOffsetX + m.a * tx + m.c * ty,
      y: native.shadowOffsetY + m.b * tx + m.d * ty,
    };
  };

  it.each([
    ['no rotation', I],
    ['rotated 90°', { a: 0, b: 1, c: -1, d: 0 }],
    ['with zoom 2', { a: 2, b: 0, c: 0, d: 2 }],
    ['rotated 30° with zoom 1.5', { a: 1.3, b: 0.75, c: -0.75, d: 1.3 }],
  ])(
    'the shape lands far from the screen and the shadow comes back into place: %s',
    (_name, m) => {
      const first = shadow({ offset: { x: 3, y: 5 }, blur: 6 });
      const { native, calls } = draw([first, shadow()], m);
      const sx = Math.hypot(m.a, m.b);
      const sy = Math.hypot(m.c, m.d);
      const result = net(native, calls, m);
      expect(result.x).toBeCloseTo(3 * sx, 6);
      expect(result.y).toBeCloseTo(5 * sy, 6);
      // Far away: the shape offset goes past the whole screen.
      const t = calls.find(([name]) => name === 'translate')!;
      expect(Math.hypot(m.a * t[1]!, m.b * t[1]!)).toBeGreaterThan(800 + 600);
      expect(native.shadowBlur).toBeCloseTo(6 * Math.min(sx, sy), 6);
      expect(native.shadowColor).toBe('#000000');
    },
  );
});

describe('shadow.spread in Konva (decision 4)', () => {
  const I = { a: 1, b: 0, c: 0, d: 1 };

  it('the shape grows the spread on each side, with the radii plus the spread', () => {
    const { calls } = draw([shadow({ spread: 3, blur: 0, offset: { x: 0, y: 0 } })], I);
    const moves = calls.filter(([name]) => name === 'moveTo');
    // Box 46 × 26 and radius 8 + 3 = 11: the path opens at (11, 0), in the shape space.
    expect(moves[0]).toEqual(['moveTo', 11, 0]);
    const lines = calls.filter(([name]) => name === 'lineTo');
    expect(lines[0]).toEqual(['lineTo', 46 - 11, 0]);
  });

  it('a negative spread shrinks the shape; it disappears when it passes half', () => {
    const small = draw([shadow({ spread: -4, offset: { x: 0, y: 0 } })], I).calls;
    expect(small.find(([name]) => name === 'moveTo')).toEqual(['moveTo', 4, 0]);
    // 40 × 20 with spread −10 becomes 20 × 0: nothing to draw.
    const gone = draw([shadow({ spread: -10 })], I).calls;
    expect(gone.some(([name]) => name === 'fill')).toBe(false);
  });

  it('a straight corner stays straight with the spread', () => {
    const { calls } = draw([shadow({ spread: 3 })], I, card([shadow({ spread: 3 })], 0));
    expect(calls.find(([name]) => name === 'moveTo')).toEqual(['moveTo', 0, 0]);
  });

  it('a shadow with positive spread without blur or offset still draws (it is a ring)', () => {
    const { calls } = draw([shadow({ spread: 3, blur: 0, offset: { x: 0, y: 0 } })], I);
    expect(calls.some(([name]) => name === 'fill')).toBe(true);
  });

  it('the ellipse carries the shadow through the grown ellipse', () => {
    const ellipse: SceneNode = {
      ...baseNode({
        id: 'c',
        name: 'c',
        width: 20,
        height: 10,
        fills: [{ type: 'solid', color: '#ffffff' }],
        effects: [shadow({ spread: 2 }), shadow()],
      }),
      type: 'ellipse',
    };
    const { calls } = draw([], I, ellipse);
    expect(calls.find(([name]) => name === 'ellipse')).toEqual([
      'ellipse',
      12,
      7,
      12,
      7,
      0,
      0,
      Math.PI * 2,
    ]);
  });
});

describe('outline with a gap in Konva (decision 7)', () => {
  it('the outline becomes open lines that skip the gap, without the closed shape', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'o', name: 'o', width: 100, height: 40 }),
      type: 'rect',
      cornerRadius: 6,
      stroke: {
        paints: [{ type: 'solid', color: '#ff0000' }],
        width: 2,
        align: 'center',
        gaps: [{ side: 'top', from: 20, to: 50 }],
      },
    };
    const { byId } = renderScene({ root: node, warnings: [] });
    const shapes = byId.get('o')!.getChildren();
    expect(shapes.every((s) => s instanceof Konva.Line)).toBe(true);
    expect(shapes).toHaveLength(1);
    const line = shapes[0] as Konva.Line;
    expect(line.closed()).toBe(false);
    expect(line.stroke()).toBe('#ff0000');
    const points = line.points();
    // Starts where the gap ends (50, 0) and ends where it starts (20, 0).
    expect(points.slice(0, 2)).toEqual([50, 0]);
    expect(points.slice(-2)).toEqual([20, 0]);
  });

  it('without gaps the outline is the usual rectangle', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'o', name: 'o', width: 100, height: 40 }),
      type: 'rect',
      cornerRadius: 6,
      stroke: {
        paints: [{ type: 'solid', color: '#ff0000' }],
        width: 2,
        align: 'center',
      },
    };
    const { byId } = renderScene({ root: node, warnings: [] });
    expect(byId.get('o')!.getChildren()[0]).toBeInstanceOf(Konva.Rect);
  });
});
