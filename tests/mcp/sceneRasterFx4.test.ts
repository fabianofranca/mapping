// FX4 in the MCP PNG: stroke.offset, wrap "none" cropped by pixel and four sides (decisions 17, 19 and 21).
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import type { StrokeSide } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import {
  baseNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { plainLines } from '../../mcp/image/textBars';

const INK = '#FF00FF';
const WHITE = [255, 255, 255, 255];
const solid = (color: string) => ({ type: 'solid' as const, color });

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}
const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};
const isInk = (p: number[]): boolean => p[0] === 255 && p[1] === 0 && p[2] === 255;

function paint(raster: Raster, root: SceneNode): void {
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    scaleX: 1,
    scaleY: 1,
  });
}

const rect = (stroke: NonNullable<SceneNode['stroke']>, radius = 0): SceneNode => ({
  ...baseNode({ id: 'r', name: 'r', width: 20, height: 20 }),
  type: 'rect',
  cornerRadius: radius,
  stroke,
  transform: [1, 0, 0, 1, 10, 10],
});

describe('stroke.offset in the raster', () => {
  it('the ring sits away from the shape: the pixel next to the edge is background and the ring one is ink', () => {
    const raster = canvas(40, 40);
    paint(raster, rect({ paints: [solid(INK)], width: 2, align: 'outside', offset: 3 }));
    // The shape starts at x = 10; the ring spans 10 − 3 − 2 = 5 to 7.
    expect(isInk(pixel(raster, 6, 20))).toBe(true);
    expect(pixel(raster, 9, 20)).toEqual(WHITE);
    expect(pixel(raster, 11, 20)).toEqual(WHITE);
    expect(pixel(raster, 3, 20)).toEqual(WHITE);
  });

  it('the corner radius grows by the offset (corner of radius 6 + 3)', () => {
    const raster = canvas(40, 40);
    paint(
      raster,
      rect({ paints: [solid(INK)], width: 2, align: 'center', offset: 3 }, 6),
    );
    // Ring box: 7..33; a square corner would be at (7,7); the rounded one leaves (7,7) blank.
    expect(pixel(raster, 7, 7)).toEqual(WHITE);
    expect(isInk(pixel(raster, 20, 7))).toBe(true);
  });

  it('with sides, the requested side moves away and the others paint nothing', () => {
    const raster = canvas(40, 40);
    paint(
      raster,
      rect({
        paints: [solid(INK)],
        width: 2,
        align: 'center',
        offset: 4,
        sides: ['bottom'],
      }),
    );
    // Base at y = 30; with offset 4 the line sits at y = 34 (33 and 34).
    expect(isInk(pixel(raster, 20, 34))).toBe(true);
    expect(pixel(raster, 20, 30)).toEqual(WHITE);
    expect(pixel(raster, 20, 7)).toEqual(WHITE);
  });
});

describe('stroke.sides with all four sides in the raster', () => {
  // The scene never carries all four sides (`instantiate` normalizes them, MC0): the path is the model's.
  const sceneWith = (sides?: StrokeSide[]): SceneNode => {
    const { root } = instantiate(
      {
        format: 'mapping-component',
        formatVersion: 4,
        id: 't',
        name: 'T',
        size: { width: 20, height: 20 },
        template: {
          type: 'frame',
          children: [
            {
              type: 'rect',
              width: 20,
              height: 20,
              cornerRadius: 8,
              stroke: {
                color: INK,
                width: 2,
                align: 'inside',
                ...(sides ? { sides } : {}),
              },
            },
          ],
        },
      },
      {},
      { x: 10, y: 10, width: 20, height: 20 },
      { measure: approximateMeasurer },
    );
    return root;
  };

  it('is the whole outline with radius, same as absent sides', () => {
    const all = canvas(40, 40);
    paint(all, sceneWith(['top', 'right', 'bottom', 'left']));
    const none = canvas(40, 40);
    paint(none, sceneWith());
    expect(Buffer.from(all.data).equals(Buffer.from(none.data))).toBe(true);
    // The rounded corner stayed blank (it is not four straight lines touching).
    expect(pixel(all, 10, 10)).toEqual(WHITE);
  });
});

describe('wrap "none" cropped by pixel in the raster', () => {
  const text = (align: 'left' | 'center' | 'right'): TextNode => ({
    ...baseNode({ id: 't', name: 't', width: 30, height: 20, fills: [solid(INK)] }),
    type: 'text',
    text: 'A rather long text',
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
    'align %s: the bar goes past the box in the bars, but the drawing is cropped at 30 px',
    (align) => {
      // The text is 18 × 5.5 = 99 px; the box, 30. Nothing is painted beyond x = 30.
      const root: SceneNode = {
        ...text(align),
        transform: [1, 0, 0, 1, 0, 0],
      };
      const raster = canvas(120, 20);
      paint(raster, root);
      expect(isInk(pixel(raster, 29, 10))).toBe(true);
      for (const x of [30, 31, 60, 99]) expect(pixel(raster, x, 10)).toEqual(WHITE);
    },
  );
});

describe('cropped text of several paragraphs (MC0, decision 30)', () => {
  // Each character measures 5.5 px (approximate): the 1st line is 99 px, the 2nd 27.5; the box, 60. The block
  // (99) is wider than the box and starts at the left edge; the short line aligns within the block.
  const two = (align: 'left' | 'center' | 'right'): SceneNode => ({
    ...baseNode({ id: 't', name: 't', width: 60, height: 40, fills: [solid(INK)] }),
    type: 'text',
    text: 'A rather long text\nshort',
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

  it('center: the short line starts at (99 − 27.5) / 2 = 35.75, as in the app', () => {
    const raster = canvas(120, 40);
    paint(raster, two('center'));
    // The second line spans y 20..40 (bar at 24..36).
    expect(pixel(raster, 30, 30)).toEqual(WHITE);
    expect(isInk(pixel(raster, 40, 30))).toBe(true);
    expect(isInk(pixel(raster, 58, 30))).toBe(true);
  });

  it('right: the short line starts at 99 − 27.5 = 71.5, outside the box: nothing is painted', () => {
    const raster = canvas(120, 40);
    paint(raster, two('right'));
    for (const x of [5, 30, 45, 58]) expect(pixel(raster, x, 30)).toEqual(WHITE);
    // The long line starts at the edge and is cropped at 60.
    expect(isInk(pixel(raster, 20, 10))).toBe(true);
  });

  it('left: both lines start at the edge', () => {
    const raster = canvas(120, 40);
    paint(raster, two('left'));
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
  });
});

describe('only the lines that fit the height (MC0, decision 31)', () => {
  const tall = (verticalAlign: 'top' | 'middle' | 'bottom', extra = {}): SceneNode => ({
    ...baseNode({ id: 't', name: 't', width: 120, height: 40, fills: [solid(INK)] }),
    type: 'text',
    text: 'aaaa\nbbbb\ncccc',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign,
      ...extra,
    },
  });

  it('top: 3 lines in a 2-line box draw 2 (the third does not come out)', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('top'));
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
    // The third line would fall at y 40..60 (bar at 44..56).
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('middle: the 2-line block is the one that centers (line 1 stays at the top of the box)', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('middle'));
    // With 3 lines the block would rise 10 px and the bar of the 1st line would be at −6..6; with 2, at 4..16.
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(isInk(pixel(raster, 5, 30))).toBe(true);
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('bottom: the 2-line block ends at the bottom of the box', () => {
    const raster = canvas(120, 80);
    paint(raster, tall('bottom'));
    expect(isInk(pixel(raster, 5, 10))).toBe(true);
    expect(pixel(raster, 5, 50)).toEqual(WHITE);
  });

  it('with ellipsis, the height cut works as maxLines: 2 lines, the second ends in …', () => {
    const node = tall('top', { ellipsis: true }) as TextNode;
    const long: TextNode = {
      ...node,
      width: 100,
      text: 'aaaa bbbb cccc dddd eeee ffff gggg hhhh',
    };
    const lines = plainLines(long, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(2);
    expect(lines.lines[1]?.endsWith('…')).toBe(true);
  });

  it('a box of 2.5 lines also draws 2', () => {
    const node = { ...(tall('top') as TextNode), height: 50 };
    const lines = plainLines(node, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(2);
  });

  it('with ellipsis and line height 0, the measurer does not receive an infinite maxLines', () => {
    const node = tall('top', { ellipsis: true, lineHeight: 0 }) as TextNode;
    const seen: unknown[] = [];
    const spy: typeof approximateMeasurer = (text, font, width) => {
      seen.push((font as { maxLines?: number }).maxLines);
      return approximateMeasurer(text, font, width);
    };
    plainLines(node, spy, (text) => text.length * 5.5);
    expect(seen.length).toBeGreaterThan(0);
    for (const maxLines of seen)
      expect(maxLines === undefined || Number.isFinite(maxLines)).toBe(true);
  });

  it('without a height (0), all the lines', () => {
    const node = { ...(tall('top') as TextNode), height: 0 };
    const lines = plainLines(node, approximateMeasurer, (text) => text.length * 5.5);
    expect(lines.lines).toHaveLength(3);
  });
});
