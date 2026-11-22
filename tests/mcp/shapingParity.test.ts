import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { textPolygons } from '../../mcp/image/glyphs';
import {
  createFontBook,
  createMeasurer,
  type FontBook,
} from '../../mcp/image/textMeasurer';
import type { Face } from '../../mcp/image/harfbuzz';
import type { MeasureFont } from '../../src/model/components/instantiate';
import {
  BIDI_CASES,
  PARITY_FONTS,
  PARITY_SIZE,
  PARITY_SPACINGS,
  PARITY_STRINGS,
  parityFaces,
  WEIGHT_CASES,
  VARIABLE_CASES,
  SLANTED_CASES,
  INK_TOLERANCE,
  parityKey,
  type ExtraCase,
  type ParityCase,
} from '../support/shapingParity';

// Stage #2121 (HB3, decision 13): the server's widths for Mapping Sans, the `--calt` font and Roboto Regular (`.woff2`, #2126) at size 100, spaced and
// not. `tests/e2e/shapingParity.spec.ts` measures the same cases in Chromium against the same fixture.

const FIXTURE = 'tests/fixtures/shaping-parity.json';

function measured(): ParityCase[] {
  const buffer = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const fonts = parityFaces().map((f) => ({
    family: f.family,
    weight: f.weight,
    style: f.style,
    path: `fonts/${f.family}-${f.weight}-${f.style}.${f.ext}`,
    bytes: buffer(f.bytes),
  }));
  const measure = createMeasurer(fonts);
  const book = createFontBook(fonts);
  const fontOf = (c: ExtraCase): MeasureFont => ({
    family: c.font,
    size: PARITY_SIZE,
    weight: c.weight ?? 400,
    italic: c.italic ?? false,
    lineHeight: 120,
    letterSpacing: c.letterSpacing,
    ...(c.direction ? { direction: c.direction } : {}),
  });
  const base: ParityCase[] = PARITY_FONTS.flatMap((font) =>
    PARITY_STRINGS.flatMap((text) =>
      PARITY_SPACINGS.map((letterSpacing) => ({
        font,
        text,
        letterSpacing,
        width: measure(text, fontOf({ font, text, letterSpacing })).width,
      })),
    ),
  );
  const extra: ParityCase[] = BIDI_CASES.map((c) => ({
    ...c,
    width: measure(c.text, fontOf(c)).width,
    starts: startsOf(book.fontFor(c.font, 400, false), c),
  }));
  const weights: ParityCase[] = WEIGHT_CASES.map((c) => ({
    ...c,
    width: measure(c.text, fontOf(c)).width,
    ink: inkOf(book, c, fontOf(c)),
  }));
  const variable: ParityCase[] = VARIABLE_CASES.map((c) => ({
    ...c,
    width: measure(c.text, fontOf(c)).width,
    ink: inkOf(book, c, fontOf(c)),
  }));
  const slanted: ParityCase[] = SLANTED_CASES.map((c) => ({
    ...c,
    width: measure(c.text, fontOf(c)).width,
    ink: inkOf(book, c, fontOf(c)),
  }));
  return [...base, ...extra, ...weights, ...variable, ...slanted];
}

const monoBuffer = (): ArrayBuffer => {
  const b = readFileSync('mcp/fonts/MappingMono-Regular.ttf');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The bounding box of the ink the server draws, from the origin and the baseline (what `measureText` reports). */
function inkOf(book: FontBook, c: ExtraCase, font: MeasureFont): ParityCase['ink'] {
  const f = book.fontFor(c.font, font.weight, font.italic);
  const { polygons } = textPolygons(
    f,
    () => book.embeddedFor(c.font, font.weight),
    c.text,
    0,
    () => 0,
    {
      size: PARITY_SIZE,
      letterSpacing: c.letterSpacing,
      italic: font.italic,
      weight: font.weight,
    },
    book.synthesis(c.font, font.weight, font.italic),
  );
  const pts = polygons.flat();
  return {
    left: Math.min(...pts.map((p) => p.x)),
    right: Math.max(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
  };
}

/** The left edge (px) of each code point of the case, in logical order, from the face's glyph positions. */
function startsOf(face: Face, c: ExtraCase): number[] {
  const at = face.positions(c.text, PARITY_SIZE, {
    letterSpacing: c.letterSpacing,
    ...(c.direction ? { direction: c.direction } : {}),
  });
  return Array.from(c.text, (_, i) => {
    const glyph = at.find((p) => p.cluster === i);
    if (glyph === undefined) throw new Error(`no glyph for ${i} in ${c.text}`);
    return glyph.x;
  });
}

describe('shaping parity fixture (server side)', () => {
  it('the server gives the widths of tests/fixtures/shaping-parity.json', () => {
    const now = measured();
    // `UPDATE_PARITY=1` rewrites the fixture from the server (decision 12: when the browser turns off another feature set).
    if (process.env.UPDATE_PARITY === '1')
      writeFileSync(FIXTURE, `${JSON.stringify(now, null, 2)}\n`);
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    expect(fixture.map(parityKey)).toEqual(now.map(parityKey));
    const wrong = now.filter((c, i) => Math.abs(c.width - fixture[i]!.width) > 1e-6);
    // The measured values, for regenerating the fixture on purpose.
    expect(wrong.map((c) => `${parityKey(c)} = ${c.width}`)).toEqual([]);
    const moved = now.filter((c, i) =>
      (c.starts ?? []).some(
        (x, n) => !(Math.abs(x - (fixture[i]!.starts?.[n] ?? NaN)) <= 1e-6),
      ),
    );
    expect(moved.map((c) => `${parityKey(c)} = ${JSON.stringify(c.starts)}`)).toEqual([]);
  });

  it('the weight cases come after the bidi ones: the 400 width with a wider ink, and the pair at 550 as Mono', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const from =
      PARITY_FONTS.length * PARITY_STRINGS.length * PARITY_SPACINGS.length +
      BIDI_CASES.length;
    const tail = fixture.slice(from, from + WEIGHT_CASES.length);
    expect(tail.map(parityKey)).toEqual(WEIGHT_CASES.map(parityKey));
    const get = (text: string, weight?: number, italic?: boolean) =>
      tail.find(
        (c) =>
          c.font === 'sans' &&
          c.text === text &&
          c.weight === weight &&
          c.italic === italic,
      )!;
    const plain = fixture.find(
      (c) => c.font === 'sans' && c.text === 'Hamburgefonstiv' && c.letterSpacing === 0,
    )!;
    const bold = get('Hamburgefonstiv', 700);
    expect(Math.abs(bold.width - plain.width)).toBeLessThan(0.1);
    expect(
      Math.abs(get('Hamburgefonstiv', undefined, true).width - plain.width),
    ).toBeLessThan(0.1);
    const mono = createMeasurer([
      { family: 'm', weight: '400', style: 'normal', path: 'm.ttf', bytes: monoBuffer() },
    ])('Hamburgefonstiv', {
      family: 'm',
      size: PARITY_SIZE,
      weight: 400,
      italic: false,
      lineHeight: 120,
      letterSpacing: 0,
    }).width;
    const pair = tail.find((c) => c.font === 'pair')!;
    expect(Math.abs(pair.width - mono)).toBeLessThan(0.1);
    expect(INK_TOLERANCE).toBe(1);
  });

  it('the variable cases come last: #2652 at the 400 width, the axes read from the declared style', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const tail = fixture.slice(
      -(VARIABLE_CASES.length + SLANTED_CASES.length),
      -SLANTED_CASES.length,
    );
    expect(tail.map(parityKey)).toEqual(VARIABLE_CASES.map(parityKey));
    const get = (font: string, weight?: number, italic?: boolean) =>
      tail.find((c) => c.font === font && c.weight === weight && c.italic === italic)!;
    const upright = (font: string) => get(font);
    // #2652: declared "400", asked for 700: the 400 width and the fake bold; declared "100 900": the axis, no fake bold.
    expect(Math.abs(get('vwght1', 700).width - upright('vwght1').width)).toBeLessThan(
      0.1,
    );
    expect(get('vwght1', 700).ink!.right).toBeGreaterThan(upright('vwght1').ink!.right);
    expect(get('vwght', 700).width).toBeLessThan(upright('vwght').width - 1);
    expect(upright('vwght').width).toBeCloseTo(upright('vwght1').width, 6);
    // `slnt` follows the declared style: −14 in the italic face (the width changes, no skew), 0 in the face declared
    // only `normal` (the width of the upright text, and the 0.25 skew).
    const italic = get('vslnt', undefined, true);
    expect(italic.width).not.toBeCloseTo(upright('vslnt').width, 1);
    expect(get('vslntn', undefined, true).width).toBeCloseTo(upright('vslntn').width, 6);
    expect(get('vslntn', undefined, true).ink!.right).toBeGreaterThan(
      upright('vslntn').ink!.right + 5,
    );
    // The italic face is not skewed: its ink stays within the advance (no extra lean).
    expect(italic.ink!.right - italic.width).toBeLessThan(
      get('vslntn', undefined, true).ink!.right - upright('vslntn').width,
    );
    // `ital` stays at its default: the italic text has the upright width, with no skew.
    expect(get('vital', undefined, true).width).toBeCloseTo(upright('vital').width, 6);
    expect(get('vital', undefined, true).ink).toEqual(upright('vital').ink);
  });

  it('the slanted cases come last: no skew on a file that already slants, the axis read at 0', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const tail = fixture.slice(-SLANTED_CASES.length);
    expect(tail.map(parityKey)).toEqual(SLANTED_CASES.map(parityKey));
    const get = (font: string, italic?: boolean) =>
      tail.find((c) => c.font === font && c.italic === italic)!;
    for (const font of ['vslntd', 'vitald', 'fsital']) {
      // Declared `normal`, so the italic text uses the same face: the same width and, with no skew, the same ink.
      expect(get(font, true).width).toBeCloseTo(get(font).width, 6);
      expect(get(font, true).ink).toEqual(get(font).ink);
    }
    // `vslntd` upright: `slnt` 0 is the axis maximum, so the 15 letters are 256 units (12.5 px) narrower each than the
    // plain font; the default −10 would be halfway toward the minimum, 15 × 12.5 px wider.
    const plain = fixture.find(
      (c) => c.font === 'sans' && c.text === 'Hamburgefonstiv' && c.letterSpacing === 0,
    )!;
    expect(get('vslntd').width).toBeCloseTo(plain.width - 187.5, 4);
    expect(get('fsital').width).toBeCloseTo(plain.width, 6);
    // No skew: the italic ink is the upright ink, not the 0.25 lean of an upright file (`vslntn` leans over 5 px).
    expect(get('fsital', true).ink!.right - get('fsital').ink!.right).toBe(0);
  });

  it('the bidi cases come after the base cases, which keep their place', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const base = PARITY_FONTS.length * PARITY_STRINGS.length * PARITY_SPACINGS.length;
    expect(fixture.slice(base, base + BIDI_CASES.length).map(parityKey)).toEqual(
      BIDI_CASES.map(parityKey),
    );
    expect(fixture.slice(0, base).every((c) => c.starts === undefined)).toBe(true);
  });

  it('the bidi cases show the reordering: a Hebrew run in place, digits in order, the period on the left', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const get = (text: string, direction?: 'rtl', letterSpacing = 0) =>
      fixture.find(
        (c) =>
          c.font === 'rtl' &&
          c.text === text &&
          c.direction === direction &&
          c.letterSpacing === letterSpacing,
      )!;
    // `abc אבג def`: the letters of the Hebrew run grow from right to left (ג is leftmost)
    const hebrew = get('abc אבג def').starts!;
    expect(hebrew[6]).toBeLessThan(hebrew[5]!);
    expect(hebrew[5]).toBeLessThan(hebrew[4]!);
    // `אבג 123 דה` in rtl: the digits keep their order, and the Hebrew runs are on both sides
    const digits = get('אבג 123 דה', 'rtl').starts!;
    expect(digits[4]).toBeLessThan(digits[5]!);
    expect(digits[5]).toBeLessThan(digits[6]!);
    expect(digits[9]).toBeLessThan(digits[4]!);
    // `Pay invoice.` in rtl: the period is the leftmost
    expect(get('Pay invoice.', 'rtl').starts![11]).toBe(0);
  });

  it('the cases show the contextual chaining and the spacing rules', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const width = (font: string, text: string, spacing: number) =>
      fixture.find(
        (c) => c.font === font && c.text === text && c.letterSpacing === spacing,
      )!.width;
    // `liga` (`ii` → `m`) and `calt` (`fi` → `wi`) are off with spacing, as in Chromium; the plain font has neither.
    expect(width('calt', 'ii', 0)).toBeGreaterThan(width('calt', 'ii', 4) - 8);
    expect(width('calt', 'fit', 0)).not.toBeCloseTo(width('sans', 'fit', 0), 3);
    expect(width('calt', 'fit', 4)).toBeCloseTo(width('sans', 'fit', 4), 6);
    expect(width('sans', 'fit', 4)).toBeCloseTo(width('sans', 'fit', 0) + 12, 6);
  });
});
