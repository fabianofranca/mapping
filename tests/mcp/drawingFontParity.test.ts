import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { builtinFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import {
  DRAWING_PARITY_CASES,
  DRAWING_PARITY_FAMILIES,
  type ParityCase,
} from '../support/drawingFontParity';

// Stage #2825, decision 7: the server's width of single words in the default component font, written to
// `tests/fixtures/drawing-font-parity.json`. The Chromium test `tests/e2e/drawingFont.spec.ts` measures the same
// cases with the app's `konvaMeasurer` and the embedded Mapping faces, and requires them within 0.5 px, so a
// `texto` the MCP fits is not cut in the app. `UPDATE_DRAWING_FONT_PARITY=1 npx vitest run <this file>` rewrites it.

const FIXTURE = new URL('../fixtures/drawing-font-parity.json', import.meta.url);

interface Fixture {
  readonly families: typeof DRAWING_PARITY_FAMILIES;
  readonly cases: readonly (ParityCase & { readonly width: number })[];
}

function serverWidths(): Fixture {
  const measure = measurerFor(builtinFontBook());
  return {
    families: DRAWING_PARITY_FAMILIES,
    cases: DRAWING_PARITY_CASES.map((c) => ({
      ...c,
      width: measure(c.text, {
        family: DRAWING_PARITY_FAMILIES[c.family],
        size: c.size,
        weight: c.weight,
        italic: false,
        lineHeight: Math.round(c.size * 1.25),
        letterSpacing: 0,
        wrap: 'none',
      }).width,
    })),
  };
}

describe('drawing font parity (server)', () => {
  it('the fixture matches the server widths of the Mapping faces', () => {
    const now = serverWidths();
    if (process.env.UPDATE_DRAWING_FONT_PARITY === '1' || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(now, null, 2)}\n`);
    }
    const stored = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    expect(stored.families).toEqual(now.families);
    expect(stored.cases.length).toBe(now.cases.length);
    stored.cases.forEach((c, i) => {
      const fresh = now.cases[i]!;
      expect(`${c.family} ${c.size} ${c.weight} ${c.text}`).toBe(
        `${fresh.family} ${fresh.size} ${fresh.weight} ${fresh.text}`,
      );
      expect(Math.abs(c.width - fresh.width)).toBeLessThanOrEqual(0.01);
    });
  });

  it('covers sans and mono, sizes 12, 14 and 20, weights 400 and 700', () => {
    const keys = new Set(
      DRAWING_PARITY_CASES.map((c) => `${c.family}|${c.size}|${c.weight}`),
    );
    for (const family of ['sans', 'mono'])
      for (const size of [12, 14, 20])
        for (const weight of [400, 700])
          expect(keys.has(`${family}|${size}|${weight}`)).toBe(true);
  });

  it('the default stacks resolve to the embedded Mapping faces (sans-bold from 600)', () => {
    const book = builtinFontBook();
    const families = DRAWING_PARITY_FAMILIES;
    expect(book.isLibraryFamily(families.sans)).toBe(false);
    const regular = book.embeddedFor(families.sans, 400);
    expect(book.embeddedFor(families.sans, 599)).toBe(regular);
    expect(book.embeddedFor(families.sans, 600)).not.toBe(regular);
    expect(book.embeddedFor(families.mono, 400)).not.toBe(regular);
  });

  it('a lone "Mapping Mono" (no generic after it) is still the mono face', () => {
    const book = builtinFontBook();
    expect(book.embeddedFor('Mapping Mono', 400)).toBe(
      book.embeddedFor(DRAWING_PARITY_FAMILIES.mono, 400),
    );
    expect(book.fontFor('"Mapping Mono"', 700, false)).toBe(
      book.fontFor(DRAWING_PARITY_FAMILIES.mono, 700, false),
    );
  });
});
