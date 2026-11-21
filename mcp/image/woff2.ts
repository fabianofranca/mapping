import { brotliDecompressSync } from 'node:zlib';

// WOFF2 (W3C Recommendation, sections 3 to 5) to a plain sfnt: HarfBuzz reads only the latter. The file is one Brotli
// stream of the tables; `glyf`/`loca` and `hmtx` may be stored transformed, and are rebuilt here. Pure and
// synchronous, with `node:zlib` as the only dependency. The decoder never throws: a read outside a buffer and every
// rule below that fails give `null`, and the font is treated as unreadable (#2126).

/** Ceiling of what we decode: the sum of the declared table lengths, checked before decompressing, and the sfnt. */
export const MAX_SFNT_BYTES = 32 * 1024 * 1024;

const SIGNATURE = 0x774f4632; // 'wOF2'
const FLAVORS = new Set([0x00010000, 0x4f54544f, 0x74727565]); // TrueType, 'OTTO', 'true'; 'ttcf' is a collection
const SFNT_HEADER_BYTES = 12;
const SFNT_ENTRY_BYTES = 16;
const CHECKSUM_MAGIC = 0xb1b0afba;
const EXPLICIT_TAG = 63;

/** The 63 tags a directory entry can name by index (W3C WOFF2, section 5.1). */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
].map((tag) => tagValue(tag)); // prettier-ignore

function tagValue(tag: string): number {
  return (
    ((tag.charCodeAt(0) << 24) |
      (tag.charCodeAt(1) << 16) |
      (tag.charCodeAt(2) << 8) |
      tag.charCodeAt(3)) >>>
    0
  );
}

const GLYF = tagValue('glyf');
const LOCA = tagValue('loca');
const HMTX = tagValue('hmtx');
const HEAD = tagValue('head');
const HHEA = tagValue('hhea');
const MAXP = tagValue('maxp');

/** Raised by every rule that fails; `decodeWoff2` turns it (and a `RangeError`) into `null`. */
class Woff2Error extends Error {}

function bad(reason: string): never {
  throw new Woff2Error(reason);
}

/** A cursor over bytes: every read checks the bounds. */
class Reader {
  private readonly view: DataView;
  pos = 0;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private advance(count: number): number {
    if (count > this.bytes.length - this.pos) bad('read past the end of a buffer');
    const at = this.pos;
    this.pos += count;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.advance(1));
  }

  u16(): number {
    return this.view.getUint16(this.advance(2));
  }

  i16(): number {
    return this.view.getInt16(this.advance(2));
  }

  u32(): number {
    return this.view.getUint32(this.advance(4));
  }

  take(count: number): Uint8Array {
    const at = this.advance(count);
    return this.bytes.subarray(at, at + count);
  }

  /** `UIntBase128`: at most 5 bytes, no leading zero byte, no value past 2³² − 1. */
  base128(): number {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) bad('UIntBase128 with a leading zero');
      if (value >= 0x02000000) bad('UIntBase128 past 2^32 - 1');
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    return bad('UIntBase128 of more than 5 bytes');
  }

  /** `255UInt16`. */
  u255(): number {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

const dataView = (data: Uint8Array): DataView =>
  new DataView(data.buffer, data.byteOffset, data.byteLength);

// ---- Header and table directory -----------------------------------------------------------------------------------

interface DirectoryEntry {
  readonly tag: number;
  readonly transformed: boolean;
  /** Bytes the table takes in the decompressed stream: `transformLength` when transformed, else `origLength`. */
  readonly length: number;
}

interface Header {
  readonly flavor: number;
  readonly numTables: number;
  readonly compressedSize: number;
}

function readHeader(r: Reader, fileLength: number): Header {
  if (r.u32() !== SIGNATURE) bad('not a WOFF2 file');
  const flavor = r.u32();
  if (!FLAVORS.has(flavor)) bad('flavor is not a single TrueType or CFF font');
  if (r.u32() > fileLength) bad('the file is shorter than its header says');
  const numTables = r.u16();
  if (numTables === 0) bad('no tables');
  r.take(2 + 4); // reserved, totalSfntSize (an estimate, never trusted)
  const compressedSize = r.u32();
  r.take(2 + 2 + 4 * 5); // version, metadata and private blocks (not read)
  return { flavor, numTables, compressedSize };
}

/** Whether the table is stored transformed, from its directory version; the versions the spec defines only. */
function isTransformed(tag: number, version: number): boolean {
  if (tag === GLYF || tag === LOCA) {
    if (version === 0) return true;
    return version === 3 ? false : bad(`glyf/loca transform version ${version}`);
  }
  if (tag === HMTX) {
    if (version === 1) return true;
    return version === 0 ? false : bad(`hmtx transform version ${version}`);
  }
  return version === 0
    ? false
    : bad(`transform version ${version} on a table with no transform`);
}

function readEntry(r: Reader): DirectoryEntry {
  const flags = r.u8();
  const index = flags & 0x3f;
  const tag =
    index === EXPLICIT_TAG ? r.u32() : (KNOWN_TAGS[index] ?? bad('unknown tag index'));
  const origLength = r.base128();
  const transformed = isTransformed(tag, flags >> 6);
  return { tag, transformed, length: transformed ? r.base128() : origLength };
}

function readDirectory(r: Reader, count: number): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    const entry = readEntry(r);
    if (seen.has(entry.tag)) bad('a table appears twice');
    seen.add(entry.tag);
    entries.push(entry);
  }
  return entries;
}

/** The decompressed stream, exactly as long as the directory says; the declared total is checked first. */
function decompress(r: Reader, header: Header, entries: DirectoryEntry[]): Uint8Array {
  const total = entries.reduce((sum, entry) => sum + entry.length, 0);
  if (total === 0 || total > MAX_SFNT_BYTES) bad('declared table sizes out of range');
  const data = brotliDecompressSync(r.take(header.compressedSize), {
    maxOutputLength: total,
  });
  if (data.length !== total) bad('the Brotli output is not the declared length');
  return data;
}

// ---- glyf and loca (section 5.1) ----------------------------------------------------------------------------------

interface GlyfStreams {
  readonly numGlyphs: number;
  readonly indexFormat: number;
  readonly nContour: Reader;
  readonly nPoints: Reader;
  readonly flags: Reader;
  readonly glyph: Reader;
  readonly composite: Reader;
  readonly bbox: Reader;
  readonly bboxBitmap: Uint8Array;
  readonly instructions: Reader;
  readonly overlap: Uint8Array | null;
}

/** The transformed `glyf` header and its seven streams; a size that goes beyond the table fails the read. */
function openGlyf(data: Uint8Array): GlyfStreams {
  const r = new Reader(data);
  r.u16(); // reserved
  const optionFlags = r.u16();
  const numGlyphs = r.u16();
  const indexFormat = r.u16();
  if (indexFormat > 1) bad('indexFormat');
  const sizes = Array.from({ length: 7 }, () => r.u32());
  const [nContour, nPoints, flags, glyph, composite, bbox, instructions] = sizes.map(
    (size) => new Reader(r.take(size)),
  ) as [Reader, Reader, Reader, Reader, Reader, Reader, Reader];
  const overlap = (optionFlags & 1) !== 0 ? r.take((numGlyphs + 7) >> 3) : null;
  const bboxBitmap = bbox.take(4 * ((numGlyphs + 31) >> 5));
  return {
    numGlyphs,
    indexFormat,
    nContour,
    nPoints,
    flags,
    glyph,
    composite,
    bbox,
    bboxBitmap,
    instructions,
    overlap,
  };
}

const bitSet = (bitmap: Uint8Array, i: number): boolean =>
  ((bitmap[i >> 3] ?? 0) & (0x80 >> (i & 7))) !== 0;

const withSign = (flag: number, base: number): number =>
  (flag & 1) !== 0 ? base : -base;

/** The (dx, dy) of one point from its flag (7 bits) and the glyph stream: the 128 triplet encodings. */
function readTriplet(flag: number, g: Reader): [number, number] {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + g.u8())];
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + g.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = g.u8();
    return [
      withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)),
      withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)),
    ];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const lowX = g.u8();
    const lowY = g.u8();
    return [
      withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + lowX),
      withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + lowY),
    ];
  }
  if (flag < 124) {
    const b0 = g.u8();
    const b1 = g.u8();
    const b2 = g.u8();
    return [
      withSign(flag, (b0 << 4) + (b1 >> 4)),
      withSign(flag >> 1, ((b1 & 0x0f) << 8) + b2),
    ];
  }
  return [withSign(flag, g.u16()), withSign(flag >> 1, g.u16())];
}

interface Points {
  readonly xs: Int32Array;
  readonly ys: Int32Array;
  readonly onCurve: Uint8Array;
}

function readPoints(s: GlyfStreams, count: number): Points {
  const flags = s.flags.take(count);
  const xs = new Int32Array(count);
  const ys = new Int32Array(count);
  const onCurve = new Uint8Array(count);
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    const flag = flags[i] ?? 0;
    const [dx, dy] = readTriplet(flag & 0x7f, s.glyph);
    x += dx;
    y += dy;
    if (x < -32768 || x > 32767 || y < -32768 || y > 32767)
      bad('a coordinate outside int16');
    xs[i] = x;
    ys[i] = y;
    onCurve[i] = flag >> 7 === 0 ? 1 : 0;
  }
  return { xs, ys, onCurve };
}

function computedBbox(points: Points): Uint8Array {
  const out = new Uint8Array(8);
  const v = dataView(out);
  const { xs, ys } = points;
  const [xMin, yMin, xMax, yMax] =
    xs.length === 0
      ? [0, 0, 0, 0]
      : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  [xMin, yMin, xMax, yMax].forEach((value, i) => v.setInt16(i * 2, value as number));
  return out;
}

const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;
const OVERLAP_SIMPLE = 0x40;

/** The flag bits of one coordinate delta: "same" for 0, the short form for |d| < 256, else an `int16`. */
function coordinateFlag(delta: number, short: number, same: number): number {
  if (delta === 0) return same;
  if (Math.abs(delta) < 256) return short | (delta > 0 ? same : 0);
  if (delta < -32768 || delta > 32767) bad('a delta outside int16');
  return 0;
}

const coordinateSize = (flag: number, short: number, same: number): number =>
  (flag & short) !== 0 ? 1 : (flag & same) !== 0 ? 0 : 2;

/** The flag of each point (one byte per point, no repeat) and the byte sizes of the x and y arrays. */
function encodeFlags(
  points: Points,
  overlap: boolean,
): { flags: Uint8Array; xBytes: number; yBytes: number } {
  const count = points.xs.length;
  const flags = new Uint8Array(count);
  let xBytes = 0;
  let yBytes = 0;
  for (let i = 0; i < count; i++) {
    const dx = (points.xs[i] as number) - (points.xs[i - 1] ?? 0);
    const dy = (points.ys[i] as number) - (points.ys[i - 1] ?? 0);
    const flag =
      coordinateFlag(dx, X_SHORT, X_SAME_OR_POSITIVE) |
      coordinateFlag(dy, Y_SHORT, Y_SAME_OR_POSITIVE);
    flags[i] = flag | (points.onCurve[i] as number);
    xBytes += coordinateSize(flag, X_SHORT, X_SAME_OR_POSITIVE);
    yBytes += coordinateSize(flag, Y_SHORT, Y_SAME_OR_POSITIVE);
  }
  if (overlap && count > 0) flags[0] = (flags[0] as number) | OVERLAP_SIMPLE;
  return { flags, xBytes, yBytes };
}

/** Writes the deltas of one axis (`values`) as the flags say; returns the offset after them. */
function writeCoordinates(
  out: DataView,
  at: number,
  flags: Uint8Array,
  values: Int32Array,
  short: number,
  same: number,
): number {
  let offset = at;
  let previous = 0;
  flags.forEach((flag, i) => {
    const delta = (values[i] as number) - previous;
    previous = values[i] as number;
    if ((flag & short) !== 0) out.setUint8(offset++, Math.abs(delta));
    else if ((flag & same) === 0) {
      out.setInt16(offset, delta);
      offset += 2;
    }
  });
  return offset;
}

const padded = (length: number): number => (length + 3) & ~3;

/** A simple glyph in the output encoding: the header, `endPtsOfContours`, instructions, flags, x, y; padded to 4. */
function encodeSimpleGlyph(
  endPoints: number[],
  points: Points,
  instructions: Uint8Array,
  bbox: Uint8Array,
  overlap: boolean,
): Uint8Array {
  const { flags, xBytes, yBytes } = encodeFlags(points, overlap);
  const out = new Uint8Array(
    padded(
      10 +
        endPoints.length * 2 +
        2 +
        instructions.length +
        flags.length +
        xBytes +
        yBytes,
    ),
  );
  const v = dataView(out);
  v.setInt16(0, endPoints.length);
  out.set(bbox, 2);
  endPoints.forEach((end, i) => v.setUint16(10 + i * 2, end));
  let at = 10 + endPoints.length * 2;
  v.setUint16(at, instructions.length);
  out.set(instructions, at + 2);
  at += 2 + instructions.length;
  out.set(flags, at);
  at += flags.length;
  at = writeCoordinates(v, at, flags, points.xs, X_SHORT, X_SAME_OR_POSITIVE);
  writeCoordinates(v, at, flags, points.ys, Y_SHORT, Y_SAME_OR_POSITIVE);
  return out;
}

function readSimpleGlyph(s: GlyfStreams, index: number, contours: number): Uint8Array {
  const endPoints: number[] = [];
  let count = 0;
  for (let c = 0; c < contours; c++) {
    count += s.nPoints.u255();
    if (count > 0xffff) bad('more than 65535 points');
    endPoints.push(count - 1);
  }
  const points = readPoints(s, count);
  const instructions = s.instructions.take(s.glyph.u255());
  const bbox = bitSet(s.bboxBitmap, index) ? s.bbox.take(8) : computedBbox(points);
  return encodeSimpleGlyph(
    endPoints,
    points,
    instructions,
    bbox,
    s.overlap !== null && bitSet(s.overlap, index),
  );
}

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;
const WE_HAVE_INSTRUCTIONS = 0x0100;

/** The component records of a composite glyph, copied as they are, and whether any of them announces instructions. */
function readComponents(c: Reader): { bytes: Uint8Array; instructions: boolean } {
  const start = c.pos;
  let instructions = false;
  let flags: number;
  do {
    flags = c.u16();
    c.u16(); // glyphIndex
    c.take((flags & ARG_1_AND_2_ARE_WORDS) !== 0 ? 4 : 2);
    if ((flags & WE_HAVE_A_SCALE) !== 0) c.take(2);
    else if ((flags & WE_HAVE_AN_X_AND_Y_SCALE) !== 0) c.take(4);
    else if ((flags & WE_HAVE_A_TWO_BY_TWO) !== 0) c.take(8);
    instructions ||= (flags & WE_HAVE_INSTRUCTIONS) !== 0;
  } while ((flags & MORE_COMPONENTS) !== 0);
  return { bytes: c.bytes.subarray(start, c.pos), instructions };
}

function readCompositeGlyph(s: GlyfStreams, index: number): Uint8Array {
  if (!bitSet(s.bboxBitmap, index)) bad('a composite glyph without its bbox');
  const bbox = s.bbox.take(8);
  const components = readComponents(s.composite);
  const instructions = components.instructions
    ? s.instructions.take(s.glyph.u255())
    : null;
  const size =
    10 + components.bytes.length + (instructions === null ? 0 : 2 + instructions.length);
  const out = new Uint8Array(padded(size));
  const v = dataView(out);
  v.setInt16(0, -1);
  out.set(bbox, 2);
  out.set(components.bytes, 10);
  if (instructions !== null) {
    v.setUint16(10 + components.bytes.length, instructions.length);
    out.set(instructions, 12 + components.bytes.length);
  }
  return out;
}

const EMPTY = new Uint8Array(0);

function readGlyph(s: GlyfStreams, index: number): Uint8Array {
  const contours = s.nContour.i16();
  if (contours === 0)
    return bitSet(s.bboxBitmap, index) ? bad('an empty glyph with a bbox') : EMPTY;
  if (contours === -1) return readCompositeGlyph(s, index);
  return contours < -1 ? bad('number of contours') : readSimpleGlyph(s, index, contours);
}

function encodeLoca(offsets: number[], indexFormat: number): Uint8Array {
  const out = new Uint8Array(offsets.length * (indexFormat === 0 ? 2 : 4));
  const v = dataView(out);
  offsets.forEach((offset, i) => {
    if (indexFormat === 1) v.setUint32(i * 4, offset);
    else if (offset / 2 > 0xffff) bad('glyf too long for a short loca');
    else v.setUint16(i * 2, offset / 2);
  });
  return out;
}

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The rebuilt `glyf` and `loca`; `indexToLocFormat` is the `head`'s and must be the one the transform declares. */
function rebuildGlyf(
  data: Uint8Array,
  indexToLocFormat: number,
): { glyf: Uint8Array; loca: Uint8Array } {
  const s = openGlyf(data);
  if (s.indexFormat !== indexToLocFormat) bad('indexFormat is not head.indexToLocFormat');
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let total = 0;
  for (let i = 0; i < s.numGlyphs; i++) {
    const glyph = readGlyph(s, i);
    offsets.push(total);
    parts.push(glyph);
    total += glyph.length;
    if (total > MAX_SFNT_BYTES) bad('glyf past the ceiling');
  }
  offsets.push(total);
  return { glyf: concat(parts, total), loca: encodeLoca(offsets, s.indexFormat) };
}

// ---- hmtx (section 5.4) -------------------------------------------------------------------------------------------

/** The `xMin` of each glyph (0 for an empty one), read from `glyf` through `loca`. */
function glyphXMins(
  glyf: Uint8Array,
  loca: Uint8Array,
  indexToLocFormat: number,
  numGlyphs: number,
): number[] {
  const l = dataView(loca);
  const g = dataView(glyf);
  const at = (i: number): number =>
    indexToLocFormat === 1 ? l.getUint32(i * 4) : l.getUint16(i * 2) * 2;
  return Array.from({ length: numGlyphs }, (_, i) => {
    const start = at(i);
    const end = at(i + 1);
    if (end < start || end > glyf.length) bad('loca out of order');
    return end === start ? 0 : g.getInt16(start + 2);
  });
}

/** The `lsb` values of `count` glyphs from `first`: read from the stream, or the glyph's `xMin` when dropped. */
function readLsbs(
  r: Reader,
  first: number,
  count: number,
  dropped: boolean,
  xMins: number[],
): number[] {
  return Array.from({ length: count }, (_, i) =>
    dropped ? (xMins[first + i] as number) : r.i16(),
  );
}

function rebuildHmtx(
  data: Uint8Array,
  numGlyphs: number,
  numHMetrics: number,
  xMins: number[],
): Uint8Array {
  if (numHMetrics === 0 || numHMetrics > numGlyphs) bad('numberOfHMetrics');
  const r = new Reader(data);
  const flags = r.u8();
  // Bits 2 to 7 are reserved; a transform that drops nothing is not a transform.
  if ((flags & 0xfc) !== 0 || (flags & 3) === 0) bad('hmtx transform flags');
  const advances = Array.from({ length: numHMetrics }, () => r.u16());
  const proportional = readLsbs(r, 0, numHMetrics, (flags & 1) !== 0, xMins);
  const monospaced = readLsbs(
    r,
    numHMetrics,
    numGlyphs - numHMetrics,
    (flags & 2) !== 0,
    xMins,
  );
  const out = new Uint8Array(numHMetrics * 4 + (numGlyphs - numHMetrics) * 2);
  const v = dataView(out);
  advances.forEach((advance, i) => {
    v.setUint16(i * 4, advance);
    v.setInt16(i * 4 + 2, proportional[i] as number);
  });
  monospaced.forEach((lsb, i) => v.setInt16(numHMetrics * 4 + i * 2, lsb));
  return out;
}

// ---- The tables of the sfnt ---------------------------------------------------------------------------------------

/** The tables, by tag, after the transforms are undone. */
function reconstruct(
  entries: DirectoryEntry[],
  stream: Uint8Array,
): Map<number, Uint8Array> {
  const stored = new Map<number, Uint8Array>();
  const transformed = new Map<number, Uint8Array>();
  let at = 0;
  for (const entry of entries) {
    (entry.transformed ? transformed : stored).set(
      entry.tag,
      stream.subarray(at, at + entry.length),
    );
    at += entry.length;
  }
  if (transformed.has(GLYF) || transformed.has(LOCA))
    undoGlyfTransform(transformed, stored);
  const hmtx = transformed.get(HMTX);
  if (hmtx !== undefined) stored.set(HMTX, undoHmtxTransform(hmtx, stored));
  return stored;
}

function required(
  tables: Map<number, Uint8Array>,
  tag: number,
  name: string,
): Uint8Array {
  return tables.get(tag) ?? bad(`no ${name} table`);
}

function indexToLocFormat(tables: Map<number, Uint8Array>): number {
  return dataView(required(tables, HEAD, 'head')).getInt16(50);
}

function undoGlyfTransform(
  transformed: Map<number, Uint8Array>,
  stored: Map<number, Uint8Array>,
): void {
  const glyf = transformed.get(GLYF);
  const loca = transformed.get(LOCA);
  if (glyf === undefined || loca === undefined)
    bad('glyf and loca are not both transformed');
  if (loca.length !== 0) bad('a transformed loca has a transformLength other than 0');
  const rebuilt = rebuildGlyf(glyf, indexToLocFormat(stored));
  stored.set(GLYF, rebuilt.glyf);
  stored.set(LOCA, rebuilt.loca);
}

function undoHmtxTransform(
  data: Uint8Array,
  tables: Map<number, Uint8Array>,
): Uint8Array {
  const numGlyphs = dataView(required(tables, MAXP, 'maxp')).getUint16(4);
  const numHMetrics = dataView(required(tables, HHEA, 'hhea')).getUint16(34);
  const xMins = glyphXMins(
    required(tables, GLYF, 'glyf'),
    required(tables, LOCA, 'loca'),
    indexToLocFormat(tables),
    numGlyphs,
  );
  return rebuildHmtx(data, numGlyphs, numHMetrics, xMins);
}

/** The sum of the big-endian 32-bit words of the bytes, zero padded to a multiple of 4. */
function checksum(data: Uint8Array): number {
  const v = dataView(data);
  let sum = 0;
  const whole = data.length & ~3;
  for (let i = 0; i < whole; i += 4) sum += v.getUint32(i);
  for (let i = whole; i < data.length; i++)
    sum += (data[i] as number) * 2 ** (8 * (3 - (i - whole)));
  return sum % 2 ** 32;
}

/** The sfnt: offset table, records sorted by tag, tables at multiples of 4, checksums and `checkSumAdjustment`. */
function buildSfnt(flavor: number, tables: Map<number, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort((a, b) => a - b);
  const count = tags.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 16;
  let offset = SFNT_HEADER_BYTES + count * SFNT_ENTRY_BYTES;
  const dataStart = offset;
  const total = tags.reduce(
    (sum, tag) => sum + padded((tables.get(tag) as Uint8Array).length),
    dataStart,
  );
  if (total > MAX_SFNT_BYTES) bad('the sfnt is past the ceiling');
  const out = new Uint8Array(total);
  const v = dataView(out);
  v.setUint32(0, flavor);
  v.setUint16(4, count);
  v.setUint16(6, searchRange);
  v.setUint16(8, entrySelector);
  v.setUint16(10, count * 16 - searchRange);
  let headAt = -1;
  tags.forEach((tag, i) => {
    const data = tables.get(tag) as Uint8Array;
    const at = SFNT_HEADER_BYTES + i * SFNT_ENTRY_BYTES;
    out.set(data, offset);
    if (tag === HEAD) {
      if (data.length < 54) bad('a short head table');
      headAt = offset;
      v.setUint32(offset + 8, 0); // checkSumAdjustment is 0 while summing
    }
    v.setUint32(at, tag);
    v.setUint32(at + 4, checksum(out.subarray(offset, offset + data.length)));
    v.setUint32(at + 8, offset);
    v.setUint32(at + 12, data.length);
    offset += padded(data.length);
  });
  if (headAt >= 0)
    v.setUint32(headAt + 8, (CHECKSUM_MAGIC - checksum(out) + 2 ** 32) % 2 ** 32);
  return out;
}

function decode(bytes: Uint8Array): Uint8Array {
  const r = new Reader(bytes);
  const header = readHeader(r, bytes.length);
  const entries = readDirectory(r, header.numTables);
  const stream = decompress(r, header, entries);
  return buildSfnt(header.flavor, reconstruct(entries, stream));
}

/**
 * The sfnt inside a WOFF2 file, or `null` when the file is not one we read: a collection (`ttcf`), a malformed or
 * truncated file, a table whose sizes do not add up, or anything past `MAX_SFNT_BYTES`. Never throws.
 */
export function decodeWoff2(bytes: Uint8Array): Uint8Array | null {
  try {
    return decode(bytes);
  } catch {
    return null;
  }
}
