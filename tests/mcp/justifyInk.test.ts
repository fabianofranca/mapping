import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { measureFontOf, plainLines } from '../../mcp/image/textBars';
import { justifiedPieces, textInk } from '../../mcp/image/textLayout';
import {
  createFontBook,
  measurerFor,
  textWidth,
  type FontBook,
} from '../../mcp/image/textMeasurer';
import { baseNode, type TextNode } from '../../src/model/components/scene';

// CL1 / D1: the PNG justifies the text like the app (a line that does not end a paragraph runs to the node's width).

const book = createFontBook();
const measure = measurerFor(book);

function node(
  align: TextNode['style']['align'],
  text: string,
  width: number,
  fontSize = 14,
): TextNode {
  return {
    ...baseNode({ id: 't', name: 't', width, height: 60, transform: [1, 0, 0, 1, 0, 0] }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize,
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

// Stage #2653 (JB1, decisions 3, 4 and 7): a justified line is reordered as a whole, like Chromium's DOM. The `rtl`
// font is the `scripts/testing/gsub-font.mjs --rtl` one (the Hebrew letters are the glyphs of `A` to `J`).
describe('justified line reordered as a whole', () => {
  let dir: string;
  let rtlBook: FontBook;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mapping-justify-'));
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'rtl.ttf'),
      '--rtl',
    ]);
    const file = new Uint8Array(readFileSync(join(dir, 'rtl.ttf')));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    rtlBook = createFontBook([
      { family: 'Rtl', weight: '400', style: 'normal', path: 'fonts/Rtl.ttf', bytes },
    ]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const SIZE = 40;
  const WIDTH = 600;
  const specOf = (family: string, direction?: 'rtl') => ({
    family,
    size: SIZE,
    weight: 400,
    italic: false,
    letterSpacing: 0,
    ...(direction ? { direction } : {}),
  });

  // Measured in Chromium 153 (a `<div>` 600 px wide, size 40, `text-align-last: justify`): each piece and the left
  // edge of its ink, in px (the table of the stage's issue).
  const CASES: {
    text: string;
    family: string;
    direction: 'ltr' | 'rtl';
    pieces: [string, number][];
  }[] = [
    {
      text: 'Hello, world.',
      family: 'sans-serif',
      direction: 'rtl',
      pieces: [
        ['.', 0],
        ['Hello,', 11.1],
        ['world', 504.4],
      ],
    },
    {
      text: 'Pay the invoice.',
      family: 'sans-serif',
      direction: 'rtl',
      pieces: [
        ['.', 0],
        ['Pay', 11.1],
        ['the', 250.0],
        ['invoice', 475.5],
      ],
    },
    {
      text: 'אבג, דה.',
      family: 'Rtl, sans-serif',
      direction: 'rtl',
      // The whole line is one right-to-left run: `דה.` is one word, with its period at its left (the table's `.` 0
      // and `דה` 11.1 are glyph positions inside it, which the parity cases check).
      pieces: [
        ['דה.', 0],
        ['אבג,', 506.6],
      ],
    },
    {
      text: 'אבג דה abc',
      family: 'Rtl, sans-serif',
      direction: 'rtl',
      pieces: [
        ['abc', 0],
        ['דה', 263.3],
        ['אבג', 517.7],
      ],
    },
    {
      text: 'abc אבג, דה def',
      family: 'Rtl, sans-serif',
      direction: 'ltr',
      pieces: [
        ['abc', 0],
        ['דה', 174.8],
        ['אבג,', 340.7],
        ['def', 544.4],
      ],
    },
    {
      text: 'abc, def אבג',
      family: 'Rtl, sans-serif',
      direction: 'rtl',
      pieces: [
        ['אבג', 0],
        ['abc,', 275.5],
        ['def', 544.4],
      ],
    },
  ];

  /** `justifiedPieces` with the inputs `justifiedInk` gives it: the book's runs and the widths of the piece's direction. */
  function piecesOf(c: (typeof CASES)[number]) {
    const spec = specOf(c.family, c.direction === 'rtl' ? 'rtl' : undefined);
    const widthOf = (text: string, rtl: boolean) =>
      textWidth(rtlBook, text, specOf(c.family, rtl ? 'rtl' : undefined));
    const spaces = c.text.split(' ').length - 1;
    const extra = (WIDTH - textWidth(rtlBook, c.text, spec)) / spaces;
    return justifiedPieces(
      c.text,
      rtlBook.bidiRuns(c.text, c.direction),
      widthOf,
      textWidth(rtlBook, ' ', spec),
      extra,
    );
  }

  for (const c of CASES) {
    it(`pieces of "${c.text}" (${c.direction}) sit where Chromium puts them`, () => {
      const pieces = piecesOf(c);
      expect(pieces.map((p) => c.text.slice(p.start, p.end))).toEqual(
        c.pieces.map(([text]) => text),
      );
      pieces.forEach((p, i) => expect(Math.abs(p.x - c.pieces[i]![1])).toBeLessThan(0.1));
    });
  }

  function boxed(
    align: TextNode['style']['align'],
    text: string,
    width: number,
    direction?: 'rtl',
  ): TextNode {
    const n = node(align, text, width, SIZE);
    return {
      ...n,
      height: 200,
      style: { ...n.style, lineHeight: 60, ...(direction ? { direction } : {}) },
    };
  }

  // The first line of this text is `Hello, world.` (the long word does not fit after it), so it is justified.
  const WRAPPED = 'Hello, world. abcdefghijklmnopqrstuvwxyz';

  /** The polygons of the first line (above y = 60) of the node, in drawing order. */
  const firstLine = (n: TextNode) =>
    textInk(n, measure, book)
      .glyphs.flatMap((g) => g.polygons)
      .filter((poly) => poly.every((p) => p.y < 60));

  /** The plain `ltr` ink of `text`, shifted by `x`. */
  const shifted = (text: string, x: number) =>
    firstLine(boxed('left', text, 1000)).map((poly) =>
      poly.map((p) => ({ x: p.x + x, y: p.y })),
    );

  it('Hello, world. justified in rtl: the period is at the left edge and the comma stays right of Hello', () => {
    const actual = firstLine(boxed('justify', WRAPPED, WIDTH, 'rtl'));
    const expected = [
      ...shifted('.', 0),
      ...shifted('Hello,', 11.1),
      ...shifted('world', 504.4),
    ];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((poly, i) =>
      poly.forEach((p, j) => {
        expect(Math.abs(p.x - expected[i]![j]!.x)).toBeLessThan(0.1);
        expect(p.y).toBeCloseTo(expected[i]![j]!.y, 6);
      }),
    );
  });

  it('an ltr Latin justified line keeps its ink: the words from the left, in logical order', () => {
    const text = 'one two three four';
    const n = boxed('justify', text + ' abcdefghijklmnopqrstuvwxyz', WIDTH);
    const spec = specOf('sans-serif');
    const words = text.split(' ');
    const extra = (WIDTH - textWidth(book, text, spec)) / (words.length - 1);
    let x = 0;
    const expected = words.flatMap((word) => {
      const ink = shifted(word, x);
      x += textWidth(book, word, spec) + textWidth(book, ' ', spec) + extra;
      return ink;
    });
    const actual = firstLine(n);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((poly, i) =>
      poly.forEach((p, j) => {
        expect(p.x).toBeCloseTo(expected[i]![j]!.x, 6);
        expect(p.y).toBeCloseTo(expected[i]![j]!.y, 6);
      }),
    );
  });
});
