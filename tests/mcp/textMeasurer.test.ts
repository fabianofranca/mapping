import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadFace } from '../../mcp/image/harfbuzz';
import { createFontBook, createMeasurer } from '../../mcp/image/textMeasurer';
import type { MeasureFont } from '../../src/model/components/instantiate';
import { makeWoff } from '../support/woffFile';

// CF9 (decision 31): the server measurer measures with HarfBuzz and the embedded free font. Stage #2121 (HB2): the
// expected widths come from the HarfBuzz face of Mapping Sans, not from `opentype.js`.

const sansBytes = new Uint8Array(readFileSync('mcp/fonts/MappingSans-Regular.ttf'));
const sans = loadFace(sansBytes)!;
const arrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const font: MeasureFont = {
  family: 'sans-serif',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

describe('measurer with HarfBuzz', () => {
  const measure = createMeasurer();

  it('"Pay invoice" in sans 14 px measures the glyph width (±0.5 px)', () => {
    const expected = sans.advance('Pay invoice', 14);
    expect(expected).toBeGreaterThan(50);
    expect(Math.abs(measure('Pay invoice', font).width - expected)).toBeLessThan(0.5);
  });

  it('a 60 px box breaks "Pay invoice" into 2 lines', () => {
    const result = measure('Pay invoice', font, 60);
    expect(result.lines).toEqual(['Pay', 'invoice']);
    expect(result.height).toBe(40);
  });

  it('wrap: none + ellipsis ends in … within the width', () => {
    const result = measure(
      'Pay invoice of the credit card',
      { ...font, wrap: 'none', ellipsis: true },
      90,
    );
    expect(result.lines).toHaveLength(1);
    const line = result.lines![0]!;
    expect(line.endsWith('…')).toBe(true);
    expect(result.width).toBeLessThanOrEqual(90 + 1e-6);
  });

  it('weight ≥ 600 uses the bold font (wider); mono measures more than sans for the same characters', () => {
    const regular = measure('Save changes', font).width;
    expect(measure('Save changes', { ...font, weight: 700 }).width).toBeGreaterThan(
      regular,
    );
    const mono = measure('iiiiiiii', { ...font, family: 'monospace' }).width;
    expect(mono).toBeGreaterThan(measure('iiiiiiii', font).width);
  });

  it('the library font takes the place of the embedded one', () => {
    const bold = new Uint8Array(readFileSync('mcp/fonts/MappingMono-Bold.ttf'));
    const custom = createMeasurer([
      {
        family: 'Acme',
        weight: '400',
        style: 'normal',
        path: 'fonts/Acme.ttf',
        bytes: bold.buffer.slice(
          bold.byteOffset,
          bold.byteOffset + bold.byteLength,
        ) as ArrayBuffer,
      },
    ]);
    const withAcme = custom('iiiiiiii', { ...font, family: 'Acme, sans-serif' }).width;
    expect(withAcme).not.toBeCloseTo(measure('iiiiiiii', font).width, 1);
    expect(withAcme).toBeCloseTo(
      measure('iiiiiiii', { ...font, family: 'monospace', weight: 700 }).width,
      3,
    );
  });
});

describe('measurer with HarfBuzz: baseline (MC1, decision 2)', () => {
  const measure = createMeasurer();

  it('the first baseline is the lineInk one: line center + (ascent − descent) / 2', () => {
    const k = 14 / sans.unitsPerEm;
    const ascent = sans.ascender * k;
    const descent = -sans.descender * k;
    const m = measure('Pay', font);
    expect(m.firstBaseline).toBeCloseTo(10 + (ascent - descent) / 2, 6);
    expect(m.lastBaseline).toBeCloseTo(m.firstBaseline ?? 0, 6);
    expect(m.lineCount).toBe(1);
  });

  it('with two lines the last one is one line height below the first', () => {
    const m = measure('Pay invoice', font, 60);
    expect(m.lineCount).toBe(2);
    expect((m.lastBaseline ?? 0) - (m.firstBaseline ?? 0)).toBeCloseTo(20, 6);
  });
});

// Stage #2089 (FM1), stage #2121 (HB2): a library font with GSUB subtables `opentype.js` could not apply measures
// like any other font; HarfBuzz applies every lookup.
describe('measurer with a library font that has chaining and contextual GSUB', () => {
  let dir: string;
  let bytes: ArrayBuffer;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mapping-gsub-'));
    execFileSync('node', ['scripts/testing/gsub-font.mjs', join(dir, 'gsub.ttf')]);
    const file = new Uint8Array(readFileSync(join(dir, 'gsub.ttf')));
    bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const gsub = (): ReturnType<typeof createMeasurer> =>
    createMeasurer([
      { family: 'Gsub', weight: '400', style: 'normal', path: 'fonts/Gsub.ttf', bytes },
    ]);
  const inGsub = { ...font, family: 'Gsub, sans-serif' };

  it('measures `fit` without throwing, as Mapping Sans does', () => {
    const measure = gsub();
    const fit = measure('fit', inGsub).width;
    expect(fit).toBeCloseTo(sans.advance('fit', 14), 6);
  });

  it('`ii` still measures as `m` (the supported ligature applies)', () => {
    const measure = gsub();
    const m = sans.advance('m', 14);
    expect(measure('ii', inGsub).width).toBeCloseTo(m, 6);
    expect(measure('ii', inGsub).width).toBeGreaterThan(sans.advance('ii', 14));
  });
});

// Stage #2121 (HB3, decisions 12 and 14): contextual chaining (`fi` → `wi` under `calt`) and letter spacing, which
// turns `liga`, `clig` and `calt` off as Chromium does (the parity pair showed `calt` goes too).
describe('measurer with the --calt test font', () => {
  let dir: string;
  let bytes: ArrayBuffer;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mapping-calt-'));
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'calt.ttf'),
      '--calt',
    ]);
    const file = new Uint8Array(readFileSync(join(dir, 'calt.ttf')));
    bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const measure = (): ReturnType<typeof createMeasurer> =>
    createMeasurer([
      { family: 'Calt', weight: '400', style: 'normal', path: 'fonts/Calt.ttf', bytes },
    ]);
  const inCalt = { ...font, family: 'Calt, sans-serif' };

  it('`fi` measures as `wi` (the chaining context applies)', () => {
    expect(measure()('fi', inCalt).width).toBeCloseTo(sans.advance('wi', 14), 6);
  });

  it('with letter spacing, `ii` is no longer `m` (liga off) and `fi` is no longer `wi` (calt off, as Chromium)', () => {
    const m = measure();
    const spaced = { ...inCalt, letterSpacing: 4 };
    expect(m('ii', spaced).width).toBeCloseTo(sans.advance('ii', 14) + 8, 6);
    expect(m('ii', spaced).width).not.toBeCloseTo(sans.advance('m', 14) + 8, 3);
    expect(m('fi', spaced).width).toBeCloseTo(sans.advance('fi', 14) + 8, 6);
    expect(m('fi', spaced).width).not.toBeCloseTo(sans.advance('wi', 14) + 8, 3);
  });

  it('the width is the advance plus the spacing for each code point', () => {
    const m = measure();
    expect(m('ii', { ...inCalt, letterSpacing: 0 }).width).toBeCloseTo(
      sans.advance('m', 14),
      6,
    );
    expect(m('abc', { ...inCalt, letterSpacing: 4 }).width).toBeCloseTo(
      sans.advance('abc', 14) + 12,
      6,
    );
  });
});

// Stage #2121 (HB2, decisions 7 and 8): the library's font formats and what makes a font usable.
describe('library font formats', () => {
  const entry = (bytes: Uint8Array, path: string) => ({
    family: 'Acme',
    weight: '400',
    style: 'normal' as const,
    path,
    bytes: arrayBuffer(bytes),
  });
  const inAcme = { ...font, family: 'Acme, sans-serif' };
  const monoBold = new Uint8Array(readFileSync('mcp/fonts/MappingMono-Bold.ttf'));

  it('a .woff library font measures as the .ttf it came from', () => {
    const asTtf = createMeasurer([entry(monoBold, 'fonts/Acme.ttf')]);
    const asWoff = createMeasurer([entry(makeWoff(monoBold), 'fonts/Acme.woff')]);
    for (const text of ['iiiiiiii', 'Pay invoice', 'AV To Ty'])
      expect(asWoff(text, inAcme).width).toBe(asTtf(text, inAcme).width);
    expect(asWoff('iiiiiiii', inAcme).width).not.toBeCloseTo(
      createMeasurer()('iiiiiiii', font).width,
      1,
    );
  });

  it('a .woff2 (signature wOF2) is not read: hasLibraryFonts stays false and the embedded font applies', () => {
    const woff2 = new Uint8Array(sansBytes.subarray(0, 2048));
    woff2.set([0x77, 0x4f, 0x46, 0x32]);
    const book = createFontBook([entry(woff2, 'fonts/Acme.woff2')]);
    expect(book.hasLibraryFonts).toBe(false);
    expect(createMeasurer([entry(woff2, 'fonts/Acme.woff2')])('Pay', inAcme).width).toBe(
      createMeasurer()('Pay', font).width,
    );
  });

  it('a corrupt font leaves hasLibraryFonts false', () => {
    const corrupt = new Uint8Array(4096);
    for (let i = 0; i < corrupt.length; i++) corrupt[i] = (i * 2654435761) % 251;
    expect(createFontBook([entry(corrupt, 'fonts/Acme.ttf')]).hasLibraryFonts).toBe(
      false,
    );
  });

  it('only the usable fonts of the library count', () => {
    const corrupt = new Uint8Array(64);
    const book = createFontBook([
      entry(corrupt, 'fonts/Bad.ttf'),
      entry(monoBold, 'fonts/Acme.ttf'),
    ]);
    expect(book.hasLibraryFonts).toBe(true);
  });
});
