// RT2 of #2916: `baselineShift` in the MCP raster: the bars (`textBars`) and the glyphs
// (`textInk`, with the embedded font) of a shifted piece sit `shift` px higher, decoration included.
import { describe, expect, it } from 'vitest';
import { textBars } from '../../mcp/image/textBars';
import { textInk } from '../../mcp/image/textLayout';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { instantiate } from '../../src/model/components/instantiate';
import { walk, type TextNode } from '../../src/model/components/scene';

const book = createFontBook();
const measure = measurerFor(book);

function textNode(runs: unknown[]): TextNode {
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
    { measure },
  );
  const found = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!found) throw new Error('no text node');
  return found;
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
