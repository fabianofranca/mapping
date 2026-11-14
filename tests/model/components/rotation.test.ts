// Format 4, phase EX3: per-node `rotation` (degrees, clockwise, around the center of the box).
// It is drawing only: the scene carries the evaluated angle and the box, the layout and the `hug` do not change.
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_FORMAT,
  type ComponentFile,
  type FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { clipBoxOf } from '../../../src/model/components/clipBox';
import {
  type FrameNode,
  type RectNode,
  type SceneNode,
  baseNode,
  nodeMatrix,
  translate,
  walk,
} from '../../../src/model/components/scene';

type Raw = Record<string, unknown>;

const V4 = 'only allowed with formatVersion 4';

function file(template: unknown, version = 4): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
  };
}

function parse(template: Raw): ComponentFile {
  const r = parseComponent(file(template));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

const bar = (extra: Raw = {}): Raw => ({
  type: 'rect',
  name: 'bar',
  width: 40,
  height: 10,
  fill: '#ff0000',
  ...extra,
});

const root = (children: Raw[], extra: Raw = {}): Raw => ({
  type: 'frame',
  layout: { type: 'row', align: 'center', justify: 'center' },
  children,
  ...extra,
});

function scene(template: Raw, values: FieldValues = {}): FrameNode {
  return instantiate(
    parse(template),
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer },
  ).root as FrameNode;
}

function named(node: SceneNode, name: string): SceneNode {
  for (const n of walk(node)) if (n.name === name) return n;
  throw new Error(`no node ${name}`);
}

describe('rotation in the validator', () => {
  it('applies to any node that is not the root, with a number or expression', () => {
    const tpl = root([
      bar({ rotation: 45 }),
      { type: 'ellipse', rotation: { $mul: [{ $field: 'a' }, 360] } },
      { type: 'frame', rotation: { $field: 'a', default: -30 }, children: [] },
      { type: 'repeat', count: 2, rotation: 10, template: { type: 'frame' } },
    ]);
    expect(validateComponent(file(tpl))).toEqual([]);
  });

  it('on the root it is an error', () => {
    expect(validateComponent(file(root([], { rotation: 10 })))).toEqual([
      'template.rotation: not valid on the root',
    ]);
  });

  it('on the root of a formatVersion 3 only the version error appears', () => {
    expect(validateComponent(file(root([], { rotation: 10 }), 3))).toEqual([
      `template.rotation: ${V4}`,
    ]);
  });

  it('a literal that is not a number fails at the key path', () => {
    expect(validateComponent(file(root([bar({ rotation: 'x' })])))).toEqual([
      'template.children[0].rotation: expected a number',
    ]);
  });

  it('in a formatVersion 1 to 3 it gives the version error at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(file(root([bar({ rotation: 45 })]), version))).toEqual([
        `template.children[0].rotation: ${V4}`,
      ]);
    }
  });
});

describe('rotation in the scene', () => {
  it('the scene carries the evaluated angle and the node box does not change', () => {
    const plain = named(scene(root([bar()])), 'bar');
    const turned = named(scene(root([bar({ rotation: 45 })])), 'bar');
    expect(turned.rotation).toBe(45);
    expect(plain.rotation).toBeUndefined();
    expect(turned.width).toBe(plain.width);
    expect(turned.height).toBe(plain.height);
    expect(turned.transform).toEqual(plain.transform);
  });

  it('evaluates the expression and the empty field is 0 (no rotation in the scene)', () => {
    const tpl = root([bar({ rotation: { $mul: [{ $field: 'a' }, 90] } })]);
    expect(named(scene(tpl, { a: '2' }), 'bar').rotation).toBe(180);
    expect(named(scene(tpl, { a: '' }), 'bar').rotation).toBeUndefined();
    expect(named(scene(tpl, {}), 'bar').rotation).toBeUndefined();
  });

  it('0 stays without rotation; negative and greater than 360 are kept', () => {
    const at = (rotation: number) => named(scene(root([bar({ rotation })])), 'bar');
    expect(at(0).rotation).toBeUndefined();
    expect(at(-30).rotation).toBe(-30);
    expect(at(450).rotation).toBe(450);
  });

  it('the repeat passes the rotation to the row frame', () => {
    const tpl = root([
      {
        type: 'repeat',
        name: 'rows',
        count: 2,
        rotation: 90,
        template: { type: 'frame', width: 5, height: 5 },
      },
    ]);
    const frame = named(scene(tpl), 'rows');
    expect(frame.rotation).toBe(90);
  });

  it('layout and hug are the same with and without rotation', () => {
    const tpl = (extra: Raw) =>
      root(
        [
          bar(extra),
          {
            type: 'frame',
            name: 'hugged',
            width: 'hug',
            height: 'hug',
            ...extra,
            children: [bar({ name: 'inner', ...extra })],
          },
          { type: 'rect', name: 'after', width: 7, height: 7 },
        ],
        { layout: { type: 'row', gap: 4, padding: 3 } },
      );
    const boxes = (extra: Raw) =>
      [...walk(scene(tpl(extra)))].map((n) => [n.name, n.width, n.height, n.transform]);
    expect(boxes({ rotation: 45 })).toEqual(boxes({}));
    const measure = (extra: Raw) =>
      measureComponent(
        parse({ ...tpl(extra), width: 'hug', height: 'hug' }),
        {},
        { width: null, height: null },
        { measure: approximateMeasurer },
      );
    expect(measure({ rotation: 45 })).toEqual(measure({}));
  });
});

describe('nodeMatrix', () => {
  it('without rotation it is the own transform of the node', () => {
    const node = named(scene(root([bar()])), 'bar');
    expect(nodeMatrix(node)).toEqual(node.transform);
  });

  it('rotates around the center of the box: 40×10 at 90° becomes 10×40 at the same center', () => {
    const node = named(scene(root([bar({ rotation: 90 })])), 'bar');
    const [a, b, c, d, e, f] = nodeMatrix(node);
    const at = (x: number, y: number) => ({
      x: a * x + c * y + e,
      y: b * x + d * y + f,
    });
    const [tx, ty] = [node.transform[4], node.transform[5]];
    const center = at(20, 5);
    expect(center.x).toBeCloseTo(tx + 20, 9);
    expect(center.y).toBeCloseTo(ty + 5, 9);
    // the top-left corner (0, 0) goes to the top-right of the rotated box
    const corner = at(0, 0);
    expect(corner.x).toBeCloseTo(tx + 20 + 5, 9);
    expect(corner.y).toBeCloseTo(ty + 5 - 20, 9);
  });
});

describe('enlarged clip with rotated children', () => {
  const stroked = (extra: Partial<RectNode> = {}): RectNode => ({
    ...baseNode({ id: 'r', name: 'r', width: 20, height: 20 }),
    type: 'rect',
    cornerRadius: 0,
    stroke: { paints: [{ type: 'solid', color: '#000000' }], width: 6, align: 'outside' },
    ...extra,
  });
  const frameOf = (children: SceneNode[], extra: Partial<FrameNode> = {}): FrameNode => ({
    ...baseNode({ id: 'f', name: 'f', width: 100, height: 100 }),
    type: 'frame',
    clip: true,
    cornerRadius: 0,
    children,
    ...extra,
  });
  const inner = (extra: Partial<FrameNode> = {}): FrameNode =>
    frameOf([stroked()], {
      id: 'inner',
      clip: false,
      width: 20,
      height: 20,
      transform: translate(80, 40),
      ...extra,
    });

  it('the stroke of a child inside a rotated frame without clip still widens the clip', () => {
    const plain = clipBoxOf(frameOf([inner()]));
    const turned = clipBoxOf(frameOf([inner({ rotation: 45 })]));
    expect(plain).toBeDefined();
    expect(turned).toBeDefined();
    // 0.001° must not change what is seen: the clip still exceeds the box by the stroke
    expect(clipBoxOf(frameOf([inner({ rotation: 0.001 })]))).toBeDefined();
    expect(turned!.x + turned!.width).toBeGreaterThanOrEqual(100);
  });

  it('the enlarged clip of a frame with a rotated clip becomes its box after the rotation', () => {
    const child = frameOf([stroked()], {
      id: 'c',
      width: 20,
      height: 20,
      transform: translate(40, 40),
      rotation: 90,
      clipBox: { x: -6, y: -6, width: 32, height: 32 },
    });
    const box = clipBoxOf(frameOf([child]));
    // the child (20 × 20 at 40, 40) rotates around (50, 50); its clip (32 × 32) stays
    // centered at the same point and fits in the 100 × 100 frame: nothing exceeds the parent box
    expect(box).toBeUndefined();
  });
});
