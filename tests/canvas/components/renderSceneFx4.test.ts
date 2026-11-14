// FX4 in the app drawing: stroke.offset, wrap "none" cut by pixel and four sides (decisions 17, 19 and 21).
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { StrokeSide } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  measureLines,
} from '../../../src/model/components/instantiate';
import {
  cutLineLeft,
  konvaLineHeight,
  visibleLineCount,
} from '../../../src/model/components/textWrap';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  type Stroke,
  type TextNode,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#112233' }],
  width: 2,
  align: 'center',
  ...extra,
});

const frameOf = (children: SceneNode[], extra: Partial<FrameNode> = {}): Scene => ({
  root: {
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  },
  warnings: [],
});

const shapesOf = (scene: Scene) => renderScene(scene).root.find('Shape') as Konva.Shape[];

describe('stroke.offset', () => {
  it('the ring of a rectangle with radius 8 stays 2 away: grown box and radius 8 + 2', () => {
    const [ring] = shapesOf(
      frameOf([], { cornerRadius: 8, stroke: stroke({ align: 'center', offset: 2 }) }),
    );
    const rect = ring as Konva.Rect;
    expect([rect.x(), rect.y(), rect.width(), rect.height()]).toEqual([-2, -2, 104, 44]);
    expect(rect.cornerRadius()).toEqual(10);
  });

  it('the align is relative to the offset outline (outside: plus half the width)', () => {
    const [ring] = shapesOf(
      frameOf([], { cornerRadius: 8, stroke: stroke({ align: 'outside', offset: 2 }) }),
    );
    const rect = ring as Konva.Rect;
    expect([rect.x(), rect.y(), rect.width(), rect.height()]).toEqual([-3, -3, 106, 46]);
    expect(rect.cornerRadius()).toEqual(11);
  });

  it('radius 0 stays straight (like the CSS outline-offset)', () => {
    const [ring] = shapesOf(frameOf([], { stroke: stroke({ offset: 3 }) }));
    expect((ring as Konva.Rect).cornerRadius()).toEqual(0);
  });

  it('on an ellipse both radii grow by the offset', () => {
    const ellipse: SceneNode = {
      ...baseNode({ id: 'e', name: 'e', width: 40, height: 20 }),
      type: 'ellipse',
      stroke: stroke({ offset: 2 }),
    };
    const shape = shapesOf(frameOf([ellipse])).find(
      (s) => s.className === 'Ellipse',
    ) as Konva.Ellipse;
    expect([shape.radiusX(), shape.radiusY()]).toEqual([22, 12]);
  });

  it('with sides, the offset applies only to the requested sides', () => {
    const shapes = shapesOf(
      frameOf([], { stroke: stroke({ sides: ['bottom'], offset: 4, align: 'center' }) }),
    );
    expect((shapes[0] as Konva.Line).points()).toEqual([0, 44, 100, 44]);
  });
});

describe('stroke.sides with all four sides', () => {
  // The scene never carries all four sides (`instantiate` normalizes them, MC0): the path is the model one.
  const sceneWith = (sides?: StrokeSide[]): Scene =>
    instantiate(
      {
        format: 'mapping-component',
        formatVersion: 4,
        id: 't',
        name: 'T',
        size: { width: 100, height: 40 },
        template: {
          type: 'frame',
          children: [
            {
              type: 'rect',
              width: 100,
              height: 40,
              cornerRadius: 8,
              stroke: { color: '#112233', width: 2, ...(sides ? { sides } : {}) },
            },
          ],
        },
      },
      {},
      { x: 0, y: 0, width: 100, height: 40 },
      { measure: approximateMeasurer },
    );

  it('draws the outline with radius, same as an absent sides', () => {
    const all = shapesOf(sceneWith(['top', 'right', 'bottom', 'left']));
    const none = shapesOf(sceneWith());
    expect(all.map((s) => s.className)).toEqual(none.map((s) => s.className));
    const ring = all.at(-1) as Konva.Rect;
    expect(ring.className).toBe('Rect');
    expect(ring.cornerRadius()).toEqual((none.at(-1) as Konva.Rect).cornerRadius());
    expect(ring.cornerRadius()).toBeGreaterThan(0);
    expect(all.map((s) => s.attrs)).toEqual(none.map((s) => s.attrs));
  });
});

describe('wrap "none" sem ellipsis', () => {
  const text = (align: 'left' | 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 30, height: 20 }),
    type: 'text',
    text: 'Text quite lengthy',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it.each(['left', 'center', 'right'] as const)(
    'align %s: the Text carries no width and the group clips at the box',
    (align) => {
      const result = renderScene(frameOf([text(align)]));
      const group = result.byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      expect(shape.attrs.width).toBeUndefined();
      const calls: number[][] = [];
      const ctx = {
        beginPath: () => undefined,
        closePath: () => undefined,
        rect: (...args: number[]) => calls.push(args),
      } as unknown as CanvasRenderingContext2D;
      const clip = group.clipFunc();
      expect(clip).toBeTypeOf('function');
      clip?.(ctx as never, group as never);
      expect(calls).toEqual([[0, -10000, 30, 20000]]);
    },
  );

  it('with ellipsis the Text keeps the width, plus the wrap slack (Konva puts the …)', () => {
    const node = text('left');
    const withEllipsis: TextNode = { ...node, style: { ...node.style, ellipsis: true } };
    const group = renderScene(frameOf([withEllipsis])).byId.get('t') as Konva.Group;
    expect((group.find('Text')[0] as Konva.Text).attrs.width).toBe(30.5);
    expect(group.clipFunc()).toBeUndefined();
  });
});

describe('cut text of several paragraphs (MC0, decision 30)', () => {
  // The fake canvas measures 6 px per character: the 1st line is 108 px, the 2nd 30; the box, 50.
  const two = (align: 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 50, height: 40 }),
    type: 'text',
    text: 'Text quite lengthy\nshort',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
      wrap: 'none',
    },
  });

  it.each(['center', 'right'] as const)(
    'align %s: the start of each line is the cutLineLeft one',
    (align) => {
      const group = renderScene(frameOf([two(align)])).byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      const block = shape.width();
      expect(shape.textArr.map((line) => line.width)).toEqual([108, 30]);
      for (const line of shape.textArr) {
        // Konva aligns each line inside the block (the Text width) and the Text starts at x.
        const inBlock =
          align === 'center' ? (block - line.width) / 2 : block - line.width;
        expect(shape.x() + inBlock).toBeCloseTo(
          cutLineLeft(align, 50, block, line.width),
          6,
        );
      }
    },
  );
});

describe('visibleLineCount against the Konva textArr at borderline heights (MC0, decision 31)', () => {
  // lineHeight 14.3 / fontSize 11: the floating-point running sum is not n × lineHeight.
  const node = (height: number): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 100, height }),
    type: 'text',
    text: 'a\nb\nc\nd\ne\nf',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 11,
      fontWeight: 400,
      italic: false,
      lineHeight: 14.3,
      align: 'left',
      verticalAlign: 'top',
    },
  });
  const lh = konvaLineHeight(14.3, 11);

  it.each([1, 2, 3, 4, 5])(
    'the box of %i lines (and a bit less or more) has the lines of visibleLineCount',
    (k) => {
      for (const height of [k * lh - 0.01, k * lh, k * lh + 0.01, (k + 0.5) * lh]) {
        const group = renderScene(frameOf([node(height)])).byId.get('t') as Konva.Group;
        const shape = group.find('Text')[0] as Konva.Text;
        expect(shape.textArr.length, `height ${height}`).toBe(
          visibleLineCount(6, height, lh),
        );
      }
    },
  );
});

describe('only the lines that fit in the height (MC0, decision 31)', () => {
  const lines = (height: number): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 100, height }),
    type: 'text',
    text: 'a\nb\nc\nd',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
    },
  });

  it.each([
    [20, 1],
    [40, 2],
    [50, 2],
  ])(
    'the box of %i px has %i lines in textArr, like visibleLineCount',
    (height, count) => {
      const group = renderScene(frameOf([lines(height)])).byId.get('t') as Konva.Group;
      const shape = group.find('Text')[0] as Konva.Text;
      expect(shape.textArr).toHaveLength(count);
      expect(visibleLineCount(4, height, konvaLineHeight(20, 10))).toBe(count);
    },
  );
});

describe('word wider than the box: the other lines wrap at the box, as in the model (code review #1078)', () => {
  // The fake canvas measures 6 px per character: the long word is 126 px, the box 60.
  const long: TextNode = {
    ...baseNode({ id: 't', name: 't', width: 60, height: 60 }),
    type: 'text',
    text: 'Supercalifragilistics ab cd ef gh',
    fills: [{ type: 'solid', color: '#000000' }],
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
    },
  };

  it('the drawing gives the same lines as the model measureLines', () => {
    const group = renderScene(frameOf([long])).byId.get('t') as Konva.Group;
    const shape = group.find('Text')[0] as Konva.Text;
    const font = {
      family: 'Roboto',
      size: 10,
      weight: 400,
      italic: false,
      lineHeight: 20,
      letterSpacing: 0,
    };
    const model = measureLines(long.text, font, 60, (s) => s.length * 6).lines;
    expect(model).toEqual(['Supercalifragilistics', 'ab cd ef', 'gh']);
    expect(shape.textArr.map((line) => line.text)).toEqual(model);
  });
});
