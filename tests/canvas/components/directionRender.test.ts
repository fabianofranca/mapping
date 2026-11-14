// R1 (#1096): the reading direction in the Konva drawing. The `Text` carries `direction: 'rtl'` only when
// the style is rtl, and the mirrored matrix (negative scaleX) of the icon and the path comes out of `decompose`
// without spurious rotation or skew, in the same node box. Parity with the MCP raster in pixels
// is in tests/e2e/directionParity.spec.ts.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

type Json = Record<string, unknown>;

const icons: IconSet = {
  viewBox: [24, 24],
  icons: { back: { mirror: true, paths: [{ d: 'M2 4L20 4L20 10L2 10Z', fill: true }] } },
} as never;

function build(child: Json, direction: 'rtl' | undefined) {
  const file = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 60, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, children: [child] },
  };
  const scene = instantiate(
    file as never,
    {},
    { x: 0, y: 0, width: 60, height: 40 },
    { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) },
  );
  return renderScene(scene).root;
}

const icon: Json = {
  type: 'icon',
  name: 'back',
  width: 24,
  height: 24,
  color: '#000000',
};
const path: Json = {
  type: 'path',
  name: 'p',
  d: 'M2 0L20 0L20 10Z',
  viewBox: [24, 10],
  width: 48,
  height: 20,
  mirror: true,
  fill: '#000000',
};

describe('mirror in Konva: decompose of the matrix with negative scaleX', () => {
  for (const [label, child, left, right] of [
    ['icon', icon, 40, 58],
    ['path', path, 20, 56],
  ] as const) {
    it(`${label} in rtl: no rotation nor skew and the mirrored ink in the same box`, () => {
      const root = build(child, 'rtl');
      const paths = root.find('Path') as Konva.Path[];
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        for (
          let n: Konva.Node | null = p;
          n && n !== root.getParent();
          n = n.getParent()
        ) {
          expect(Math.abs(n.rotation())).toBe(0);
          expect(n.skewX()).toBe(0);
          expect(n.skewY()).toBe(0);
        }
      }
      // The points x = 2 and x = 20 of the path (in viewBox units) fall mirrored in the box.
      const [first] = paths;
      const at = (x: number) => first!.getAbsoluteTransform().point({ x, y: 0 }).x;
      const xs = [at(2), at(20)].sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(left, 6);
      expect(xs[1]).toBeCloseTo(right, 6);
    });

    it(`${label} in ltr: the usual matrix (no mirror)`, () => {
      const root = build(child, undefined);
      for (const p of root.find('Path') as Konva.Path[]) {
        expect(p.scaleX()).toBeGreaterThan(0);
        expect(p.rotation()).toBe(0);
      }
    });
  }
});

function textNode(align: TextNode['style']['align'], direction?: 'rtl'): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 20,
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text: 'abc',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 14,
      align,
      verticalAlign: 'top',
      ...(direction ? { direction } : {}),
    },
  };
}

describe('text in Konva: direction', () => {
  const textOf = (n: TextNode): Konva.Text =>
    (renderScene({ root: n, warnings: [] }).root.find('Text') as Konva.Text[])[0]!;

  it('the Text receives direction rtl only when the style is rtl', () => {
    expect(textOf(textNode('right', 'rtl')).direction()).toBe('rtl');
    expect(textOf(textNode('right')).direction()).toBe('inherit');
  });

  it('the physical align goes on to Konva', () => {
    expect(textOf(textNode('right', 'rtl')).align()).toBe('right');
    expect(textOf(textNode('left', 'rtl')).align()).toBe('left');
  });
});
