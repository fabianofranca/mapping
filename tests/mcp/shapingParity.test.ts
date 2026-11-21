import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMeasurer } from '../../mcp/image/textMeasurer';
import type { MeasureFont } from '../../src/model/components/instantiate';
import {
  PARITY_FONTS,
  PARITY_SIZE,
  PARITY_SPACINGS,
  PARITY_STRINGS,
  parityFontBytes,
  parityKey,
  type ParityCase,
} from '../support/shapingParity';

// Stage #2121 (HB3, decision 13): the server's widths for Mapping Sans, the `--calt` font and Roboto Regular (`.woff2`, #2126) at size 100, spaced and
// not. `tests/e2e/shapingParity.spec.ts` measures the same cases in Chromium against the same fixture.

const FIXTURE = 'tests/fixtures/shaping-parity.json';

function measured(): ParityCase[] {
  const bytes = parityFontBytes();
  const buffer = (b: Uint8Array) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const measure = createMeasurer(
    PARITY_FONTS.map((name) => ({
      family: name,
      weight: '400',
      style: 'normal' as const,
      path: `fonts/${name}.${name === 'roboto' ? 'woff2' : 'ttf'}`,
      bytes: buffer(bytes[name]),
    })),
  );
  return PARITY_FONTS.flatMap((font) =>
    PARITY_STRINGS.flatMap((text) =>
      PARITY_SPACINGS.map((letterSpacing) => {
        const style: MeasureFont = {
          family: font,
          size: PARITY_SIZE,
          weight: 400,
          italic: false,
          lineHeight: 120,
          letterSpacing,
        };
        return { font, text, letterSpacing, width: measure(text, style).width };
      }),
    ),
  );
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
