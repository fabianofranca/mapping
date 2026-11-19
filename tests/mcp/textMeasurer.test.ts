import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'opentype.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMeasurer } from '../../mcp/image/textMeasurer';
import type { MeasureFont } from '../../src/model/components/instantiate';

// CF9 (decision 31): the server measurer measures with opentype.js and the embedded free font.

const sans = parse(
  new Uint8Array(readFileSync('mcp/fonts/MappingSans-Regular.ttf')).buffer as ArrayBuffer,
);

const font: MeasureFont = {
  family: 'sans-serif',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

describe('measurer with opentype.js', () => {
  const measure = createMeasurer();

  it('"Pay invoice" in sans 14 px measures the glyph width (±0.5 px)', () => {
    const expected = sans.getAdvanceWidth('Pay invoice', 14, { kerning: true });
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

describe('measurer with opentype.js: baseline (MC1, decision 2)', () => {
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

// Stage #2089 (FM1): a library font with GSUB subtables `opentype.js` cannot apply measures like any
// other font, with the supported substitutions still applied.
describe('measurer with a library font that has unsupported GSUB', () => {
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
    expect(fit).toBeCloseTo(sans.getAdvanceWidth('fit', 14, { kerning: true }), 6);
  });

  it('`ii` still measures as `m` (the supported ligature applies)', () => {
    const measure = gsub();
    const m = sans.getAdvanceWidth('m', 14, { kerning: true });
    expect(measure('ii', inGsub).width).toBeCloseTo(m, 6);
    expect(measure('ii', inGsub).width).toBeGreaterThan(
      sans.getAdvanceWidth('ii', 14, { kerning: true }),
    );
  });
});
