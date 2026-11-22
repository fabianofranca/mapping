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
