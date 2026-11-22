import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { embolden, textPolygons, textWidth, type Polygon } from '../../mcp/image/glyphs';
import { createFontBook, matchFace } from '../../mcp/image/textMeasurer';
import type { LoadedFont } from '../../src/model/components/library';

// Stage #2448 (BD2, decisions 11 to 13): the CSS weight matching, the synthetic bold and the synthetic italic.

const bytes = (path: string): ArrayBuffer => {
  const b = new Uint8Array(readFileSync(path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const sansBytes = bytes('mcp/fonts/MappingSans-Regular.ttf');
const monoBytes = bytes('mcp/fonts/MappingMono-Regular.ttf');

const entry = (
  family: string,
  weight: string,
  style: 'normal' | 'italic' = 'normal',
  data = sansBytes,
): LoadedFont => ({ family, weight, style, path: `${family}.ttf`, bytes: data });

const face = (low: number, high = low, italic = false, id = `${low}`) => ({
  low,
  high,
  italic,
  id,
});
const pick = (
  faces: ReturnType<typeof face>[],
  weight: number,
  italic = false,
): string | undefined => matchFace(faces, weight, italic)?.id;

describe('matchFace (CSS Fonts 4, 5.2)', () => {
  const all = [100, 300, 400, 500, 700, 900].map((w) => face(w));

  it('a weight inside a face range matches it', () => {
    expect(pick([face(100, 900, false, 'var'), face(400)], 650)).toBe('var');
    expect(pick(all, 500)).toBe('500');
  });

  it('400 to 500: up to 500 ascending, then lighter descending, then heavier', () => {
    expect(pick([face(300), face(700)], 450)).toBe('300');
    expect(pick([face(400), face(900)], 450)).toBe('400');
    expect(pick([face(500), face(300)], 400)).toBe('500');
    expect(pick([face(300), face(700)], 400)).toBe('300');
    expect(pick([face(700), face(900)], 450)).toBe('700');
    expect(pick([face(100), face(300), face(700)], 500)).toBe('300');
  });

  it('below 400: lighter descending, then heavier ascending', () => {
    expect(pick([face(100), face(300), face(500)], 350)).toBe('300');
    expect(pick([face(500), face(700)], 300)).toBe('500');
  });

  it('above 500: heavier ascending, then lighter descending', () => {
    expect(pick([face(400), face(900)], 550)).toBe('900');
    expect(pick([face(400), face(700), face(900)], 600)).toBe('700');
    expect(pick([face(300), face(400)], 700)).toBe('400');
  });

  it('the style comes first, and a tie goes to the first face', () => {
    expect(pick([face(400, 400, false, 'a'), face(700, 700, true, 'b')], 400, true)).toBe(
      'b',
    );
    expect(pick([face(400, 400, false, 'a'), face(400, 400, false, 'b')], 400)).toBe('a');
    expect(matchFace([], 400, false)).toBeUndefined();
  });
});

describe('FontBook.synthesis', () => {
  it('a library face with no bold gets synthetic bold from weight 600', () => {
    const book = createFontBook([entry('lib', '400')]);
    expect(book.synthesis('lib', 700, false).bold).toBe(true);
    expect(book.synthesis('lib', 600, false).bold).toBe(true);
    expect(book.synthesis('lib', 500, false).bold).toBe(false);
  });

  it('a face with a bold weight is not emboldened', () => {
    const book = createFontBook([entry('lib', '400'), entry('lib', '700')]);
    expect(book.synthesis('lib', 700, false).bold).toBe(false);
    const variable = createFontBook([entry('var', '100 900')]);
    expect(variable.synthesis('var', 800, false).bold).toBe(false);
  });

  it('the embedded fonts are never emboldened and lean 0.2', () => {
    const book = createFontBook([entry('lib', '400')]);
    expect(book.synthesis('sans-serif', 700, true)).toEqual({ bold: false, slant: 0.2 });
    expect(book.synthesis('monospace', 900, false)).toEqual({ bold: false, slant: 0 });
  });

  it('a library face leans 0.25 when it is not italic, and not at all when it is', () => {
    const book = createFontBook([
      entry('lib', '400'),
      entry('ital', '400', 'italic'),
      entry('ital', '400'),
    ]);
    expect(book.synthesis('lib', 400, true).slant).toBe(0.25);
    expect(book.synthesis('lib', 400, false).slant).toBe(0);
    expect(book.synthesis('ital', 400, true).slant).toBe(0);
  });

  it('weight 550 between faces 400 and 900 measures with the 900 face', () => {
    const book = createFontBook([
      entry('pair', '400'),
      entry('pair', '900', 'normal', monoBytes),
    ]);
    const mono = createFontBook([entry('m', '400', 'normal', monoBytes)]);
    const font = (family: string, weight: number) => ({
      family,
      size: 100,
      weight,
      italic: false,
      lineHeight: 120,
      letterSpacing: 0,
    });
    expect(textWidth(book, 'Hamburgefonstiv', font('pair', 550))).toBeCloseTo(
      textWidth(mono, 'Hamburgefonstiv', font('m', 400)),
      6,
    );
    expect(textWidth(book, 'Hamburgefonstiv', font('pair', 450))).not.toBeCloseTo(
      textWidth(mono, 'Hamburgefonstiv', font('m', 400)),
      3,
    );
  });
});

const box = (polygons: readonly Polygon[]) => {
  const pts = polygons.flat();
  return {
    left: Math.min(...pts.map((p) => p.x)),
    right: Math.max(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
};

describe('synthetic bold and italic drawing', () => {
  const book = createFontBook([entry('lib', '400')]);
  const draw = (text: string, size: number, weight: number, italic: boolean) => {
    const f = book.fontFor('lib', weight, italic);
    return textPolygons(
      f,
      () => book.embeddedFor('lib', weight),
      text,
      0,
      () => 0,
      { size, letterSpacing: 0, italic, weight },
      book.synthesis('lib', weight, italic),
    ).polygons;
  };

  it('H at 1000 px grows 15.625 ± 0.5 px on each side, with the same advance', () => {
    const plain = box(draw('H', 1000, 400, false));
    const bold = box(draw('H', 1000, 700, false));
    expect(plain.left - bold.left).toBeCloseTo(15.625, 0);
    expect(bold.right - plain.right).toBeCloseTo(15.625, 0);
    expect(plain.top - bold.top).toBeCloseTo(15.625, 0);
    expect(bold.bottom - plain.bottom).toBeCloseTo(15.625, 0);
    const font = (weight: number) => ({
      family: 'lib',
      size: 1000,
      weight,
      italic: false,
      lineHeight: 1200,
      letterSpacing: 0,
    });
    expect(textWidth(book, 'H', font(700))).toBe(textWidth(book, 'H', font(400)));
  });

  it('emboldens a square outward with miter joins, in either orientation', () => {
    const square: Polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    for (const poly of [square, [...square].reverse()]) {
      const b = box(embolden([poly], 100));
      const d = 100 / 32 / 2;
      expect(b.left).toBeCloseTo(-d, 6);
      expect(b.right).toBeCloseTo(100 + d, 6);
      expect(b.top).toBeCloseTo(-d, 6);
    }
  });

  it('the ratio goes from 1/24 up to 9 px to 1/32 from 36 px', () => {
    const square: Polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(box(embolden([square], 9)).left).toBeCloseTo(-9 / 24 / 2, 6);
    expect(box(embolden([square], 36)).left).toBeCloseTo(-36 / 32 / 2, 6);
  });

  it('the slant is 0.25 for a library face, 0.2 for the embedded one and none for an italic face', () => {
    const lean = (polys: Polygon[]) => {
      const b = box(polys);
      return b;
    };
    const upright = lean(draw('I', 100, 400, false));
    const library = lean(draw('I', 100, 400, true));
    const rise = -upright.top;
    expect(library.right - upright.right).toBeCloseTo(rise * 0.25, 1);
    const embedded = createFontBook();
    const e = (italic: boolean) =>
      textPolygons(
        embedded.fontFor('sans-serif', 400, italic),
        () => embedded.embeddedFor('sans-serif', 400),
        'I',
        0,
        () => 0,
        { size: 100, letterSpacing: 0, italic },
      ).polygons;
    expect(box(e(true)).right - box(e(false)).right).toBeCloseTo(rise * 0.2, 1);
    const italicBook = createFontBook([entry('ital', '400', 'italic')]);
    const f = italicBook.fontFor('ital', 400, true);
    const same = (italic: boolean) =>
      textPolygons(
        f,
        () => f,
        'I',
        0,
        () => 0,
        { size: 100, letterSpacing: 0, italic },
        italicBook.synthesis('ital', 400, italic),
      ).polygons;
    expect(box(same(true))).toEqual(box(same(false)));
  });
});
