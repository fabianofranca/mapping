import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initShaper, loadFace, variationsFor } from '../../mcp/image/harfbuzz';
import { makeWoff } from '../support/woffFile';

const sansBytes = readFileSync(
  new URL('../../mcp/fonts/MappingSans-Regular.ttf', import.meta.url),
);

function sansFace() {
  const face = loadFace(sansBytes);
  if (face === null) throw new Error('Mapping Sans must load');
  return face;
}

describe('HarfBuzz face (mcp/image/harfbuzz.ts)', () => {
  it('reads the metrics of the hhea table', async () => {
    await initShaper();
    const face = sansFace();
    expect(face.unitsPerEm).toBe(2048);
    expect(face.ascender).toBe(1854);
    expect(face.descender).toBe(-434);
  });

  it('initShaper is idempotent', async () => {
    await initShaper();
    await expect(initShaper()).resolves.toBeUndefined();
    expect(sansFace().unitsPerEm).toBe(2048);
  });

  it('measures with kerning (widths pinned from the former opentype.js measurer)', async () => {
    await initShaper();
    const face = sansFace();
    // Strings with no pair that `opentype.js` missed: it did not apply this font's `AV`, `To` or `Ty` kerning (HarfBuzz does).
    const expected: Record<string, number> = {
      'Pay invoice': 71.5927734375,
      Hamburgefonstiv: 105.8271484375,
      'st ti iv on': 55.2412109375,
    };
    for (const [text, width] of Object.entries(expected))
      expect(Math.abs(face.advance(text, 14) - width)).toBeLessThan(1e-6);
    expect(face.advance('', 14)).toBe(0);
  });

  it('draws closed outlines in screen coordinates, with the H on the cap height', async () => {
    await initShaper();
    const face = sansFace();
    const commands = face.path('H', 0, 0, 100);
    expect(commands.filter((c) => c.type === 'M').length).toBeGreaterThanOrEqual(1);
    expect(commands.filter((c) => c.type === 'Z').length).toBeGreaterThanOrEqual(1);
    const top = Math.min(...commands.flatMap((c) => (c.y === undefined ? [] : [c.y])));
    expect(-top).toBeCloseTo(face.capHeight(100), 6);
    expect(face.capHeight(100)).toBeGreaterThan(60);
    expect(face.capHeight(100)).toBeLessThan(80);
  });

  it('places the path at x and on the baseline', async () => {
    await initShaper();
    const face = sansFace();
    const at = face.path('H', 30, 50, 100);
    const origin = face.path('H', 0, 0, 100);
    expect(at).toHaveLength(origin.length);
    at.forEach((command, i) => {
      const base = origin[i]!;
      expect(command.type).toBe(base.type);
      if (base.x !== undefined) expect(command.x).toBeCloseTo(base.x + 30, 6);
      if (base.y !== undefined) expect(command.y).toBeCloseTo(base.y + 50, 6);
    });
  });

  it('with letter spacing, draws each character on its own and spaced', async () => {
    await initShaper();
    const face = sansFace();
    const spaced = face.path('HH', 0, 0, 100, { letterSpacing: 10 });
    const second = face.path('H', face.advance('H', 100) + 10, 0, 100);
    const alone = face.path('H', 0, 0, 100);
    expect(spaced).toHaveLength(alone.length * 2);
    spaced.slice(alone.length).forEach((command, i) => {
      expect(command.type).toBe(second[i]!.type);
      if (command.x !== undefined) expect(command.x).toBeCloseTo(second[i]!.x ?? 0, 6);
    });
  });

  it('reads a .woff like the .ttf it came from, and gives null for a corrupt .woff2', async () => {
    await initShaper();
    const woff = loadFace(makeWoff(new Uint8Array(sansBytes)));
    expect(woff).not.toBeNull();
    expect(woff!.advance('Pay invoice', 14)).toBe(sansFace().advance('Pay invoice', 14));
    expect(woff!.path('H', 0, 0, 100)).toEqual(sansFace().path('H', 0, 0, 100));
    const woff2 = new Uint8Array(sansBytes.subarray(0, 2048));
    woff2.set([0x77, 0x4f, 0x46, 0x32]);
    expect(loadFace(woff2)).toBeNull();
  });

  it('gives null for a font without an hhea table', async () => {
    await initShaper();
    const broken = new Uint8Array(sansBytes);
    const view = new DataView(broken.buffer);
    for (let i = 0; i < view.getUint16(4); i++) {
      const at = 12 + i * 16;
      if (String.fromCharCode(...broken.subarray(at, at + 4)) === 'hhea')
        broken[at + 3] = 0x62;
    }
    expect(loadFace(broken)).toBeNull();
  });

  it('gives null for bytes that are not a usable font', async () => {
    await initShaper();
    const random = new Uint8Array(4096);
    for (let i = 0; i < random.length; i++) random[i] = (i * 2654435761) % 251;
    expect(loadFace(random)).toBeNull();
    expect(loadFace(new Uint8Array(0))).toBeNull();
  });

  it('the face API throws before initShaper()', async () => {
    vi.resetModules();
    const fresh = await import('../../mcp/image/harfbuzz');
    expect(() => fresh.loadFace(sansBytes)).toThrow('HarfBuzz is not initialized');
    await fresh.initShaper();
    expect(fresh.loadFace(sansBytes)).not.toBeNull();
  });
});

// Stage #2121 (HB3, decision 11): the variable axes a text asks for.
describe('variationsFor', () => {
  const axis = (min: number, def: number, max: number) => ({ min, default: def, max });

  it('wght follows the weight, clamped to the axis range', () => {
    const axes = { wght: axis(100, 400, 900) };
    expect(variationsFor(axes, 600, 14)).toEqual([{ tag: 'wght', value: 600 }]);
    expect(variationsFor(axes, 950, 14)).toEqual([{ tag: 'wght', value: 900 }]);
    expect(variationsFor(axes, 50, 14)).toEqual([{ tag: 'wght', value: 100 }]);
  });

  it('opsz follows the size, clamped to the axis range', () => {
    const axes = { opsz: axis(14, 14, 32) };
    expect(variationsFor(axes, 400, 12)).toEqual([{ tag: 'opsz', value: 14 }]);
    expect(variationsFor(axes, 400, 20)).toEqual([{ tag: 'opsz', value: 20 }]);
    expect(variationsFor(axes, 400, 40)).toEqual([{ tag: 'opsz', value: 32 }]);
  });

  it('a font without axes gets no variations', () => {
    expect(variationsFor({}, 700, 20)).toEqual([]);
  });

  it('an unknown axis is left out, so it stays at its default', () => {
    expect(variationsFor({ wdth: axis(75, 100, 125) }, 700, 20)).toEqual([]);
  });

  it('a static face has no axes', async () => {
    await initShaper();
    expect(variationsFor(sansFace().axes, 700, 20)).toEqual([]);
  });
});

// Stage #2448 (BD1, decisions 3 and 4): each directional run is shaped on its own and the runs come in visual order.
// The font is Mapping Sans with U+05D0 to U+05D9 mapped to the glyphs of `A` to `J` (`gsub-font.mjs --rtl`).
describe('shaping by directional run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mapping-rtl-'));
  let rtl: NonNullable<ReturnType<typeof loadFace>>;

  beforeAll(async () => {
    execFileSync('node', [
      'scripts/testing/gsub-font.mjs',
      join(dir, 'rtl.ttf'),
      '--rtl',
    ]);
    await initShaper();
    const face = loadFace(new Uint8Array(readFileSync(join(dir, 'rtl.ttf'))));
    if (face === null) throw new Error('the --rtl test font must load');
    rtl = face;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const clusters = (text: string, style?: Parameters<typeof rtl.positions>[2]) =>
    rtl.positions(text, 100, style).map((p) => p.cluster);

  it('positions gives the left edge and the cluster of each glyph, from the left', () => {
    const at = rtl.positions('AB', 100);
    expect(at.map((p) => p.cluster)).toEqual([0, 1]);
    expect(at[0]!.x).toBe(0);
    expect(at[1]!.x).toBeCloseTo(rtl.advance('A', 100), 6);
  });

  it('positions follows the letter spacing the path uses', () => {
    const at = rtl.positions('ABC', 100, { letterSpacing: 4 });
    expect(at[2]!.x).toBeCloseTo(rtl.advance('AB', 100, 400, true) + 8, 6);
  });

  it('a Hebrew run in a Latin line is reversed in place', () => {
    expect(clusters('abc אבג def')).toEqual([0, 1, 2, 3, 6, 5, 4, 7, 8, 9, 10]);
    // the glyphs are those of C B A, drawn from the left
    expect(rtl.path('אבג', 0, 0, 100)).toEqual(rtl.path('CBA', 0, 0, 100));
  });

  it('a mixed line measures the sum of its runs', () => {
    const runs = ['abc ', 'אבג', ' def'].reduce(
      (sum, run) => sum + rtl.advance(run, 100),
      0,
    );
    expect(rtl.advance('abc אבג def', 100)).toBeCloseTo(runs, 6);
    const at = rtl.positions('abc אבג def', 100);
    expect(at[4]!.x).toBeCloseTo(rtl.advance('abc ', 100), 6);
    expect(at[7]!.x).toBeCloseTo(rtl.advance('abc אבג', 100), 6);
  });

  it('with the rtl direction, a number keeps its order and the runs come from the right', () => {
    expect(clusters('אבג 123 דה', { direction: 'rtl' })).toEqual([
      9, 8, 7, 4, 5, 6, 3, 2, 1, 0,
    ]);
  });

  it('with the rtl direction, the period of a Latin sentence goes to the left', () => {
    const at = rtl.positions('Pay invoice.', 100, { direction: 'rtl' });
    expect(at[0]).toEqual({ cluster: 11, x: 0 });
    expect(at[1]!.cluster).toBe(0);
    expect(at[1]!.x).toBeCloseTo(rtl.advance('.', 100), 6);
  });

  it('advance takes the direction, and a plain Latin line is the same in both', () => {
    expect(rtl.advance('Hamburgefonstiv', 100, 400, false, 'rtl')).toBeCloseTo(
      rtl.advance('Hamburgefonstiv', 100),
      6,
    );
    const mixed = rtl.advance('Pay invoice.', 100, 400, false, 'rtl');
    expect(mixed).toBeCloseTo(rtl.advance('.', 100) + rtl.advance('Pay invoice', 100), 6);
  });

  it('a bracket in a right-to-left run is mirrored', () => {
    expect(rtl.path('(', 0, 0, 100, { direction: 'rtl' })).toEqual(
      rtl.path(')', 0, 0, 100),
    );
    expect(rtl.path('(', 0, 0, 100)).not.toEqual(rtl.path(')', 0, 0, 100));
  });

  it('the cache does not mix the directions', () => {
    const ltr = rtl.advance('Pay invoice.', 100);
    expect(rtl.advance('Pay invoice.', 100, 400, false, 'rtl')).toBeCloseTo(ltr, 6);
    expect(clusters('Pay invoice.')).toEqual([...Array(12).keys()]);
    expect(clusters('Pay invoice.', { direction: 'rtl' })[0]).toBe(11);
  });
});

// Stage #2574 (VA1, decision 2): `wght` within the range the entry declares, `slnt` from the declared style, and no
// `ital`. `declared` is absent for the faces loaded without a declaration (embedded fonts, `validate_library`).
describe('variationsFor with a declaration', () => {
  const axis = (min: number, def: number, max: number) => ({ min, default: def, max });
  const upright = { low: 400, high: 400, italic: false };

  it('wght is clamped to the declared range first, then to the axis', () => {
    const axes = { wght: axis(100, 400, 900) };
    expect(variationsFor(axes, 700, 14, upright)).toEqual([{ tag: 'wght', value: 400 }]);
    expect(variationsFor(axes, 200, 14, upright)).toEqual([{ tag: 'wght', value: 400 }]);
    const range = { low: 100, high: 900, italic: false };
    expect(variationsFor(axes, 700, 14, range)).toEqual([{ tag: 'wght', value: 700 }]);
    const wide = { low: 50, high: 1000, italic: false };
    expect(variationsFor(axes, 950, 14, wide)).toEqual([{ tag: 'wght', value: 900 }]);
    expect(variationsFor(axes, 20, 14, wide)).toEqual([{ tag: 'wght', value: 100 }]);
  });

  it('slnt is −14 for an italic face and 0 for a normal one, clamped to the axis', () => {
    const axes = { slnt: axis(-20, 0, 20) };
    expect(variationsFor(axes, 400, 14, { ...upright, italic: true })).toEqual([
      { tag: 'slnt', value: -14 },
    ]);
    expect(variationsFor(axes, 400, 14, upright)).toEqual([{ tag: 'slnt', value: 0 }]);
    expect(
      variationsFor({ slnt: axis(-10, 0, 0) }, 400, 14, { ...upright, italic: true }),
    ).toEqual([{ tag: 'slnt', value: -10 }]);
    expect(variationsFor({ slnt: axis(-20, 0, -5) }, 400, 14, upright)).toEqual([
      { tag: 'slnt', value: -5 },
    ]);
  });

  it('slnt is set even when the axis default is not 0', () => {
    const axes = { slnt: axis(-20, -10, 0) };
    expect(variationsFor(axes, 400, 14, upright)).toEqual([{ tag: 'slnt', value: 0 }]);
    expect(variationsFor(axes, 400, 14, { ...upright, italic: true })).toEqual([
      { tag: 'slnt', value: -14 },
    ]);
  });

  it('ital and the other axes are left out, so they stay at their defaults', () => {
    const axes = { ital: axis(0, 0, 1), wdth: axis(75, 100, 125), GRAD: axis(0, 0, 1) };
    expect(variationsFor(axes, 700, 14, { ...upright, italic: true })).toEqual([]);
  });

  it('opsz still follows the size', () => {
    expect(variationsFor({ opsz: axis(14, 14, 32) }, 400, 20, upright)).toEqual([
      { tag: 'opsz', value: 20 },
    ]);
  });

  it('without a declaration slnt is left out and wght is clamped to the axis only', () => {
    const axes = { wght: axis(100, 400, 900), slnt: axis(-20, 0, 20) };
    expect(variationsFor(axes, 700, 14)).toEqual([{ tag: 'wght', value: 700 }]);
  });
});
