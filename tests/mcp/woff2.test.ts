import { readFileSync } from 'node:fs';
import { brotliCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadFace, type Face } from '../../mcp/image/harfbuzz';
import { woffToSfnt } from '../../mcp/image/woff';
import { decodeWoff2, MAX_SFNT_BYTES } from '../../mcp/image/woff2';
import { sfntTables } from '../support/woffFile';
import {
  base128,
  entriesFromSfnt,
  packWoff2,
  TINY_COMPOSITE_GLYPH,
  TINY_SIMPLE_GLYPH,
  tinyWoff2,
  transformedHmtxOf,
  woff2FromSfnt,
} from '../support/woff2File';

const read = (path: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(path, import.meta.url)));

const sans = read('../../mcp/fonts/MappingSans-Regular.ttf');
const tableOf = (sfnt: Uint8Array, tag: string): Uint8Array =>
  sfntTables(sfnt).tables.find((t) => t.tag === tag)!.data;
const decoded = (bytes: Uint8Array): Uint8Array => {
  const sfnt = decodeWoff2(bytes);
  if (sfnt === null) throw new Error('the WOFF2 must decode');
  return sfnt;
};
const face = (sfnt: Uint8Array): Face => {
  const result = loadFace(sfnt);
  if (result === null) throw new Error('the sfnt must load');
  return result;
};

/** The sum of the 32-bit words of the bytes (zero padded), the sfnt checksum. */
function checksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const word = [0, 1, 2, 3].reduce((acc, k) => acc * 256 + (data[i + k] ?? 0), 0);
    sum = (sum + word) % 2 ** 32;
  }
  return sum;
}

describe('decodeWoff2 — synthetic (mcp/image/woff2.ts)', () => {
  it('turns the null transform of Mapping Sans into the same tables, which HarfBuzz loads', () => {
    const sfnt = decoded(woff2FromSfnt(sans));
    const original = sfntTables(sans);
    const rebuilt = sfntTables(sfnt);
    expect(rebuilt.flavor).toBe(original.flavor);
    expect(rebuilt.tables.map((t) => t.tag)).toEqual(original.tables.map((t) => t.tag));
    rebuilt.tables.forEach((table, i) => {
      const source = original.tables[i]!;
      // `head` differs only in `checkSumAdjustment`, which the decoder recomputes.
      if (table.tag === 'head') {
        expect(table.data.subarray(12)).toEqual(source.data.subarray(12));
        expect(table.data.subarray(0, 8)).toEqual(source.data.subarray(0, 8));
      } else expect(Buffer.compare(table.data, source.data)).toBe(0);
    });
    const hb = face(sfnt);
    expect(hb.unitsPerEm).toBe(2048);
    expect(hb.advance('Pay invoice', 14)).toBeCloseTo(
      face(sans).advance('Pay invoice', 14),
      9,
    );
  });

  it('rebuilds a transformed hmtx (lsb dropped where it equals xMin) into the original', () => {
    const woff2 = woff2FromSfnt(sans, { transformHmtx: true });
    const sfnt = decoded(woff2);
    expect(Buffer.compare(tableOf(sfnt, 'hmtx'), tableOf(sans, 'hmtx'))).toBe(0);
    expect(Buffer.compare(tableOf(sfnt, 'glyf'), tableOf(sans, 'glyf'))).toBe(0);
    expect(face(sfnt).advance('Hamburgefonstiv', 14)).toBeCloseTo(
      face(sans).advance('Hamburgefonstiv', 14),
      9,
    );
  });

  it('really drops the lsb in the transformed hmtx the test builds (the transform is exercised)', () => {
    const transformed = transformedHmtxOf(sans);
    expect(transformed[0]! & 1).toBe(1);
    expect(transformed.length).toBeLessThan(tableOf(sans, 'hmtx').length);
  });

  it('keeps the table records sorted, each table at a multiple of 4, with correct checksums', () => {
    const sfnt = decoded(woff2FromSfnt(sans, { transformHmtx: true }));
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    const count = view.getUint16(4);
    const entrySelector = Math.floor(Math.log2(count));
    expect(view.getUint16(6)).toBe(2 ** entrySelector * 16);
    expect(view.getUint16(8)).toBe(entrySelector);
    expect(view.getUint16(10)).toBe(count * 16 - 2 ** entrySelector * 16);
    const tags: string[] = [];
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16;
      tags.push(String.fromCharCode(...sfnt.subarray(at, at + 4)));
      expect(view.getUint32(at + 8) % 4).toBe(0);
    }
    expect(tags).toEqual([...tags].sort());
  });
});

describe('decodeWoff2 — checksums of a large table', () => {
  it('stays exact past 2^53 (a 12 MB table of 0xFF words: n words sum to 2^32 - n mod 2^32)', () => {
    const words = 3 * 1024 * 1024;
    const data = new Uint8Array(words * 4).fill(0xff);
    const sfnt = decoded(packWoff2(0x00010000, [{ tag: 'cvt ', data }]));
    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    expect(view.getUint32(12 + 4)).toBe(2 ** 32 - words);
  });
});

describe('decodeWoff2 — a transformed glyf (tiny font)', () => {
  it('rebuilds the simple glyph as one flag byte per point, short and long deltas, padded to 4', () => {
    const sfnt = decoded(tinyWoff2());
    const glyf = tableOf(sfnt, 'glyf');
    expect([...glyf.subarray(0, 24)]).toEqual([...TINY_SIMPLE_GLYPH]);
    expect([...glyf.subarray(24, 40)]).toEqual([...TINY_COMPOSITE_GLYPH]);
    expect(glyf.length).toBe(40);
  });

  it('rebuilds loca in the head format (short: offset / 2), the empty glyph with a zero length', () => {
    const loca = tableOf(decoded(tinyWoff2()), 'loca');
    expect([...loca]).toEqual([0, 0, 0, 12, 0, 20, 0, 20]);
  });

  it('sets OVERLAP_SIMPLE on the first flag of the glyph when the bitmap says so', () => {
    const glyf = tableOf(decoded(tinyWoff2({ overlap: true })), 'glyf');
    expect([...glyf.subarray(15, 18)]).toEqual([0x71, 0x21, 0x15]);
  });

  it('takes an explicit bbox from the bbox stream instead of computing it', () => {
    const bboxValues = [0, 0, 0, 0, 0, 100, 0, 100];
    const glyf = tableOf(
      decoded(
        tinyWoff2({
          bboxBitmap: [0xc0, 0, 0, 0],
          bboxValues: [...bboxValues, ...bboxValues],
        }),
      ),
      'glyf',
    );
    expect([...glyf.subarray(2, 10)]).toEqual(bboxValues);
  });
});

describe('decodeWoff2 — real Roboto against the .woff of the same release', () => {
  const weights = [
    ['Regular', 'roboto-latin-400-normal'],
    ['Medium', 'roboto-latin-500-normal'],
  ] as const;

  /** The code points of the best Unicode `cmap` subtable (format 4 or 12). */
  function codePoints(sfnt: Uint8Array): number[] {
    const cmap = tableOf(sfnt, 'cmap');
    const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
    const found = new Set<number>();
    for (let i = 0; i < view.getUint16(2); i++) {
      const offset = view.getUint32(4 + i * 8 + 4);
      const format = view.getUint16(offset);
      if (format === 4) {
        const segments = view.getUint16(offset + 6) / 2;
        const ends = offset + 14;
        const starts = ends + segments * 2 + 2;
        for (let s = 0; s < segments; s++) {
          const end = view.getUint16(ends + s * 2);
          for (let c = view.getUint16(starts + s * 2); c <= end && end !== 0xffff; c++)
            found.add(c);
        }
      } else if (format === 12) {
        for (let g = 0; g < view.getUint32(offset + 12); g++) {
          const at = offset + 16 + g * 12;
          for (let c = view.getUint32(at); c <= view.getUint32(at + 4); c++) found.add(c);
        }
      }
    }
    return [...found].sort((a, b) => a - b);
  }

  /** Min and max of every point of the path, in font units (size = unitsPerEm). */
  function extents(f: Face, text: string): number[] | null {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of f.path(text, 0, 0, f.unitsPerEm)) {
      for (const [x, y] of [
        [c.x, c.y],
        [c.x1, c.y1],
        [c.x2, c.y2],
      ])
        if (x !== undefined && y !== undefined) {
          xs.push(x);
          ys.push(y);
        }
    }
    return xs.length === 0
      ? null
      : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  describe.each(weights)('%s', (name, file) => {
    const woff2 = decoded(
      read(`../../libraries/material3-compose/fonts/Roboto-${name}.woff2`),
    );
    const woff = woffToSfnt(read(`../fixtures/fonts/${file}.woff`))!;

    it('has the GDEF, GPOS, GSUB, cmap, gasp, hmtx and post tables byte-equal to the .woff', () => {
      for (const tag of ['GDEF', 'GPOS', 'GSUB', 'cmap', 'gasp', 'hmtx', 'post'])
        expect(Buffer.compare(tableOf(woff2, tag), tableOf(woff, tag)), tag).toBe(0);
    });

    it('has the same numGlyphs', () => {
      const numGlyphs = (sfnt: Uint8Array) =>
        new DataView(tableOf(sfnt, 'maxp').buffer).getUint16(
          tableOf(sfnt, 'maxp').byteOffset + 4,
        );
      expect(numGlyphs(woff2)).toBe(numGlyphs(woff));
      expect(numGlyphs(woff2)).toBeGreaterThan(100);
    });

    it('gives HarfBuzz the same advance and glyph extents for every code point of the cmap', () => {
      const fromWoff2 = face(woff2);
      const fromWoff = face(woff);
      expect(fromWoff2.unitsPerEm).toBe(fromWoff.unitsPerEm);
      const points = codePoints(woff);
      expect(points.length).toBeGreaterThan(200);
      for (const point of points) {
        const text = String.fromCodePoint(point);
        const where = `U+${point.toString(16)}`;
        expect(fromWoff2.advance(text, fromWoff2.unitsPerEm), where).toBe(
          fromWoff.advance(text, fromWoff.unitsPerEm),
        );
        expect(extents(fromWoff2, text), where).toEqual(extents(fromWoff, text));
      }
    });

    it('has every table checksum and head.checkSumAdjustment right', () => {
      const view = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
      for (let i = 0; i < view.getUint16(4); i++) {
        const at = 12 + i * 16;
        const tag = String.fromCharCode(...woff2.subarray(at, at + 4));
        const table = woff2.slice(
          view.getUint32(at + 8),
          view.getUint32(at + 8) + view.getUint32(at + 12),
        );
        if (tag === 'head') table.fill(0, 8, 12);
        expect(view.getUint32(at + 4), tag).toBe(checksum(table));
      }
      expect(checksum(woff2)).toBe(0xb1b0afba);
    });
  });
});

describe('decodeWoff2 — malformed input gives null and never throws', () => {
  const good = woff2FromSfnt(sans);
  const tiny = tinyWoff2();
  const patched = (bytes: Uint8Array, edit: (view: DataView) => void): Uint8Array => {
    const copy = bytes.slice();
    edit(new DataView(copy.buffer));
    return copy;
  };

  it('decodes the controls (so each case below differs from a good file by one thing)', () => {
    expect(decodeWoff2(good)).not.toBeNull();
    expect(decodeWoff2(tiny)).not.toBeNull();
  });

  it('rejects a wrong signature, the ttcf flavor and a file cut at 50%', () => {
    expect(decodeWoff2(patched(good, (v) => v.setUint32(0, 0x774f4646)))).toBeNull(); // wOFF
    expect(decodeWoff2(patched(good, (v) => v.setUint32(4, 0x74746366)))).toBeNull(); // ttcf
    expect(decodeWoff2(patched(good, (v) => v.setUint32(4, 0x12345678)))).toBeNull();
    expect(decodeWoff2(good.slice(0, good.length / 2))).toBeNull();
    expect(decodeWoff2(new Uint8Array(0))).toBeNull();
    expect(decodeWoff2(good.slice(0, 20))).toBeNull();
  });

  const entriesOf = (sfnt: Uint8Array) => entriesFromSfnt(sfnt);
  const pack = (entries: ReturnType<typeof entriesOf>, stream?: Uint8Array) =>
    packWoff2(0x00010000, entries, stream === undefined ? {} : { stream });

  it('rejects a Brotli output of the wrong length (longer and shorter than declared)', () => {
    const [first, ...rest] = entriesOf(sans);
    const withDelta = (delta: number) =>
      pack([{ ...first!, origLength: first!.data.length + delta }, ...rest]);
    expect(decodeWoff2(withDelta(0))).not.toBeNull();
    for (const delta of [1, -1])
      expect(decodeWoff2(withDelta(delta)), `delta ${delta}`).toBeNull();
  });

  it('rejects a declared total above MAX_SFNT_BYTES before decompressing anything', () => {
    expect(MAX_SFNT_BYTES).toBe(32 * 1024 * 1024);
    const [first] = entriesOf(sans);
    expect(decodeWoff2(pack([first!]))).not.toBeNull();
    expect(decodeWoff2(pack([{ ...first!, origLength: MAX_SFNT_BYTES + 1 }]))).toBeNull();
    // A stream that would inflate to far more than declared is cut by maxOutputLength: also null.
    const bomb = new Uint8Array(
      brotliCompressSync(new Uint8Array(MAX_SFNT_BYTES + 1024)),
    );
    expect(decodeWoff2(pack([{ ...first!, origLength: 16 }], bomb))).toBeNull();
  });

  it('rejects a transformed hmtx without glyf and loca to read the xMin from', () => {
    const entries = entriesFromSfnt(sans, { transformHmtx: true });
    expect(decodeWoff2(pack(entries))).not.toBeNull();
    expect(
      decodeWoff2(pack(entries.filter((e) => e.tag !== 'glyf' && e.tag !== 'loca'))),
    ).toBeNull();
  });

  it('rejects a glyf stream size beyond the table, a composite without its bbox bit, an empty glyph with one', () => {
    expect(decodeWoff2(tinyWoff2({ nContourSizeDelta: 4096 }))).toBeNull();
    expect(
      decodeWoff2(tinyWoff2({ bboxBitmap: [0, 0, 0, 0], bboxValues: [] })),
    ).toBeNull();
    expect(
      decodeWoff2(
        tinyWoff2({ bboxBitmap: [0x60, 0, 0, 0], bboxValues: [...Array(16).fill(0)] }),
      ),
    ).toBeNull();
  });

  it('rejects a transformed loca whose transformLength is not 0, and an indexFormat that is not the head’s', () => {
    expect(decodeWoff2(tinyWoff2({ locaTransformLength: 4 }))).toBeNull();
    expect(decodeWoff2(tinyWoff2({ indexFormat: 1 }))).toBeNull();
  });

  it('rejects a UIntBase128 with a leading zero and one of 6 bytes', () => {
    const [first, ...rest] = entriesOf(sans);
    const withBytes = (origLengthBytes: number[]) =>
      pack([{ ...first!, origLengthBytes }, ...rest]);
    expect(decodeWoff2(withBytes(base128(first!.data.length)))).not.toBeNull();
    expect(decodeWoff2(withBytes([0x80, ...base128(first!.data.length)]))).toBeNull();
    expect(decodeWoff2(withBytes([0x81, 0x80, 0x80, 0x80, 0x80, 0x00]))).toBeNull();
    expect(decodeWoff2(withBytes([0xff, 0xff, 0xff, 0xff, 0x7f]))).toBeNull(); // past 2^32 - 1
  });

  it('rejects transform versions the spec does not define', () => {
    const entries = entriesOf(sans);
    const withVersion = (tag: string, version: number) =>
      pack(entries.map((e) => (e.tag === tag ? { ...e, version } : e)));
    expect(decodeWoff2(withVersion('cmap', 0))).not.toBeNull();
    expect(decodeWoff2(withVersion('cmap', 1))).toBeNull();
    expect(decodeWoff2(withVersion('hmtx', 2))).toBeNull();
    expect(decodeWoff2(withVersion('glyf', 1))).toBeNull();
  });

  it('never throws, whatever the bytes (every prefix of a file and a few flipped bytes)', () => {
    for (let n = 0; n < tiny.length; n += 3)
      expect(() => decodeWoff2(tiny.slice(0, n))).not.toThrow();
    for (let at = 0; at < tiny.length; at += 5)
      expect(() => decodeWoff2(patched(tiny, (v) => v.setUint8(at, 0xff)))).not.toThrow();
  });
});
