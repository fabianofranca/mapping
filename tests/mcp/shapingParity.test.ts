import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createFontBook, createMeasurer } from '../../mcp/image/textMeasurer';
import type { Face } from '../../mcp/image/harfbuzz';
import type { MeasureFont } from '../../src/model/components/instantiate';
import {
  BIDI_CASES,
  PARITY_ALL_FONTS,
  PARITY_FONTS,
  PARITY_SIZE,
  PARITY_SPACINGS,
  PARITY_STRINGS,
  parityFontBytes,
  parityKey,
  type ExtraCase,
  type ParityCase,
} from '../support/shapingParity';

// Stage #2121 (HB3, decision 13): the server's widths for Mapping Sans, the `--calt` font and Roboto Regular (`.woff2`, #2126) at size 100, spaced and
// not. `tests/e2e/shapingParity.spec.ts` measures the same cases in Chromium against the same fixture.

const FIXTURE = 'tests/fixtures/shaping-parity.json';

function measured(): ParityCase[] {
  const bytes = parityFontBytes();
  const buffer = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const fonts = PARITY_ALL_FONTS.map((name) => ({
    family: name,
    weight: '400',
    style: 'normal' as const,
    path: `fonts/${name}.${name === 'roboto' ? 'woff2' : 'ttf'}`,
    bytes: buffer(bytes[name]),
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
  return [...base, ...extra];
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

  it('the bidi cases come after the base cases, which keep their place', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ParityCase[];
    const base = PARITY_FONTS.length * PARITY_STRINGS.length * PARITY_SPACINGS.length;
    expect(fixture.slice(base).map(parityKey)).toEqual(BIDI_CASES.map(parityKey));
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
