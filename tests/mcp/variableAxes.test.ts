import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initShaper, loadFace } from '../../mcp/image/harfbuzz';

// Stage #2574 (VA1, decisions 5 and 8): the variable test font of `scripts/testing/variable-font.mjs`. Its axes are read
// by HarfBuzz, and each axis moves the advance of `A`-`Z` and `a`-`z`: +512 units toward the axis minimum and −256 toward
// the maximum (2048 units per em), so a width reads the axis value the server sets.

const dir = mkdtempSync(join(tmpdir(), 'mapping-variable-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sansBytes = readFileSync(
  new URL('../../mcp/fonts/MappingSans-Regular.ttf', import.meta.url),
);

function build(name: string, ...options: string[]): Uint8Array {
  const out = join(dir, `${name}.ttf`);
  execFileSync('node', ['scripts/testing/variable-font.mjs', out, ...options]);
  return new Uint8Array(readFileSync(out));
}

function faceOf(bytes: Uint8Array) {
  const face = loadFace(bytes);
  if (face === null) throw new Error('the variable test font must load');
  return face;
}

describe('scripts/testing/variable-font.mjs', () => {
  beforeAll(async () => {
    await initShaper();
  });

  it('stops with the usage when no axis is asked for', () => {
    expect(() =>
      execFileSync('node', ['scripts/testing/variable-font.mjs', join(dir, 'none.ttf')], {
        stdio: 'pipe',
      }),
    ).toThrow(/usage/);
  });

  it('--wght adds the axis wght 100, 400, 900', () => {
    expect(faceOf(build('wght', '--wght')).axes).toMatchObject({
      wght: { min: 100, default: 400, max: 900 },
    });
  });

  it('--slnt adds the axis with the given values', () => {
    expect(faceOf(build('slnt', '--slnt=-20,-10,0')).axes).toMatchObject({
      slnt: { min: -20, default: -10, max: 0 },
    });
  });

  it('--ital adds the axis 0 to 1 with the given default', () => {
    expect(faceOf(build('ital0', '--ital=0')).axes).toMatchObject({
      ital: { min: 0, default: 0, max: 1 },
    });
    expect(faceOf(build('ital1', '--ital=1')).axes.ital).toMatchObject({
      min: 0,
      default: 1,
      max: 1,
    });
  });

  it('the axes can be combined', () => {
    expect(
      Object.keys(faceOf(build('all', '--wght', '--slnt=-20,0,20', '--ital=0')).axes),
    ).toEqual(['wght', 'slnt', 'ital']);
  });

  it('a font without axes is not changed by the script (no option, no font)', () => {
    expect(faceOf(sansBytes).axes).toEqual({});
  });

  it('the advances at the axis ends change by +512 and −256 units', () => {
    const face = faceOf(build('ends', '--wght'));
    const base = faceOf(sansBytes);
    const size = face.unitsPerEm; // 1 px = 1 unit
    const units = (text: string, weight: number) => face.advance(text, size, weight);
    for (const text of ['H', 'A', 'z']) {
      const plain = base.advance(text, size);
      expect(units(text, 400)).toBeCloseTo(plain, 3);
      expect(units(text, 100)).toBeCloseTo(plain + 512, 3);
      expect(units(text, 900)).toBeCloseTo(plain - 256, 3);
    }
    // Halfway toward an end the variation is linear.
    expect(units('H', 250)).toBeCloseTo(base.advance('H', size) + 256, 3);
  });

  it('glyphs outside A-Z and a-z, and the outlines, do not move', () => {
    const face = faceOf(build('still', '--wght'));
    const base = faceOf(sansBytes);
    const size = face.unitsPerEm;
    expect(face.advance(' 7', size, 100)).toBeCloseTo(base.advance(' 7', size), 3);
    expect(face.path('H', 0, 0, 100, undefined)).toEqual(base.path('H', 0, 0, 100));
  });
});

// Stage #2574 (VA2, decisions 3, 5 and 8): `Face.slanted` says whether the file itself slants.
describe('Face.slanted', () => {
  beforeAll(async () => {
    await initShaper();
  });

  /** A copy of the bytes with `OS/2.fsSelection` set to `value` (the checksums are not needed to load it). */
  function withFsSelection(bytes: Uint8Array, value: number): Uint8Array {
    const copy = new Uint8Array(bytes);
    const view = new DataView(copy.buffer);
    for (let n = 0; n < view.getUint16(4); n++) {
      const at = 12 + n * 16;
      const tag = String.fromCharCode(...copy.subarray(at, at + 4));
      if (tag === 'OS/2') view.setUint16(view.getUint32(at + 8) + 62, value);
    }
    return copy;
  }

  const fsSelectionOf = (bytes: Uint8Array): number => {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    for (let n = 0; n < view.getUint16(4); n++) {
      const at = 12 + n * 16;
      if (String.fromCharCode(...bytes.subarray(at, at + 4)) === 'OS/2')
        return view.getUint16(view.getUint32(at + 8) + 62);
    }
    throw new Error('no OS/2 table');
  };

  it('is false for the four embedded fonts', () => {
    for (const name of ['Mono-Regular', 'Mono-Bold', 'Sans-Regular', 'Sans-Bold']) {
      const path = new URL(`../../mcp/fonts/Mapping${name}.ttf`, import.meta.url);
      expect(faceOf(new Uint8Array(readFileSync(path))).slanted).toBe(false);
    }
  });

  it('--fs-italic sets bit 0 and clears bit 6 of fsSelection, with or without axes', () => {
    const plain = fsSelectionOf(new Uint8Array(sansBytes));
    for (const options of [['--fs-italic'], ['--fs-italic', '--wght']]) {
      const selection = fsSelectionOf(build('fsital', ...options));
      expect(selection & 1).toBe(1);
      expect(selection & 0x40).toBe(0);
      expect(selection & ~0x41).toBe(plain & ~0x41);
    }
  });

  it('is true for --fs-italic (bit 0)', () => {
    expect(faceOf(build('fsital', '--fs-italic')).slanted).toBe(true);
  });

  it('is true for a font with bit 9 (oblique) set', () => {
    const oblique = withFsSelection(new Uint8Array(sansBytes), 1 << 9);
    expect(faceOf(oblique).slanted).toBe(true);
  });

  it('is true for a slnt default that is not 0, and false for a default of 0', () => {
    expect(faceOf(build('slntd', '--slnt=-20,-10,0')).slanted).toBe(true);
    expect(faceOf(build('slnt0', '--slnt=-20,0,20')).slanted).toBe(false);
  });

  it('is true for an ital default of 1, and false for a default of 0', () => {
    expect(faceOf(build('ital1', '--ital=1')).slanted).toBe(true);
    expect(faceOf(build('ital0', '--ital=0')).slanted).toBe(false);
  });

  it('the declaration does not change it', () => {
    const bytes = build('declared', '--slnt=-20,-10,0');
    const face = loadFace(bytes, { low: 400, high: 400, italic: false });
    expect(face?.slanted).toBe(true);
  });
});
