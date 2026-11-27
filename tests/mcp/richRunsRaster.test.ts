// RT2 and RT4 of #2916: `baselineShift` and the inline icon run in the MCP raster: the bars (`textBars`) and the glyphs
// (`textInk`, with the embedded font) of a shifted piece sit `shift` px higher, decoration included.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { textBars } from '../../mcp/image/textBars';
import { textInk } from '../../mcp/image/textLayout';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import type { IconSet } from '../../src/model/components/icons';
import { instantiate } from '../../src/model/components/instantiate';
import { walk, type SceneNode, type TextNode } from '../../src/model/components/scene';

const book = createFontBook();
const measure = measurerFor(book);

const ICONS: IconSet = {
  viewBox: [24, 24],
  icons: { box: { paths: [{ d: 'M4 4h16v16H4z', fill: true }] } },
};

function textNode(runs: unknown[]): TextNode {
  return sceneOf(runs).text;
}

function sceneOf(runs: unknown[]): { root: SceneNode; text: TextNode } {
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width: 200, height: 40 },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 200,
          height: 40,
          font: { size: 14, lineHeight: 20 },
          runs,
        },
      ],
    } as ComponentFile['template'],
  };
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, width: 200, height: 40 },
    { measure, icons: ICONS },
  );
  const found = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!found) throw new Error('no text node');
  return { root, text: found };
}

const CHIP = { background: '#ffeecc', radius: 3, padding: [2, 4] };
const runs = (shift: unknown, extra: Record<string, unknown> = {}) => [
  { text: 'ab ' },
  { text: 'up', ...(shift === undefined ? {} : { baselineShift: shift }), ...extra },
];

const minY = (n: TextNode, index: number): number =>
  Math.min(
    ...(textInk(n, measure, book)
      .glyphs[index]?.polygons.flat()
      .map((p) => p.y) ?? []),
  );

describe('baselineShift in the bars', () => {
  it('the shifted piece bar is `shift` px higher; the other is unchanged', () => {
    const base = textBars(textNode(runs(undefined)), measure);
    const moved = textBars(textNode(runs(4)), measure);
    expect(moved[0]?.y).toBeCloseTo(base[0]?.y ?? 0, 10);
    expect((base[1]?.y ?? 0) - (moved[1]?.y ?? 0)).toBeCloseTo(4, 10);
  });

  it("a chip's background and its bar move together", () => {
    const base = textBars(textNode(runs(undefined, CHIP)), measure);
    const moved = textBars(textNode(runs('50%', CHIP)), measure);
    // 50% of the 14 px font
    expect((base[1]?.y ?? 0) - (moved[1]?.y ?? 0)).toBeCloseTo(7, 10);
    expect((base[2]?.y ?? 0) - (moved[2]?.y ?? 0)).toBeCloseTo(7, 10);
  });
});

describe('baselineShift in the glyphs', () => {
  it('the glyphs of the shifted piece are `shift` px higher', () => {
    const base = textNode(runs(undefined));
    const moved = textNode(runs(4));
    expect(minY(moved, 0)).toBeCloseTo(minY(base, 0), 6);
    expect(minY(base, 1) - minY(moved, 1)).toBeCloseTo(4, 6);
  });

  it("a chip's box moves with its glyphs", () => {
    const base = textInk(textNode(runs(undefined, CHIP)), measure, book);
    const moved = textInk(textNode(runs(4, CHIP)), measure, book);
    expect((base.boxes[0]?.y ?? 0) - (moved.boxes[0]?.y ?? 0)).toBeCloseTo(4, 10);
  });

  it('the decoration line moves with its piece', () => {
    const base = textInk(
      textNode(runs(undefined, { decoration: 'underline' })),
      measure,
      book,
    );
    const moved = textInk(textNode(runs(4, { decoration: 'underline' })), measure, book);
    const maxY = (ink: typeof base): number =>
      Math.max(...(ink.glyphs[1]?.polygons.flat().map((p) => p.y) ?? []));
    expect(maxY(base) - maxY(moved)).toBeCloseTo(4, 6);
  });
});

// ---------------------------------------------------------------------------------------
// RT4: the inline icon run
// ---------------------------------------------------------------------------------------

function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (Math.floor(y) * raster.width + Math.floor(x)) * 4;
  return [...raster.data.subarray(i, i + 3)];
}

function paintRuns(runs: unknown[], fonts: boolean, scale = 1): Raster {
  const { root } = sceneOf(runs);
  const raster = createRaster(200 * scale, 40 * scale);
  raster.data.fill(255);
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    ...(fonts ? { fonts: book } : {}),
  });
  return raster;
}

const RED = [255, 0, 0];
const WHITE = [255, 255, 255];

describe.each([
  ['with fonts', true],
  ['without fonts (bars)', false],
])('the icon in the raster, %s', (_name, fonts) => {
  // One icon, 24 px, alone: the box is (0, 0, 24, 24) and the square fills 4..20 of it.
  const only = (extra: Record<string, unknown> = {}) => [
    { icon: 'box', size: 24, color: '#ff0000', ...extra },
  ];

  it('paints the icon at the piece box, in the run color', () => {
    const raster = paintRuns(only(), fonts);
    expect(pixel(raster, 12, 12)).toEqual(RED);
    expect(pixel(raster, 2, 12)).toEqual(WHITE);
    expect(pixel(raster, 30, 12)).toEqual(WHITE);
  });

  it('moves with the piece: after a text run it starts where the piece does', () => {
    const { text } = sceneOf([{ text: 'abc ' }, ...only()]);
    const piece = text.runLayout!.lines[0]!.pieces[1]!;
    const raster = paintRuns([{ text: 'abc ' }, ...only()], fonts);
    expect(pixel(raster, piece.x + 12, 12)).toEqual(RED);
    expect(pixel(raster, piece.x + 1, 12)).toEqual(WHITE);
  });

  it('the run baselineShift moves it up', () => {
    const raster = paintRuns(only({ baselineShift: 6 }), fonts);
    // the square covered 4..20 in y; shifted by 6 it covers -2..14
    expect(pixel(raster, 12, 10)).toEqual(RED);
    expect(pixel(raster, 12, 17)).toEqual(WHITE);
  });

  it('scales with the drawing', () => {
    const raster = paintRuns(only(), fonts, 2);
    expect(pixel(raster, 24, 24)).toEqual(RED);
    expect(pixel(raster, 4, 24)).toEqual(WHITE);
    expect(pixel(raster, 24, 60)).toEqual(WHITE);
  });

  it('a text whose only run is an icon still draws', () => {
    const { text } = sceneOf(only());
    expect(text.text).toBe('');
    expect(pixel(paintRuns(only(), fonts), 12, 12)).toEqual(RED);
  });
});

describe('an icon piece has no glyph, bar or decoration', () => {
  const runs = [{ text: 'ab ' }, { icon: 'box', size: 24 }];

  it('textBars gives only the bar of the text piece', () => {
    expect(textBars(textNode(runs), measure)).toHaveLength(1);
  });

  it('textBars of an icon-only text is empty', () => {
    expect(textBars(textNode([{ icon: 'box' }]), measure)).toEqual([]);
  });

  it('textInk gives the glyphs of the text piece only', () => {
    const ink = textInk(textNode(runs), measure, book);
    expect(ink.glyphs).toHaveLength(1);
    expect(ink.boxes).toEqual([]);
    expect(textInk(textNode([{ icon: 'box' }]), measure, book).glyphs).toEqual([]);
  });
});
