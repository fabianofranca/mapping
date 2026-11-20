// Format 4, "format gaps" stage (FG5): `scale` and `filter.grayscale` on any node (the root
// included), drawing only. Validator, scene (`nodeMatrix`), engine (layout untouched, the
// `component` node's drawing) and the desaturation of a scene subtree (`grayscale.ts`).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FieldValues,
  ResolvedComponent,
} from '../../../src/model/components/componentFormat';
import {
  grayscaleColor,
  grayscaleNode,
  grayscalePixels,
  grayscaleRgb,
} from '../../../src/model/components/grayscale';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
} from '../../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import {
  type FrameNode,
  type Matrix,
  type Paint,
  type SceneNode,
  type TextNode,
  baseNode,
  multiply,
  nodeMatrix,
  translate,
  walk,
} from '../../../src/model/components/scene';
import { fitComponentSize } from '../../../src/model/components/sizing';
import { resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const V4 = 'only allowed with formatVersion 4';
const NON_NEGATIVE = 'expected a number greater than or equal to 0';

function file(template: unknown, version = 4, extra: Raw = {}): unknown {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 200, height: 100 },
    template,
    ...extra,
  };
}

function parse(template: Raw, extra: Raw = {}): ComponentFile {
  const r = parseComponent(file(template, 4, extra));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.component;
}

const root = (children: Raw[], extra: Raw = {}): Raw => ({
  type: 'frame',
  layout: { type: 'row', align: 'center', justify: 'center' },
  children,
  ...extra,
});

const bar = (extra: Raw = {}): Raw => ({
  type: 'rect',
  name: 'bar',
  width: 40,
  height: 10,
  fill: '#ff0000',
  ...extra,
});

function run(template: Raw, values: FieldValues = {}, extra: Raw = {}) {
  return instantiate(
    parse(template, extra),
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer },
  );
}

const scene = (template: Raw, values: FieldValues = {}): FrameNode =>
  run(template, values).root as FrameNode;

function named(node: SceneNode, name: string): SceneNode {
  for (const n of walk(node)) if (n.name === name) return n;
  throw new Error(`no node ${name}`);
}

const solid = (node: SceneNode): string => {
  const fill = node.fills[0];
  if (fill?.type !== 'solid') throw new Error('no solid fill');
  return fill.color;
};

function applyTo(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

describe('FG5: scale in the validator', () => {
  it('a literal, an expression and a number $token, on the root and on a child', () => {
    expect(validateComponent(file(root([bar({ scale: 0.96 })], { scale: 1.2 })))).toEqual(
      [],
    );
    expect(
      validateComponent(
        file(
          root([
            bar({ scale: { $if: { $field: 'pressed' }, then: 0.96, else: 1 } }),
            bar({ scale: { $token: 'press' } }),
            { type: 'repeat', count: 2, scale: 0.5, template: { type: 'frame' } },
          ]),
        ),
      ),
    ).toEqual([]);
  });

  it('a negative literal fails at the key path', () => {
    expect(validateComponent(file(root([bar({ scale: -1 })])))).toEqual([
      `template.children[0].scale: ${NON_NEGATIVE}`,
    ]);
    expect(validateComponent(file(root([], { scale: -0.5 })))).toEqual([
      `template.scale: ${NON_NEGATIVE}`,
    ]);
  });

  it('in a formatVersion 1 to 3 it gives the version error at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(validateComponent(file(root([bar({ scale: 0.5 })]), version))).toEqual([
        `template.children[0].scale: ${V4}`,
      ]);
      expect(validateComponent(file(root([], { scale: 0.5 }), version))).toEqual([
        `template.scale: ${V4}`,
      ]);
    }
  });
});

describe('FG5: filter in the validator', () => {
  it('grayscale as a literal, an expression and a number $token, on the root too', () => {
    expect(
      validateComponent(
        file(
          root(
            [
              bar({ filter: { grayscale: 1 } }),
              bar({
                filter: { grayscale: { $if: { $field: 'off' }, then: 1, else: 0 } },
              }),
              bar({ filter: { grayscale: { $token: 'gray' } } }),
            ],
            { filter: { grayscale: 0.5 } },
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('another key inside filter is an unknown key', () => {
    expect(validateComponent(file(root([bar({ filter: { blur: 2 } })])))).toEqual([
      'template.children[0].filter.blur: unknown key: blur',
    ]);
  });

  it('a filter that is not an object fails', () => {
    expect(validateComponent(file(root([bar({ filter: 1 })])))).toEqual([
      'template.children[0].filter: expected an object',
    ]);
  });

  it('in a formatVersion 1 to 3 it gives the version error at the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(
        validateComponent(file(root([bar({ filter: { grayscale: 1 } })]), version)),
      ).toEqual([`template.children[0].filter: ${V4}`]);
    }
  });
});

describe('FG5: nodeMatrix with scale', () => {
  const box = { transform: translate(10, 20), width: 40, height: 10 } as const;

  it('keeps the center of the box where it was', () => {
    const plain = applyTo(nodeMatrix(box), 20, 5);
    const half = applyTo(nodeMatrix({ ...box, scale: 0.5 }), 20, 5);
    expect(half[0]).toBeCloseTo(plain[0], 10);
    expect(half[1]).toBeCloseTo(plain[1], 10);
    // The top-left corner moves toward the center by half.
    expect(applyTo(nodeMatrix({ ...box, scale: 0.5 }), 0, 0)).toEqual([20, 22.5]);
  });

  it('without scale, with 1 or with an undefined one it is the transform itself', () => {
    expect(nodeMatrix(box)).toBe(box.transform);
    expect(nodeMatrix({ ...box, scale: 1 })).toBe(box.transform);
  });

  it('with rotation and scale together the order does not change the result', () => {
    const only = (extra: { rotation?: number; scale?: number }): Matrix =>
      nodeMatrix({ transform: [1, 0, 0, 1, 0, 0], width: 40, height: 10, ...extra });
    const both = only({ rotation: 30, scale: 2 });
    const turnThenScale = multiply(only({ scale: 2 }), only({ rotation: 30 }));
    const scaleThenTurn = multiply(only({ rotation: 30 }), only({ scale: 2 }));
    both.forEach((v, i) => {
      expect(v).toBeCloseTo(turnThenScale[i]!, 10);
      expect(v).toBeCloseTo(scaleThenTurn[i]!, 10);
    });
  });
});

describe('FG5: scale in the scene', () => {
  it('the scene carries the evaluated scale on any node, the root included', () => {
    const out = scene(root([bar({ scale: 0.96 })], { scale: 2 }));
    expect(out.scale).toBe(2);
    expect(named(out, 'bar').scale).toBe(0.96);
  });

  it('evaluates the expression; no value, 1 and a missing field leave the node unscaled', () => {
    const tpl = root([
      bar({ scale: { $if: { $field: 'pressed' }, then: 0.96, else: 1 } }),
    ]);
    expect(named(scene(tpl, { pressed: 'yes' }), 'bar').scale).toBe(0.96);
    expect(named(scene(tpl, { pressed: '' }), 'bar').scale).toBeUndefined();
    expect(named(scene(root([bar({ scale: 1 })])), 'bar').scale).toBeUndefined();
    expect(named(scene(root([bar()])), 'bar').scale).toBeUndefined();
  });

  it('a number $token is substituted', () => {
    const component = parse(root([bar({ scale: { $token: 'press' } })]));
    const tokens = resolveTokens(
      { modes: ['a'], values: { press: { a: 0.9 } } },
      {},
      'a',
    );
    const out = instantiate(
      component,
      {},
      { x: 0, y: 0, width: 200, height: 100 },
      { measure: approximateMeasurer, tokens },
    );
    expect(named(out.root, 'bar').scale).toBe(0.9);
  });

  it('an invalid value from an expression warns and is 1; 0 is kept (draws nothing)', () => {
    const tpl = root([bar({ scale: { $field: 'k' } })]);
    const bad = run(tpl, { k: 'abc' });
    expect(named(bad.root, 'bar').scale).toBeUndefined();
    expect(bad.warnings).toContain('invalid value in scale: abc');
    const negative = run(tpl, { k: -2 });
    expect(named(negative.root, 'bar').scale).toBeUndefined();
    expect(negative.warnings).toContain('invalid value in scale: -2');
    expect(named(scene(tpl, { k: 0 }), 'bar').scale).toBe(0);
  });

  it('layout, hug, the box and the measured size are the same with and without scale', () => {
    const tpl = (extra: Raw) =>
      root(
        [
          bar({ width: 'hug', ...extra }),
          {
            type: 'text',
            name: 'label',
            text: 'Hello',
            width: 'hug',
            font: { size: 14 },
            ...extra,
          },
        ],
        { width: 'hug', height: 'hug', ...extra },
      );
    const strip = (node: SceneNode): unknown => {
      const rest: Record<string, unknown> = { ...node };
      delete rest.scale;
      if ('children' in node) rest.children = node.children.map(strip);
      return rest;
    };
    const plain = scene(tpl({}));
    const scaled = scene(tpl({ scale: 0.96 }));
    expect(strip(scaled)).toEqual(strip(plain));
    expect(scaled.scale).toBe(0.96);

    const measure = (extra: Raw) =>
      measureComponent(
        parse(tpl(extra)),
        {},
        { width: null, height: null },
        { measure: approximateMeasurer },
      );
    expect(measure({ scale: 0.96 })).toEqual(measure({}));
  });

  it('fitComponentSize (the pressed Button at 0.96) does not change', () => {
    const sizing = { sizing: { width: 'hug', height: 'hug' } };
    const component = (extra: Raw) =>
      parse(
        root([{ type: 'text', text: 'Hello', width: 'hug', font: { size: 14 } }], {
          width: 'hug',
          height: 'hug',
          ...extra,
        }),
        sizing,
      );
    const fit = (extra: Raw) =>
      fitComponentSize(component(extra), {}, { measure: approximateMeasurer });
    expect(fit({ scale: 0.96 })).toBeDefined();
    expect(fit({ scale: 0.96 })).toEqual(fit({}));
  });

  it('the root clip and its enlarged clipBox are the unscaled ones (the matrix scales them)', () => {
    const plain = scene(
      root([bar()], { stroke: { width: 4, align: 'outside', color: '#000000' } }),
    );
    const scaled = scene(
      root([bar()], {
        stroke: { width: 4, align: 'outside', color: '#000000' },
        scale: 0.5,
      }),
    );
    expect(plain.clip).toBe(true);
    expect(scaled.clipBox).toEqual(plain.clipBox);
    expect(scaled.width).toBe(plain.width);
  });

  it('a scaled, rotated child grows the parent clip box by the scaled stroke', () => {
    const child = (extra: Raw) =>
      root(
        [
          bar({
            width: 'fill',
            height: 'fill',
            stroke: { width: 6, align: 'outside', color: '#000000' },
            ...extra,
          }),
        ],
        { clip: true },
      );
    const plain = scene(child({})).clipBox;
    const scaled = scene(child({ scale: 2 })).clipBox;
    // The scaled stroke reaches farther than the plain one: the clip is at least as large.
    expect(scaled === undefined || plain === undefined).toBe(false);
    expect(scaled!.width).toBeGreaterThanOrEqual(plain!.width);
  });

  it('the scales of nested descendants compound in the parent clip box', () => {
    const tree = (grandchildScale: number) =>
      root(
        [
          root(
            [
              bar({
                scale: grandchildScale,
                shadow: { color: '#000000', blur: 6 },
              }),
            ],
            { scale: 1.5, width: 'fill', height: 'fill' },
          ),
        ],
        { clip: true },
      );
    const small = scene(tree(1)).clipBox;
    const large = scene(tree(3)).clipBox;
    expect(small).toBeDefined();
    expect(large).toBeDefined();
    // The shadow of the descendant grows by 3, so the clip reaches farther than with scale 1.
    expect(large!.width).toBeGreaterThan(small!.width);
  });

  it('slot content inside a scaled node is not scaled: the slot box is the unscaled one', () => {
    const tpl = root(
      [{ type: 'slot', id: 'content', width: 80, height: 30, name: 'slot' }],
      { scale: 0.5 },
    );
    const out = scene(tpl);
    const slot = named(out, 'slot');
    expect(slot.width).toBe(80);
    expect(slot.height).toBe(30);
    expect(slot.scale).toBeUndefined();
  });
});

describe('FG5: scale on the drawing of a component node', () => {
  const inner = (template: Raw = {}): ComponentFile =>
    ({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'chip',
      name: 'Chip',
      size: { width: 60, height: 24 },
      template: {
        type: 'frame',
        layout: { type: 'row', align: 'center', justify: 'center' },
        fill: '#ff0000',
        children: [],
        ...template,
      },
    }) as unknown as ComponentFile;

  const resolved = (component: ComponentFile): Record<string, ResolvedComponent> => ({
    chip: { component, fields: [] },
  });

  function outer(node: Raw, outerRoot: Raw = {}, chip: ComponentFile = inner()) {
    const component = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'outer',
      name: 'Outer',
      size: { width: 200, height: 80 },
      template: {
        type: 'frame',
        layout: { type: 'none' },
        clip: false,
        children: [{ type: 'component', id: 'chip', width: 60, height: 24, ...node }],
        ...outerRoot,
      },
      resolvedComponents: resolved(chip),
    } as unknown as ComponentFile;
    return instantiate(
      component,
      {},
      { x: 0, y: 0, width: 200, height: 80 },
      { measure: approximateMeasurer, idPrefix: 'o' },
    );
  }

  const drawing = (root: SceneNode): SceneNode => (root as FrameNode).children[0]!;

  it('the scale of the node itself applies to the whole inner drawing', () => {
    const out = outer({ scale: 0.8 });
    expect(drawing(out.root).scale).toBe(0.8);
  });

  it('an inner root scale composes with the outer node scale', () => {
    const out = outer({ scale: 0.5 }, {}, inner({ scale: 0.8 }));
    expect(drawing(out.root).scale).toBeCloseTo(0.4, 10);
  });

  it('a scaled outer root scales the embedded drawing with it, with no rewriting of the inner', () => {
    const out = outer({}, { scale: 0.96 });
    expect(out.root.scale).toBe(0.96);
    // The inner drawing keeps its own (absent) scale: the outer group matrix scales it.
    expect(drawing(out.root).scale).toBeUndefined();
    const m = nodeMatrix(out.root);
    expect(m[0]).toBeCloseTo(0.96, 10);
    expect(m[3]).toBeCloseTo(0.96, 10);
  });

  it('an inner scale applies by itself when the outer one is absent (a state that is not pressed)', () => {
    const idle = outer(
      {},
      {},
      inner({ scale: { $if: { $field: 'p' }, then: 0.5, else: 1 } }),
    );
    expect(drawing(idle.root).scale).toBeUndefined();
  });
});

describe('FG5: grayscale of colors and pixels (CSS matrix)', () => {
  it('amount 1 sends a pure red to its luma; 0 changes nothing; 0.5 is halfway', () => {
    const [r, g, b] = grayscaleRgb(255, 0, 0, 1);
    expect(r).toBeCloseTo(0.2126 * 255, 6);
    expect(g).toBeCloseTo(r, 10);
    expect(b).toBeCloseTo(r, 10);
    expect(grayscaleRgb(255, 0, 0, 0)).toEqual([255, 0, 0]);
    const [hr, hg, hb] = grayscaleRgb(255, 0, 0, 0.5);
    expect(hr).toBeCloseTo((255 + 0.2126 * 255) / 2, 6);
    expect(hg).toBeCloseTo((0.2126 * 255) / 2, 6);
    expect(hb).toBeCloseTo((0.2126 * 255) / 2, 6);
  });

  it('a color keeps its alpha; what is not a color stays as it is', () => {
    expect(grayscaleColor('#ff0000', 1)).toBe('#363636');
    expect(grayscaleColor('#ff000080', 1)).toBe('#36363680');
    expect(grayscaleColor('rgba(255, 0, 0, 0.5)', 1)).toBe('#36363680');
    expect(grayscaleColor('transparent', 1)).toBe('transparent');
    expect(grayscaleColor('#ff0000', 0)).toBe('#ff0000');
  });

  it('pixels: R = G = B at 1, alpha untouched', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 200, 10, 200, 30, 255]);
    grayscalePixels(data, 1);
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[3]).toBe(200);
    expect(data[4]).toBe(data[5]);
    expect(data[5]).toBe(data[6]);
    expect(data[7]).toBe(255);
  });
});

describe('FG5: grayscale of a scene subtree', () => {
  const frameOf = (children: SceneNode[], extra: Partial<FrameNode> = {}): FrameNode =>
    ({
      ...baseNode({ id: 'f', name: 'f', width: 100, height: 100 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children,
      ...extra,
    }) as FrameNode;

  it('turns fills, gradient stops, stroke, shadow, text and a run chip gray; alpha unchanged', () => {
    const gradient: Paint = {
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff80' },
      ],
    };
    const text: TextNode = {
      ...baseNode({
        id: 't',
        name: 't',
        fills: [{ type: 'solid', color: '#00ff00' }],
      }),
      type: 'text',
      text: 'ab',
      style: {
        fontFamily: 'x',
        fontSize: 12,
        fontWeight: 400,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
      },
      runs: [
        {
          text: 'ab',
          fontFamily: 'x',
          fontSize: 12,
          fontWeight: 400,
          italic: false,
          color: '#ff0000',
          background: '#0000ff',
        },
      ],
    };
    const root = frameOf(
      [
        {
          ...baseNode({
            id: 'r',
            name: 'r',
            fills: [{ type: 'solid', color: '#ff0000' }, gradient],
            stroke: {
              paints: [{ type: 'solid', color: '#ff0000' }],
              width: 1,
              align: 'inside',
            },
            effects: [{ color: '#ff000040', offset: { x: 0, y: 1 }, blur: 2 }],
          }),
          type: 'rect',
          cornerRadius: 0,
        },
        text,
      ],
      { fills: [{ type: 'solid', color: '#ff0000' }] },
    );
    const out = grayscaleNode(root, 1);
    const isGray = (c: string): boolean => /^#([0-9a-f]{2})\1\1([0-9a-f]{2})?$/.test(c);
    expect(solid(out)).toBe('#363636');
    const rect = out.children[0]!;
    expect(solid(rect)).toBe('#363636');
    const stops = (rect.fills[1] as Extract<Paint, { type: 'linear' }>).stops;
    expect(stops.every((s) => isGray(s.color))).toBe(true);
    expect(stops[1]!.color.endsWith('80')).toBe(true);
    const strokePaint = rect.stroke!.paints[0] as Extract<Paint, { type: 'solid' }>;
    expect(isGray(strokePaint.color)).toBe(true);
    expect(rect.effects[0]!.color).toBe('#36363640');
    const outText = out.children[1] as TextNode;
    expect(isGray(solid(outText))).toBe(true);
    expect(isGray(outText.runs![0]!.color)).toBe(true);
    expect(isGray(outText.runs![0]!.background!)).toBe(true);
    // The input is not mutated.
    expect(solid(root)).toBe('#ff0000');
  });

  it('an image paint carries the amount; nested filters compose', () => {
    const image = frameOf([], {
      fills: [{ type: 'image', url: 'https://x/y.png' }],
    });
    const once = grayscaleNode(image, 0.5);
    expect((once.fills[0] as Extract<Paint, { type: 'image' }>).grayscale).toBe(0.5);
    const twice = grayscaleNode(once, 0.5);
    expect((twice.fills[0] as Extract<Paint, { type: 'image' }>).grayscale).toBeCloseTo(
      0.75,
      10,
    );
    const plain = grayscaleNode(
      frameOf([], { fills: [{ type: 'solid', color: '#ff0000' }] }),
      0,
    );
    expect(solid(plain)).toBe('#ff0000');
  });
});

describe('FG5: filter.grayscale in the engine', () => {
  const swatch = (extra: Raw = {}): Raw => ({
    type: 'rect',
    name: 'sw',
    width: 20,
    height: 20,
    fill: '#ff0000',
    ...extra,
  });

  it('grayscale 1 on a node turns its drawing gray; 0.5 is halfway; alpha unchanged', () => {
    expect(solid(named(scene(root([swatch({ filter: { grayscale: 1 } })])), 'sw'))).toBe(
      '#363636',
    );
    const half = solid(
      named(scene(root([swatch({ filter: { grayscale: 0.5 } })])), 'sw'),
    );
    expect(half).toBe(grayscaleColor('#ff0000', 0.5));
    expect(
      solid(
        named(
          scene(root([swatch({ fill: '#ff000080', filter: { grayscale: 1 } })])),
          'sw',
        ),
      ),
    ).toBe('#36363680');
  });

  it('on the root and on an ancestor it reaches the descendants; a sibling stays in color', () => {
    const out = scene(
      root([
        { type: 'frame', name: 'wrap', filter: { grayscale: 1 }, children: [swatch()] },
        swatch({ name: 'free' }),
      ]),
    );
    expect(solid(named(out, 'sw'))).toBe('#363636');
    expect(solid(named(out, 'free'))).toBe('#ff0000');
    const whole = scene(root([swatch()], { filter: { grayscale: 1 } }));
    expect(solid(named(whole, 'sw'))).toBe('#363636');
  });

  it('nested filters compose', () => {
    const out = scene(
      root([
        {
          type: 'frame',
          filter: { grayscale: 0.5 },
          children: [swatch({ filter: { grayscale: 0.5 } })],
        },
      ]),
    );
    expect(solid(named(out, 'sw'))).toBe(
      grayscaleColor(grayscaleColor('#ff0000', 0.5), 0.5),
    );
  });

  it('a value from an expression: out of range is clamped, not a number warns and is 0', () => {
    const tpl = root([swatch({ filter: { grayscale: { $field: 'g' } } })]);
    expect(solid(named(scene(tpl, { g: 3 }), 'sw'))).toBe('#363636');
    expect(solid(named(scene(tpl, { g: -1 }), 'sw'))).toBe('#ff0000');
    const bad = run(tpl, { g: 'lots' });
    expect(solid(named(bad.root, 'sw'))).toBe('#ff0000');
    expect(bad.warnings).toContain('invalid value in filter.grayscale: lots');
  });

  it('is drawing only: layout and sizes do not change', () => {
    const plain = scene(root([swatch()]));
    const gray = scene(root([swatch({ filter: { grayscale: 1 } })]));
    const a = named(plain, 'sw');
    const b = named(gray, 'sw');
    expect([b.width, b.height, b.transform]).toEqual([a.width, a.height, a.transform]);
  });

  describe('on a component node', () => {
    const chip = {
      format: 'mapping-component',
      formatVersion: 4,
      id: 'chip',
      name: 'Chip',
      size: { width: 60, height: 24 },
      template: {
        type: 'frame',
        layout: { type: 'none' },
        fill: '#ff0000',
        children: [swatch({ name: 'inside' })],
      },
    } as unknown as ComponentFile;

    function outer(node: Raw, outerRoot: Raw = {}) {
      const component = {
        format: 'mapping-component',
        formatVersion: 4,
        id: 'outer',
        name: 'Outer',
        size: { width: 200, height: 80 },
        template: {
          type: 'frame',
          layout: { type: 'none' },
          clip: false,
          children: [{ type: 'component', id: 'chip', width: 60, height: 24, ...node }],
          ...outerRoot,
        },
        resolvedComponents: { chip: { component: chip, fields: [] } },
      } as unknown as ComponentFile;
      return instantiate(
        component,
        {},
        { x: 0, y: 0, width: 200, height: 80 },
        { measure: approximateMeasurer, idPrefix: 'o' },
      );
    }

    it('the filter on an ancestor turns the inner drawing gray', () => {
      const out = outer({}, { filter: { grayscale: 1 } });
      expect(solid(named(out.root, 'inside'))).toBe('#363636');
      expect(solid((out.root as FrameNode).children[0]!)).toBe('#363636');
    });

    it('the filter on the component node itself turns the whole inner drawing gray', () => {
      const out = outer({ filter: { grayscale: 1 } });
      expect(solid(named(out.root, 'inside'))).toBe('#363636');
      expect(solid((out.root as FrameNode).children[0]!)).toBe('#363636');
    });

    it('without a filter the inner drawing keeps its colors', () => {
      const out = outer({});
      expect(solid(named(out.root, 'inside'))).toBe('#ff0000');
    });
  });
});
