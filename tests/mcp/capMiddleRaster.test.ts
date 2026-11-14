import { describe, expect, it } from 'vitest';
import type { Font } from 'opentype.js';
import { capHeightOf } from '../../mcp/image/glyphs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { textBars } from '../../mcp/image/textBars';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { layoutRuns } from '../../src/model/components/richText';
import {
  baseNode,
  type FrameNode,
  type TextNode,
} from '../../src/model/components/scene';

// FX2 (decisions 3, 4, 6 and 8 of #896): `font.verticalAlign: "cap-middle"` in the server raster. The block
// from the top of the capital of the first line to the baseline of the last is centered in the node's box; the `middle`
// (center of the line box) does not change.

const book = createFontBook();
const measure = measurerFor(book);

const BOX_TOP = 5;
const BOX_HEIGHT = 30;
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;

const style = (verticalAlign: TextNode['style']['verticalAlign']): TextNode['style'] => ({
  fontFamily: 'sans-serif',
  fontSize: FONT_SIZE,
  fontWeight: 400,
  italic: false,
  lineHeight: LINE_HEIGHT,
  align: 'left',
  verticalAlign,
});

function textNode(
  text: string,
  verticalAlign: TextNode['style']['verticalAlign'],
  width = 60,
): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width,
      height: BOX_HEIGHT,
      transform: [1, 0, 0, 1, 10, BOX_TOP],
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text,
    style: style(verticalAlign),
  };
}

function richNode(
  text: string,
  verticalAlign: TextNode['style']['verticalAlign'],
): TextNode {
  const runs = [
    {
      text,
      fontFamily: 'sans-serif',
      fontSize: FONT_SIZE,
      fontWeight: 400,
      italic: false,
      color: '#000000',
    },
  ];
  return {
    ...textNode(text, verticalAlign, 100),
    runs,
    runLayout: layoutRuns(
      runs.map((r) => ({
        text: r.text,
        font: {
          family: r.fontFamily,
          size: r.fontSize,
          weight: r.fontWeight,
          italic: r.italic,
          lineHeight: LINE_HEIGHT,
          letterSpacing: 0,
        },
      })),
      { size: FONT_SIZE, lineHeight: LINE_HEIGHT },
      measure,
      100,
    ),
  };
}

/** Paints the node and returns the vertical center of the ink (model px), counting the partial edges. */
function inkCenter(node: TextNode, scale: number): number {
  const width = Math.ceil(120 * scale);
  const height = Math.ceil(50 * scale);
  const raster: Raster = createRaster(width, height);
  raster.data.fill(255);
  const root: FrameNode = {
    ...baseNode({ id: 'root', name: 'root', width: 120, height: 50 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [node],
  };
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width, height },
    fonts: book,
  });
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    let total = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      total += 255 - (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
    }
    rows.push(total / 255);
  }
  const filled = rows.filter((r) => r > 0).sort((a, b) => a - b);
  // Full reference line: the median of the lines with ink (the stems of the H, without the middle bar).
  const full = filled[Math.floor(filled.length / 2)]!;
  const first = rows.findIndex((r) => r > full * 0.02);
  const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r > full * 0.02);
  const top = first + (1 - Math.min(1, rows[first]! / full));
  const bottom = last + Math.min(1, rows[last]! / full);
  return (top + bottom) / 2 / scale;
}

const BOX_CENTER = BOX_TOP + BOX_HEIGHT / 2;

describe('cap-middle in the raster with the embedded font (decision 8)', () => {
  for (const scale of [1, 4.2]) {
    it(`plain one-line text: the ink center is within ≤ 0.5 px of the box center (zoom ${scale})`, () => {
      const center = inkCenter(textNode('HHHH', 'cap-middle'), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });

    it(`plain two-line text: the block (top of the H of the 1st to the baseline of the 2nd) is centered (zoom ${scale})`, () => {
      // Width that only fits one word per line.
      const center = inkCenter(textNode('HHHH HHHH', 'cap-middle', 36), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });

    it(`text with runs: the ink center is within ≤ 0.5 px of the box center (zoom ${scale})`, () => {
      const center = inkCenter(richNode('HHHH', 'cap-middle'), scale);
      expect(Math.abs(center - BOX_CENTER)).toBeLessThanOrEqual(0.5);
    });
  }

  it('the middle does not change: it centers the line box (with Liberation Sans, the capital falls within 0.5 px)', () => {
    const middle = inkCenter(textNode('HHHH', 'middle'), 1);
    // Ascent 0.905 and descent 0.212 of the body: the baseline sits 0.3465 below the center of the
    // line and the center of the capital (0.688 / 2) 0.344 above the baseline. The middle raster stays like this.
    expect(Math.abs(middle - BOX_CENTER)).toBeLessThanOrEqual(0.5);
  });

  it('without a font (bars), the cap-middle no longer falls at the top', () => {
    const bar = (v: TextNode['style']['verticalAlign']) =>
      textBars(textNode('HHHH', v), measure)[0]!;
    const top = bar('top');
    const cap = bar('cap-middle');
    expect(cap.y).toBeGreaterThan(top.y + 1);
    // The fallback proportions (capital 0.7, ascent 0.8, descent 0.2 of the body) put the
    // bar center 0.05 of the body below the box center.
    const center = cap.y + cap.height / 2;
    expect(center).toBeCloseTo(BOX_HEIGHT / 2 + 0.05 * FONT_SIZE, 5);
  });
});

describe('cap-middle with text taller than the box (MC0, decision 31)', () => {
  // Width that only fits one word per line; the box is 40 px: 2 of the 3 lines of 20 fit.
  const boxed = (text: string): TextNode => ({
    ...textNode(text, 'cap-middle', 36),
    height: 40,
  });
  const boxCenter = BOX_TOP + 40 / 2;

  for (const scale of [1, 4.2]) {
    it(`3 lines in a box of 2 draw 2, centered as in the app (zoom ${scale})`, () => {
      const three = inkCenter(boxed('HHHH HHHH HHHH'), scale);
      const two = inkCenter(boxed('HHHH HHHH'), scale);
      // The same capMiddleShift with 2 lines: the third neither counts nor paints.
      expect(Math.abs(three - two)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(three - boxCenter)).toBeLessThanOrEqual(0.5);
    });
  }
});

describe('capHeightOf (decision 4)', () => {
  const face = book.fontFor('sans-serif', 400, false);

  it('uses the font sCapHeight, at the given size', () => {
    const cap = face.tables?.os2?.sCapHeight as number | undefined;
    expect(cap).toBeGreaterThan(0);
    expect(capHeightOf(face, 14)).toBeCloseTo((cap! / face.unitsPerEm) * 14, 6);
  });

  it('without sCapHeight, falls back to the box of the H glyph', () => {
    const without = Object.create(face, {
      tables: { value: { ...face.tables, os2: { ...face.tables?.os2, sCapHeight: 0 } } },
    }) as Font;
    const box = face.charToGlyph('H').getBoundingBox();
    expect(capHeightOf(without, 14)).toBeCloseTo((box.y2 / face.unitsPerEm) * 14, 6);
  });

  it('without sCapHeight or H, it is 0.7 of the body', () => {
    const bare = {
      unitsPerEm: face.unitsPerEm,
      tables: {},
      charToGlyph: () => ({ index: 0, getBoundingBox: () => ({ y2: 0 }) }),
    } as unknown as Font;
    expect(capHeightOf(bare, 20)).toBeCloseTo(14, 6);
  });
});
