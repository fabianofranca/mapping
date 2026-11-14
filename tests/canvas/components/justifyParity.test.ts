// MF1: `align: "justify"` breaks the same in the app (Konva) and in the MCP raster (textBars): in a paragraph
// of 3 lines, the first two take the box width and the last stays on the left, at the natural
// size, like `TextAlign.Justify`. The `\n` opens another paragraph, with its own last line.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { textBars } from '../../../mcp/image/textBars';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

// Same measure as the Konva fake context: 6 px per letter.
const measure = (text: string) => ({ width: text.length * 6, height: 14 });

function node(text: string): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 80,
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 14,
      align: 'justify',
      verticalAlign: 'top',
    },
  };
}

function konvaText(n: TextNode): Konva.Text {
  const { root } = renderScene({ root: n, warnings: [] });
  const found = (root.find('Text') as Konva.Text[])[0];
  if (!found) throw new Error('no text');
  return found;
}

describe('justify: paridade entre o Konva e o raster', () => {
  const paragraph = node('aaaa bbbb cccc dddd eeee ffff');

  it('a 3-line paragraph: the first two justified, the last on the left', () => {
    const text = konvaText(paragraph);
    expect(text.align()).toBe('justify');
    expect(text.textArr.map((l) => l.text)).toEqual([
      'aaaa bbbb',
      'cccc dddd',
      'eeee ffff',
    ]);
    expect(text.textArr.map((l) => l.lastInParagraph)).toEqual([false, false, true]);

    const bars = textBars(paragraph, measure);
    expect(bars.map((b) => [b.x, b.width])).toEqual([
      [0, 60],
      [0, 60],
      [0, 54],
    ]);
  });

  it('each paragraph (\\n) has its last line on the left, as in Konva', () => {
    const two = node('aaaa bbbb cccc dddd\neeee');
    const text = konvaText(two);
    expect(text.textArr.map((l) => l.lastInParagraph)).toEqual([false, true, true]);
    const bars = textBars(two, measure);
    expect(bars.map((b) => b.width)).toEqual([60, 54, 24]);
  });

  it('a one-word line (no space) is not stretched, as in Konva', () => {
    const word = node('abcdefgh ijklmnop');
    const bars = textBars(word, measure);
    // 1st line: "abcdefgh" (48 px, no space, not stretched); 2nd: "ijklmnop", the last
    expect(bars.map((b) => b.width)).toEqual([48, 48]);
    const lines = konvaText(word).textArr;
    expect(lines.map((l) => l.text)).toEqual(['abcdefgh', 'ijklmnop']);
  });

  it('with maxLines, the \\n still closes the paragraph; without width, there is no stretched bar', () => {
    const plain = node('aaaa bbbb\ncccc dddd eeee');
    const capped = { ...plain, style: { ...plain.style, maxLines: 4 } };
    const measured = (text: string) => ({
      width: text.length * 6,
      height: 14,
      lines: ['aaaa bbbb', 'cccc dddd', 'eeee'],
    });
    expect(textBars(capped, measured).map((b) => b.width)).toEqual([54, 60, 24]);
    const free = { ...node('aaaa bbbb cccc'), width: 0 };
    expect(textBars(free, measure).every((b) => b.width > 0)).toBe(true);
  });
});
