import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
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

  it('reads a .woff like the .ttf it came from, and gives null for .woff2', async () => {
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
