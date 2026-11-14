import { describe, expect, it } from 'vitest';
import { measureFontOf, plainLines } from '../../mcp/image/textBars';
import { textInk } from '../../mcp/image/textLayout';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, type TextNode } from '../../src/model/components/scene';

// CL1 / D1: the PNG justifies the text like the app (a line that does not end a paragraph runs to the node's width).

const book = createFontBook();
const measure = measurerFor(book);

function node(align: TextNode['style']['align'], text: string, width: number): TextNode {
  return {
    ...baseNode({ id: 't', name: 't', width, height: 60, transform: [1, 0, 0, 1, 0, 0] }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
    },
  };
}

const maxX = (n: TextNode): number =>
  Math.max(
    ...textInk(n, measure, book).glyphs.flatMap((g) => g.polygons.flat().map((p) => p.x)),
  );

describe('justified textInk', () => {
  const text = 'one two three four five six seven eight nine ten';
  it('the first line runs to the node width', () => {
    const justified = maxX(node('justify', text, 150));
    const left = maxX(node('left', text, 150));
    expect(justified).toBeGreaterThan(left + 1);
    expect(justified).toBeGreaterThan(148);
    expect(justified).toBeLessThanOrEqual(150.5);
  });
  it('the last line of the paragraph stays on the left', () => {
    const short = node('justify', 'short here', 200);
    expect(maxX(short)).toBeLessThan(150);
  });
});

// The Portuguese sample text below stays: the wrapping asserted depends on its measured widths.
// Decision 10 of #1631: `customEnds` counts the words by the space, as `wrapWords` breaks them; a
// word wider than the box stays whole on a line, so it is never split across several.
describe('paragraph ends with maxLines and a word wider than the box', () => {
  it('only the last line of each paragraph closes, with the wide word whole', () => {
    const n: TextNode = {
      ...node(
        'justify',
        'um dois\nsupercalifragilisticoexpialidoso tres quatro\ncinco',
        60,
      ),
      height: 200,
    };
    const withMax: TextNode = { ...n, style: { ...n.style, maxLines: 8 } };
    const widthOf = (text: string) => measure(text, measureFontOf(n.style)).width;
    const { lines, ends } = plainLines(withMax, measure, widthOf);
    // The wide word stays whole, on a line of its own.
    expect(lines).toContain('supercalifragilisticoexpialidoso');
    // One entry per line; it closes the last line of each `\n` and no other.
    const closing = lines.flatMap((line, i) => (ends[i] ? [line] : []));
    expect(closing).toEqual(['um dois', 'quatro', 'cinco']);
  });
});
