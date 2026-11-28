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
    transform: note('transform'),
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

  it('a path draws the inner shadow clipped by its own outline and fill rule', () => {
    const root = {
      ...baseNode({
        id: 'n',
        name: 'n',
        width: 48,
        height: 48,
        effects: [inner()],
        fills: [{ type: 'solid', color: '#ffffff' }],
      }),
      type: 'path',
      d: 'M0 0H48V48H0Z M12 12H36V36H12Z',
      fillRule: 'evenodd',
    } as unknown as SceneNode;
    const { byId, warnings } = renderScene({ root, warnings: [] });
    expect(warnings).toEqual([]);
    const shapes = innerShapes(byId.get('n')!);
    expect(shapes).toHaveLength(1);
    const { calls } = draw(shapes[0]!);
    const names = calls.map((c) => c[0]);
    expect(names.indexOf('clip')).toBeGreaterThan(-1);
    expect(names.indexOf('clip')).toBeLessThan(names.indexOf('fill'));
    expect(calls.find((c) => c[0] === 'clip')?.[1]).toBe('evenodd');
    expect(calls.find((c) => c[0] === 'fill')?.[1]).toBe('evenodd');
  });

  it('an icon group draws it over its paths, after the children, with no warning', () => {
    const glyph = (id: string, d: string): SceneNode =>
      ({
        ...baseNode({
          id,
          name: id,
          width: 24,
          height: 24,
          fills: [{ type: 'solid', color: '#ffffff' }],
        }),
        type: 'path',
        d,
        fillRule: 'nonzero',
        transform: [2, 0, 0, 2, 0, 0],
      }) as unknown as SceneNode;
    const root = {
      ...baseNode({ id: 'n', name: 'n', width: 48, height: 48, effects: [inner()] }),
      type: 'group',
      children: [glyph('a', 'M0 0H10V10H0Z'), glyph('b', 'M12 12H22V22H12Z')],
    } as unknown as SceneNode;
    const { byId, warnings } = renderScene({ root, warnings: [] });
    expect(warnings).toEqual([]);
    const group = byId.get('n')!;
    const shapes = innerShapes(group);
    expect(shapes).toHaveLength(1);
    const last = group.getChildren().at(-1) as Konva.Node;
    expect(last.getAttr('innerShadow')).toBe(true);
    const { calls } = draw(shapes[0]!);
    // One clip per glyph (the union), each one before the single fill of the ring.
    expect(calls.filter((c) => c[0] === 'clip')).toHaveLength(2);
  });

  it('an arc (a path from an ellipse with sweepAngle) draws its inner shadow', () => {
    const root = {
      ...baseNode({
        id: 'n',
        name: 'n',
        width: 20,
        height: 20,
        effects: [inner()],
        fills: [{ type: 'solid', color: '#ffffff' }],
      }),
      type: 'path',
      d: 'M20 10A10 10 0 0 0 0 10L10 10Z',
      fillRule: 'nonzero',
    } as unknown as SceneNode;
    const { byId, warnings } = renderScene({ root, warnings: [] });
    expect(warnings).toEqual([]);
    expect(innerShapes(byId.get('n')!)).toHaveLength(1);
  });

  it('a list on a path keeps the first outer shadow and every inner one', () => {
    const outer: Shadow = { color: '#333333', offset: { x: 0, y: 2 }, blur: 4 };
    const root = {
      ...baseNode({
        id: 'n',
        name: 'n',
        width: 10,
        height: 10,
        effects: [outer, inner(), { ...outer, color: '#444444' }, inner()],
        fills: [{ type: 'solid', color: '#ffffff' }],
      }),
      type: 'path',
      d: 'M0 0H10V10H0Z',
      fillRule: 'nonzero',
    } as unknown as SceneNode;
    const { byId, warnings } = renderScene({ root, warnings: [] });
    const group = byId.get('n')!;
    expect(innerShapes(group)).toHaveLength(2);
    const node = group.getChildren().find((c) => c.listening()) as Konva.Shape;
    expect(node.shadowBlur()).toBe(4);
    expect(node.shadowColor()).toBe('#333333');
    expect(warnings.map((w) => w.code)).toEqual(['extra-shadows']);
  });

  it('a node that is not frame, rect, ellipse, path or icon ignores it and warns', () => {
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
