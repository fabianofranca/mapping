import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { woffToSfnt } from '../../mcp/image/woff';
import { makeWoff, sfntTables } from '../support/woffFile';

const ttf = new Uint8Array(
  readFileSync(new URL('../../mcp/fonts/MappingSans-Regular.ttf', import.meta.url)),
);

describe('woffToSfnt (mcp/image/woff.ts)', () => {
  it('inflates a WOFF 1.0 into an sfnt with the same tables', () => {
    const sfnt = woffToSfnt(makeWoff(ttf, { stored: 'cvt ' }));
    expect(sfnt).not.toBeNull();
    const original = sfntTables(ttf);
    const rebuilt = sfntTables(sfnt!);
    expect(rebuilt.flavor).toBe(original.flavor);
    expect(rebuilt.tables.map((t) => t.tag)).toEqual(original.tables.map((t) => t.tag));
    rebuilt.tables.forEach((table, i) => {
      expect(table.data).toEqual(original.tables[i]!.data);
      expect(table.checksum).toBe(original.tables[i]!.checksum);
    });
  });

  it('aligns every table offset to 4 bytes', () => {
    const sfnt = woffToSfnt(makeWoff(ttf))!;
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    for (let i = 0; i < view.getUint16(4); i++) {
      expect(view.getUint32(12 + i * 16 + 8) % 4).toBe(0);
    }
  });

  it('keeps a table that was stored uncompressed as is', () => {
    const woff = makeWoff(ttf, { stored: 'head' });
    const view = new DataView(woff.buffer);
    const { tables } = sfntTables(ttf);
    const index = tables.findIndex((t) => t.tag === 'head');
    expect(view.getUint32(44 + index * 20 + 8)).toBe(
      view.getUint32(44 + index * 20 + 12),
    );
    const rebuilt = sfntTables(woffToSfnt(woff)!);
    expect(rebuilt.tables[index]!.data).toEqual(tables[index]!.data);
  });

  it('gives null for a table whose inflated size is not its origLength', () => {
    expect(woffToSfnt(makeWoff(ttf, { wrongOrigLength: 'cmap' }))).toBeNull();
  });

  it('gives null for an unknown flavor, tags out of order and a table over the directory', () => {
    const flavor = makeWoff(ttf);
    new DataView(flavor.buffer).setUint32(4, 0x12345678);
    expect(woffToSfnt(flavor)).toBeNull();

    const unsorted = makeWoff(ttf);
    const first = unsorted.slice(44, 48);
    unsorted.copyWithin(44, 64, 68);
    unsorted.set(first, 64);
    expect(woffToSfnt(unsorted)).toBeNull();

    const overlapping = makeWoff(ttf);
    new DataView(overlapping.buffer).setUint32(44 + 4, 44);
    expect(woffToSfnt(overlapping)).toBeNull();
  });

  it('gives null for WOFF2, a plain sfnt and other bytes', () => {
    const woff2 = new Uint8Array(64);
    woff2.set([0x77, 0x4f, 0x46, 0x32]); // wOF2
    expect(woffToSfnt(woff2)).toBeNull();
    expect(woffToSfnt(ttf)).toBeNull();
    expect(woffToSfnt(new Uint8Array(0))).toBeNull();
    expect(woffToSfnt(new Uint8Array([0x77, 0x4f, 0x46, 0x46]))).toBeNull();
  });

  it('gives null for a truncated file', () => {
    const woff = makeWoff(ttf);
    expect(woffToSfnt(woff.subarray(0, woff.length - 200))).toBeNull();
  });
});
