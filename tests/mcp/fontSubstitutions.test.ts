import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { textWidth } from '../../mcp/image/glyphs';
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
