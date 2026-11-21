import { brotliCompressSync } from 'node:zlib';
import { sfntTables } from './woffFile';

// Builds WOFF2 files for the tests of mcp/image/woff2.ts: from an sfnt (null transform on `glyf`/`loca`, `hmtx`
// transformed or not) and a tiny font whose `glyf` is transformed by hand. Independent of the decoder: the table
// of known tags is a second copy of the W3C one, and the glyph streams are written here from the spec's rules.

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]; // prettier-ignore

/** `UIntBase128`, shortest form. */
export function base128(value: number): number[] {
  const out = [value % 128];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128))
    out.unshift((rest % 128) | 0x80);
  return out;
}

/** One table of the directory, with the exact bytes the stream carries for it. */
export interface Woff2Entry {
  readonly tag: string;
  /** The table's bytes in the Brotli stream (the transformed ones for a transformed table). */
  readonly data: Uint8Array;
  /** Transform version in the directory flags (default 0). */
  readonly version?: number;
  /** `origLength`; default `data.length`. */
  readonly origLength?: number;
  /** Written (as `transformLength`) when set. */
  readonly transformLength?: number;
  /** Raw bytes of the `origLength` field, to write an invalid `UIntBase128`. */
  readonly origLengthBytes?: readonly number[];
}

export interface Woff2Options {
  readonly signature?: string;
  /** Brotli stream replaced by these bytes (its length goes in the header). */
  readonly stream?: Uint8Array;
}

const u32 = (n: number): number[] => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const u16 = (n: number): number[] => [(n >>> 8) & 255, n & 255];
const tagBytes = (tag: string): number[] => [...new TextEncoder().encode(tag)];

function entryBytes(entry: Woff2Entry): number[] {
  const index = KNOWN_TAGS.indexOf(entry.tag);
  const flags = (index < 0 ? 63 : index) | ((entry.version ?? 0) << 6);
  return [
    flags,
    ...(index < 0 ? tagBytes(entry.tag) : []),
    ...(entry.origLengthBytes ?? base128(entry.origLength ?? entry.data.length)),
    ...(entry.transformLength === undefined ? [] : base128(entry.transformLength)),
  ];
}

/** A WOFF2 file: header, directory, one Brotli stream of the entries' bytes in order. */
export function packWoff2(
  flavor: number,
  entries: readonly Woff2Entry[],
  options: Woff2Options = {},
): Uint8Array {
  const directory = entries.flatMap(entryBytes);
  const raw = Buffer.concat(entries.map((e) => e.data));
  const stream = options.stream ?? new Uint8Array(brotliCompressSync(raw));
  const head = 48 + directory.length;
  const total = (head + stream.length + 3) & ~3;
  const out = new Uint8Array(total);
  out.set(tagBytes(options.signature ?? 'wOF2'), 0);
  out.set(
    [
      ...u32(flavor),
      ...u32(total),
      ...u16(entries.length),
      ...u16(0),
      ...u32(raw.length),
      ...u32(stream.length),
    ],
    4,
  );
  out.set(directory, 48);
  out.set(stream, head);
  return out;
}

export interface FromSfntOptions {
  /** Transform `hmtx` as the spec does (version 1, `lsb` dropped where it equals `xMin`). */
  readonly transformHmtx?: boolean;
}

const view = (data: Uint8Array): DataView =>
  new DataView(data.buffer, data.byteOffset, data.byteLength);

/** The `xMin` of each glyph of a `glyf`/`loca` pair, 0 for an empty one. */
function xMins(
  glyf: Uint8Array,
  loca: Uint8Array,
  longLoca: boolean,
  count: number,
): number[] {
  const l = view(loca);
  const g = view(glyf);
  const at = (i: number): number =>
    longLoca ? l.getUint32(i * 4) : l.getUint16(i * 2) * 2;
  return Array.from({ length: count }, (_, i) =>
    at(i + 1) > at(i) ? g.getInt16(at(i) + 2) : 0,
  );
}

/** `hmtx` in the transformed form: the `lsb` runs are dropped when every one of them equals its glyph's `xMin`. */
function transformedHmtx(hmtx: Uint8Array, mins: number[], hMetrics: number): Uint8Array {
  const v = view(hmtx);
  const proportional = Array.from({ length: hMetrics }, (_, i) => v.getInt16(i * 4 + 2));
  const monospaced = Array.from({ length: mins.length - hMetrics }, (_, i) =>
    v.getInt16(hMetrics * 4 + i * 2),
  );
  const dropProportional = proportional.every((lsb, i) => lsb === mins[i]);
  const dropMonospaced = monospaced.every((lsb, i) => lsb === mins[hMetrics + i]);
  const out: number[] = [(dropProportional ? 1 : 0) | (dropMonospaced ? 2 : 0)];
  for (let i = 0; i < hMetrics; i++) out.push(...u16(v.getUint16(i * 4)));
  if (!dropProportional) proportional.forEach((lsb) => out.push(...u16(lsb)));
  if (!dropMonospaced) monospaced.forEach((lsb) => out.push(...u16(lsb)));
  return Uint8Array.from(out);
}

/** The transformed `hmtx` of an sfnt, as `woff2FromSfnt` writes it with `transformHmtx`. */
export function transformedHmtxOf(sfnt: Uint8Array): Uint8Array {
  const { tables } = sfntTables(sfnt);
  const get = (tag: string): Uint8Array => tables.find((t) => t.tag === tag)!.data;
  const count = view(get('maxp')).getUint16(4);
  const longLoca = view(get('head')).getInt16(50) === 1;
  const mins = xMins(get('glyf'), get('loca'), longLoca, count);
  return transformedHmtx(get('hmtx'), mins, view(get('hhea')).getUint16(34));
}

/** The directory entries of an sfnt: `glyf`/`loca` with the null transform (version 3), `hmtx` transformed on request. */
export function entriesFromSfnt(
  sfnt: Uint8Array,
  options: FromSfntOptions = {},
): Woff2Entry[] {
  const { tables } = sfntTables(sfnt);
  return tables.map((t): Woff2Entry => {
    if (t.tag === 'glyf' || t.tag === 'loca')
      return { tag: t.tag, data: t.data, version: 3 };
    if (t.tag === 'hmtx' && options.transformHmtx === true) {
      const data = transformedHmtxOf(sfnt);
      return {
        tag: t.tag,
        data,
        version: 1,
        origLength: t.data.length,
        transformLength: data.length,
      };
    }
    return { tag: t.tag, data: t.data };
  });
}

/** A WOFF2 of the sfnt, from `entriesFromSfnt`. */
export function woff2FromSfnt(
  sfnt: Uint8Array,
  options: FromSfntOptions = {},
): Uint8Array {
  return packWoff2(sfntTables(sfnt).flavor, entriesFromSfnt(sfnt, options));
}

// ---- A tiny font with a hand-made transformed `glyf` ------------------------------------------------------------

/** The simple glyph's bytes that the decoder must produce (decision 4): flags 31 21 35, short and long deltas, padded. */
export const TINY_SIMPLE_GLYPH = Uint8Array.from([
  0x00, 0x01, 0x00, 0x00, 0xff, 0x38, 0x01, 0x2c, 0x00, 0x00, // 1 contour, bbox (0, -200, 300, 0)
  0x00, 0x02, // endPtsOfContours
  0x00, 0x01, 0xab, // one instruction
  0x31, 0x21, 0x15, // flags: one byte per point
  0x01, 0x2c, // x: +300 as int16
  0xc8, // y: -200, short and negative
  0x00, 0x00, 0x00, // padding to 24
]); // prettier-ignore

/** The composite glyph's bytes: bbox from the bbox stream, the component copied as is. */
export const TINY_COMPOSITE_GLYPH = Uint8Array.from([
  0xff, 0xff, 0x00, 0x00, 0xff, 0x38, 0x01, 0x2c, 0x00, 0x00,
  0x00, 0x02, 0x00, 0x00, 0x05, 0x06,
]); // prettier-ignore

export interface TinyOptions {
  /** Sets the overlap bitmap (option flag bit 0) with the first glyph's bit on. */
  readonly overlap?: boolean;
  /** Bitmap of the glyphs with an explicit bbox (glyph 0 is the MSB of byte 0); default: the composite only. */
  readonly bboxBitmap?: number[];
  /** The bbox values that follow the bitmap; default: the composite's. */
  readonly bboxValues?: number[];
  /** Added to the `nContour` stream size in the transform header. */
  readonly nContourSizeDelta?: number;
  /** `transformLength` of the `loca` entry (default 0). */
  readonly locaTransformLength?: number;
  /** `indexFormat` of the transform header (default 0, as the `head`). */
  readonly indexFormat?: number;
}

const BBOX = [0x00, 0x00, 0xff, 0x38, 0x01, 0x2c, 0x00, 0x00];

function tinyGlyfTransform(options: TinyOptions): Uint8Array {
  const nContour = [...u16(1), ...u16(0xffff), ...u16(0)];
  const nPoints = [3];
  const flagStream = [127, 127, 125];
  // Four-byte triplets: (0, 0), (+300, 0) and (0, -200); then the instruction length of glyph 0 (1).
  const glyph = [0, 0, 0, 0, 0x01, 0x2c, 0, 0, 0, 0, 0, 0xc8, 1];
  const composite = [0x00, 0x02, 0x00, 0x00, 0x05, 0x06];
  const bbox = [
    ...(options.bboxBitmap ?? [0x40, 0, 0, 0]),
    ...(options.bboxValues ?? BBOX),
  ];
  const instruction = [0xab];
  const sizes = [nContour, nPoints, flagStream, glyph, composite, bbox, instruction].map(
    (s) => s.length,
  );
  const header = [
    ...u16(0),
    ...u16(options.overlap === true ? 1 : 0),
    ...u16(3),
    ...u16(options.indexFormat ?? 0),
    ...sizes.flatMap((size, i) =>
      u32(i === 0 ? size + (options.nContourSizeDelta ?? 0) : size),
    ),
  ];
  const overlap = options.overlap === true ? [0x80] : [];
  return Uint8Array.from([
    ...header, ...nContour, ...nPoints, ...flagStream, ...glyph, ...composite, ...bbox, ...instruction, ...overlap,
  ]); // prettier-ignore
}

/** A minimal font (`head`, `hhea`, `maxp`, `hmtx`, transformed `glyf` and `loca`) of 3 glyphs: simple, composite, empty. */
export function tinyWoff2(options: TinyOptions = {}): Uint8Array {
  const head = new Uint8Array(54);
  view(head).setUint32(0, 0x00010000);
  view(head).setUint32(12, 0x5f0f3cf5);
  const hhea = new Uint8Array(36);
  view(hhea).setUint16(34, 3);
  const maxp = Uint8Array.from([0x00, 0x00, 0x50, 0x00, 0x00, 0x03]);
  const hmtx = Uint8Array.from([
    ...u16(500), ...u16(0), ...u16(600), ...u16(0), ...u16(700), ...u16(0),
  ]); // prettier-ignore
  const glyf = tinyGlyfTransform(options);
  return packWoff2(0x00010000, [
    { tag: 'glyf', data: glyf, version: 0, origLength: 40, transformLength: glyf.length },
    {
      tag: 'loca',
      data: new Uint8Array(options.locaTransformLength ?? 0),
      version: 0,
      origLength: 8,
      transformLength: options.locaTransformLength ?? 0,
    },
    { tag: 'head', data: head },
    { tag: 'hhea', data: hhea },
    { tag: 'hmtx', data: hmtx },
    { tag: 'maxp', data: maxp },
  ]);
}
