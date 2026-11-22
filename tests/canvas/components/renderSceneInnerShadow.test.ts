// DX2 in Konva: the inner shadow (CSS `inset`) — one shadow-only shape per shadow, above the fill
// and below the stroke, clipped by the outline, with `spread` and the offset; the warning only
// stays for a node that is not frame, rect or ellipse.
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

const inner = (extra: Partial<Shadow> = {}): Shadow => ({
  color: '#000000',
  offset: { x: 0, y: 2 },
  blur: 4,
  inner: true,
  ...extra,
});

function boxed(
  type: 'rect' | 'ellipse' | 'frame',
  effects: Shadow[],
  extra: Record<string, unknown> = {},
): SceneNode {
  return {
    ...baseNode({
      id: 'n',
      name: 'n',
      width: 40,
      height: 20,
      effects,
      fills: [{ type: 'solid', color: '#ffffff' }],
      ...extra,
    }),
    type,
    cornerRadius: 8,
    ...(type === 'frame' ? { clip: false, children: [] } : {}),
  } as SceneNode;
}

const innerShapes = (group: Konva.Group): Konva.Shape[] =>
  group
    .getChildren()
    .filter((c): c is Konva.Shape => (c as Konva.Node).getAttr('innerShadow') === true);

function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const note =
    (name: string) =>
    (...args: unknown[]) =>
      void calls.push([name, ...args]);
  const native = {
    canvas: { width: 800, height: 600 },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
    save: note('save'),
    restore: note('restore'),
    translate: note('translate'),
    beginPath: note('beginPath'),
    moveTo: note('moveTo'),
    lineTo: note('lineTo'),
    arcTo: note('arcTo'),
    closePath: note('closePath'),
    ellipse: note('ellipse'),
    rect: note('rect'),
    clip: note('clip'),
    fill: note('fill'),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
  };
  return { native, calls };
}

function draw(shape: Konva.Shape) {
  const rec = recorder();
  (shape.sceneFunc() as (ctx: unknown, shape: unknown) => void)(
    { _context: rec.native },
    shape,
  );
  return rec;
}

describe('inner shadow in Konva', () => {
  it('frame, rect and ellipse draw it with no warning', () => {
    for (const type of ['rect', 'ellipse', 'frame'] as const) {
      const { byId, warnings } = renderScene({
        root: boxed(type, [inner()]),
        warnings: [],
      });
      expect(warnings).toEqual([]);
      expect(innerShapes(byId.get('n')!)).toHaveLength(1);
    }
  });

  it('the order is fill, inner shadows (the first on top), stroke', () => {
    const root = boxed(
      'rect',
      [inner({ color: '#111111' }), inner({ color: '#222222' })],
      {
        stroke: {
          paints: [{ type: 'solid', color: '#ff0000' }],
          width: 2,
          align: 'inside',
        },
      },
    );
    const group = renderScene({ root, warnings: [] }).byId.get('n')!;
    const kinds = group
      .getChildren()
      .map((c) =>
        (c as Konva.Node).getAttr('innerShadow')
          ? 'inner'
          : c.listening()
            ? 'node'
            : 'other',
      );
    expect(kinds).toEqual(['node', 'inner', 'inner', 'node']);
    const colors = innerShapes(group).map((s) => draw(s).native.shadowColor);
    expect(colors).toEqual(['#222222', '#111111']);
  });

  it('clips to the outline and brings the shadow back through the offset', () => {
    const group = renderScene({
      root: boxed('rect', [inner({ offset: { x: 3, y: 5 }, blur: 6 })]),
      warnings: [],
    }).byId.get('n')!;
    const { native, calls } = draw(innerShapes(group)[0]!);
    const names = calls.map((c) => c[0]);
    expect(names.indexOf('clip')).toBeGreaterThan(-1);
    expect(names.indexOf('clip')).toBeLessThan(names.indexOf('fill'));
    expect(native.shadowBlur).toBe(6);
    // The ring is drawn far to the left; the offset brings it back by 3 px.
    expect(native.shadowOffsetX).toBeGreaterThan(3);
    expect(native.shadowOffsetY).toBe(5);
    expect(calls.find((c) => c[0] === 'fill')?.[1]).toBe('evenodd');
  });

  it('spread shrinks the hole on each side (the ellipse too)', () => {
    const group = renderScene({
      root: boxed('ellipse', [inner({ spread: 3 })]),
      warnings: [],
    }).byId.get('n')!;
    const { calls } = draw(innerShapes(group)[0]!);
    const ellipses = calls.filter((c) => c[0] === 'ellipse');
    // The clip is the whole ellipse; the hole is 3 px smaller on each side.
    expect(ellipses.map((c) => [c[3], c[4]])).toEqual([
      [20, 10],
      [17, 7],
    ]);
  });

  it('a hole that vanishes (spread at least half the size) shades the whole shape', () => {
    const group = renderScene({
      root: boxed('rect', [inner({ spread: 12 })]),
      warnings: [],
    }).byId.get('n')!;
    const { calls } = draw(innerShapes(group)[0]!);
    // Only the clip's outline: no second outline for the hole.
    expect(calls.filter((c) => c[0] === 'closePath')).toHaveLength(1);
    expect(calls.some((c) => c[0] === 'fill')).toBe(true);
  });

  it('an invisible inner shadow (no blur, offset or spread) draws nothing', () => {
    const group = renderScene({
      root: boxed('rect', [inner({ blur: 0, offset: { x: 0, y: 0 } })]),
      warnings: [],
    }).byId.get('n')!;
    expect(innerShapes(group)).toHaveLength(0);
  });

  it('an outer shadow next to an inner one still sits on the node shape', () => {
    const outer: Shadow = { color: '#333333', offset: { x: 0, y: 2 }, blur: 4 };
    const group = renderScene({
      root: boxed('rect', [outer, inner()]),
      warnings: [],
    }).byId.get('n')!;
    const node = group.getChildren().find((c) => c.listening()) as Konva.Shape;
    expect(node.shadowBlur()).toBe(4);
    expect(innerShapes(group)[0]!.shadowBlur()).toBe(0);
  });

  it('a node that is not frame, rect or ellipse ignores it and warns', () => {
    const root = {
      ...baseNode({ id: 'n', name: 'n', width: 10, height: 10, effects: [inner()] }),
      type: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      closed: false,
    } as unknown as SceneNode;
    const { warnings } = renderScene({ root, warnings: [] });
    expect(warnings.map((w) => w.code)).toEqual(['inner-shadow']);
  });
});
