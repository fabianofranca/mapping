import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { textWidth } from '../../mcp/image/glyphs';
import { textInk } from '../../mcp/image/textLayout';
import { baseNode, type TextNode } from '../../src/model/components/scene';
import { guardedLayout } from '../../mcp/image/fontSubstitutions';
import type { Face } from '../../mcp/image/harfbuzz';
import {
  createFontBook,
  loadLibraryFont,
  measurerFor,
} from '../../mcp/image/textMeasurer';

// Stage #2089 (FM1), stage #2121 (HB2, decision 9): HarfBuzz applies every lookup, so nothing is pruned or probed; what
// stays is the last-resort guard: a shaping that throws is laid out with the embedded font.

let dir: string;
let bytes: ArrayBuffer;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mapping-subst-'));
  execFileSync('node', ['scripts/testing/gsub-font.mjs', join(dir, 'gsub.ttf')]);
  const file = new Uint8Array(readFileSync(join(dir, 'gsub.ttf')));
  bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const gsubEntry = () => ({
  family: 'Gsub',
  weight: '400',
  style: 'normal' as const,
  path: 'fonts/Gsub.ttf',
  bytes,
});

describe('the library font book', () => {
  it('loads the test font of #2089 (nothing is skipped) and keeps it', () => {
    expect(loadLibraryFont(bytes)).not.toBeNull();
    const book = createFontBook([gsubEntry()]);
    expect(book.hasLibraryFonts).toBe(true);
    expect(book.fontFor('Gsub', 400, false)).not.toBe(book.embeddedFor('Gsub', 400));
  });

  it('bytes that are not a font load as null, and the book leaves them out', () => {
    expect(loadLibraryFont(new ArrayBuffer(8))).toBeNull();
    expect(
      createFontBook([{ ...gsubEntry(), bytes: new ArrayBuffer(8) }]).hasLibraryFonts,
    ).toBe(false);
  });

  it('the embedded stand-in follows the same first-match rule as `fontFor`', () => {
    const book = createFontBook([gsubEntry()]);
    const mono = book.embeddedFor('monospace', 400);
    const sans = book.embeddedFor('sans-serif', 400);
    expect(mono).not.toBe(sans);
    // The library font comes first in the stack: its stand-in is proportional, not the mono face.
    expect(book.embeddedFor('Gsub, monospace', 400)).toBe(sans);
    // A mono family first: the mono face, as `fontFor` resolves it.
    expect(book.embeddedFor('monospace, Gsub', 400)).toBe(mono);
  });

  // Stage #2267, decision 1: a monospace name falls back to Mapping Mono, library family or not.
  it('a monospace library family falls back to Mapping Mono (bold from 600)', () => {
    const book = createFontBook([{ ...gsubEntry(), family: 'JetBrains Mono' }]);
    const plain = createFontBook();
    expect(book.fontFor('JetBrains Mono', 400, false)).not.toBe(
      book.embeddedFor('JetBrains Mono', 400),
    );
    expect(book.embeddedFor('JetBrains Mono', 400)).toBe(
      plain.embeddedFor('monospace', 400),
    );
    expect(book.embeddedFor('JetBrains Mono', 700)).toBe(
      plain.embeddedFor('monospace', 700),
    );
    expect(book.embeddedFor('JetBrains Mono', 400)).not.toBe(
      plain.embeddedFor('sans-serif', 400),
    );
    // A library family that is not a mono name stays on the sans.
    expect(book.embeddedFor('Gsub', 400)).toBe(plain.embeddedFor('sans-serif', 400));
  });
});

describe('guardedLayout', () => {
  const face = (name: string) => ({ name }) as unknown as Face;

  it('a layout that works is not touched', () => {
    const own = face('own');
    const result = guardedLayout(
      own,
      () => {
        throw new Error('no fallback needed');
      },
      (f) => (f as unknown as { name: string }).name,
    );
    expect(result).toBe('own');
  });

  it('a layout that throws is laid out with the embedded font', () => {
    const own = face('own');
    const embedded = face('embedded');
    const result = guardedLayout(
      own,
      () => embedded,
      (f) => {
        if (f === own) throw new Error('boom');
        return 'embedded';
      },
    );
    expect(result).toBe('embedded');
  });

  it('a throw of the embedded font itself reaches the caller (a programming error)', () => {
    expect(() =>
      guardedLayout(
        face('own'),
        () => face('embedded'),
        () => {
          throw new Error('always');
        },
      ),
    ).toThrow('always');
  });
});

describe('the book guards the text it measures', () => {
  const style = {
    family: 'Gsub',
    size: 14,
    weight: 400,
    italic: false,
    letterSpacing: 0,
  };

  it('a face that starts to throw falls back to the embedded font, and the book keeps measuring', () => {
    const book = createFontBook([gsubEntry()]);
    const face = book.fontFor('Gsub', 400, false) as { advance: Face['advance'] };
    const real = face.advance.bind(face);
    expect(textWidth(book, 'fit', style)).toBeCloseTo(real('fit', 14), 6);

    face.advance = () => {
      throw new Error('always');
    };
    const embedded = book.embeddedFor('Gsub', 400);
    expect(textWidth(book, 'fit', style)).toBeCloseTo(embedded.advance('fit', 14), 6);
  });

  it('the measurer measures with the embedded font while the face throws, and with it again after', () => {
    const book = createFontBook([gsubEntry()]);
    const measure = measurerFor(book);
    const face = book.fontFor('Gsub', 400, false) as { advance: Face['advance'] };
    const real = face.advance.bind(face);
    const font = { ...style, lineHeight: 20 };
    const whole = measure('ii', font).width;
    expect(whole).toBeCloseTo(real('ii', 14), 6);
    face.advance = () => {
      throw new Error('boom');
    };
    const embedded = book.embeddedFor('Gsub', 400);
    expect(measure('zzz', font).width).toBeCloseTo(embedded.advance('zzz', 14), 6);
    face.advance = real;
    expect(measure('iii', font).width).toBeCloseTo(real('iii', 14), 6);
  });
});

// Stage #2267, decision 2 (#2268): the metrics come from the face that lays the text out.
describe('a library face that throws is drawn and measured with the embedded face, metrics included', () => {
  const acme = () => {
    // Mapping Mono under the family `Acme`: its ascent and descent differ from Mapping Sans, the embedded stand-in.
    const mono = new Uint8Array(readFileSync('mcp/fonts/MappingMono-Regular.ttf'));
    return {
      family: 'Acme',
      weight: '400',
      style: 'normal' as const,
      path: 'fonts/Acme.ttf',
      bytes: mono.buffer.slice(
        mono.byteOffset,
        mono.byteOffset + mono.byteLength,
      ) as ArrayBuffer,
    };
  };
  const breakFace = (face: Face): (() => void) => {
    const own = face as { advance: Face['advance']; path: Face['path'] };
    const { advance, path } = own;
    own.advance = () => {
      throw new Error('boom');
    };
    own.path = () => {
      throw new Error('boom');
    };
    return () => {
      own.advance = advance;
      own.path = path;
    };
  };
  const node = (
    family: string,
    text: string,
    style: Partial<TextNode['style']> = {},
  ): TextNode => ({
    ...baseNode({
      id: 't',
      name: 't',
      width: 200,
      height: 60,
      transform: [1, 0, 0, 1, 0, 0],
    }),
    type: 'text',
    text,
    style: {
      fontFamily: family,
      fontSize: 14,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
      ...style,
    },
  });
  const polygonsOf = (book: ReturnType<typeof createFontBook>, n: TextNode) =>
    textInk(n, measurerFor(book), book).glyphs.map((g) => g.polygons);

  it.each([
    ['the baseline', {}],
    ['the underline', { decoration: 'underline' as const }],
    ['cap-middle', { verticalAlign: 'cap-middle' as const }],
    ['the baseline padding', { baselineTop: 4 }],
  ])('%s come from the embedded face', (_name, style) => {
    const book = createFontBook([acme()]);
    const restore = breakFace(book.fontFor('Acme', 400, false));
    const drawn = polygonsOf(book, node('Acme', 'Hello', style));
    restore();
    // Mapping Sans is what a family that resolves to nothing draws with.
    expect(drawn).toEqual(
      polygonsOf(createFontBook(), node('sans-serif', 'Hello', style)),
    );
  });

  it('a justified line and its decoration come from the embedded face', () => {
    const book = createFontBook([acme()]);
    const restore = breakFace(book.fontFor('Acme', 400, false));
    const style = { align: 'justify' as const, decoration: 'line-through' as const };
    const text = 'one two three four five six seven eight nine ten';
    const drawn = polygonsOf(book, { ...node('Acme', text, style), width: 150 });
    restore();
    const expected = polygonsOf(createFontBook(), {
      ...node('sans-serif', text, style),
      width: 150,
    });
    expect(drawn).toEqual(expected);
  });

  it('a monospace library family that throws is drawn with Mapping Mono and its baseline', () => {
    const book = createFontBook([{ ...gsubEntry(), family: 'JetBrains Mono' }]);
    const restore = breakFace(book.fontFor('JetBrains Mono', 400, false));
    const drawn = polygonsOf(
      book,
      node('JetBrains Mono', 'Hello', { decoration: 'underline' }),
    );
    restore();
    expect(drawn).toEqual(
      polygonsOf(
        createFontBook(),
        node('monospace', 'Hello', { decoration: 'underline' }),
      ),
    );
  });

  it('the measurer takes the baseline of the face that lays the text out, and the library face again once it works', () => {
    const book = createFontBook([acme()]);
    const measure = measurerFor(book);
    const font = {
      family: 'Acme',
      size: 14,
      weight: 400,
      italic: false,
      letterSpacing: 0,
      lineHeight: 20,
    };
    const baselineWith = (face: Face) =>
      10 + ((face.ascender - -face.descender) * (14 / face.unitsPerEm)) / 2;
    const library = book.fontFor('Acme', 400, false);
    const embedded = book.embeddedFor('Acme', 400);
    const restore = breakFace(library);
    expect(measure('broken', font).firstBaseline).toBeCloseTo(baselineWith(embedded), 6);
    restore();
    expect(measure('working', font).firstBaseline).toBeCloseTo(baselineWith(library), 6);
    expect(baselineWith(library)).not.toBeCloseTo(baselineWith(embedded), 3);
  });
});
