// variable-font.mjs: node variable-font.mjs <out.ttf> [--wght] [--slnt=<min>,<default>,<max>] [--ital=<default>]
// Writes a variable test font (stage #2574, decision 5): a copy of `mcp/fonts/MappingSans-Regular.ttf` with variation
// axes whose only effect is on the advance of `A`-`Z` and `a`-`z`, so a width reads the axis value a renderer sets. No
// binary font is kept in the repository: tests and the tester build it.
//
//   --wght                       adds the axis `wght` 100, 400, 900;
//   --slnt=<min>,<default>,<max> adds the axis `slnt` with those values;
//   --ital=<default>             adds the axis `ital` 0 to 1 with that default (0 or 1).
//
// Each axis has an `fvar` axis record (no named instance). With an axis the font also has a `gvar` table whose only
// deltas move phantom point 2 (the advance) of the simple glyphs mapped from `A`-`Z` and `a`-`z`, the same way for every
// axis: the region toward the axis minimum (peak −1) adds 512 units and the region toward the maximum (peak +1)
// subtracts 256 (the font has 2048 units per em). Composite and empty glyphs get no variation data and the outlines do
// not move. There is no `HVAR`: HarfBuzz and Chromium take the advance from the phantom points.
//
// The table directory is rewritten as `gsub-font.mjs` does: tables sorted by tag, offsets aligned to 4, checksums
// recomputed (`head.checkSumAdjustment` too).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE =
  'usage: node variable-font.mjs <out.ttf> [--wght] [--slnt=<min>,<default>,<max>] [--ital=<default>]\n';
const TOWARD_MIN = 512;
const TOWARD_MAX = -256;

/** The axes asked for, in the order of the font: `{ tag, min, default, max }`. */
function parseAxes(args) {
  const axes = [];
  const known = (name) => args.find((a) => a === name || a.startsWith(`${name}=`));
  const wght = known('--wght');
  if (wght !== undefined) {
    if (wght !== '--wght') throw new Error('--wght takes no value');
    axes.push({ tag: 'wght', min: 100, default: 400, max: 900 });
  }
  const slnt = known('--slnt');
  if (slnt !== undefined) {
    const values = slnt.slice('--slnt='.length).split(',').map(Number);
    const [min, def, max] = values;
    if (
      !slnt.includes('=') ||
      values.length !== 3 ||
      values.some((v) => !Number.isFinite(v)) ||
      !(min <= def && def <= max)
    )
      throw new Error('--slnt needs <min>,<default>,<max> with min <= default <= max');
    axes.push({ tag: 'slnt', min, default: def, max });
  }
  const ital = known('--ital');
  if (ital !== undefined) {
    const def = Number(ital.slice('--ital='.length));
    if (!ital.includes('=') || (def !== 0 && def !== 1))
      throw new Error('--ital needs a default of 0 or 1');
    axes.push({ tag: 'ital', min: 0, default: def, max: 1 });
  }
  const unknown = args.filter(
    (a) => !['--wght', '--slnt', '--ital'].includes(a.split('=')[0]),
  );
  if (unknown.length > 0) throw new Error(`unknown option ${unknown.join(' ')}`);
  return axes;
}

const out = process.argv[2];
let axes = [];
try {
  axes = out === undefined ? [] : parseAxes(process.argv.slice(3));
} catch (error) {
  process.stderr.write(`${error.message}\n${USAGE}`);
  process.exit(2);
}
if (out === undefined || out.startsWith('--') || axes.length === 0) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const source = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../mcp/fonts/MappingSans-Regular.ttf',
);

/** The tables of a TrueType file, by tag. */
function readTables(buf) {
  const tables = new Map();
  const count = buf.readUInt16BE(4);
  for (let n = 0; n < count; n++) {
    const entry = 12 + n * 16;
    const offset = buf.readUInt32BE(entry + 8);
    const length = buf.readUInt32BE(entry + 12);
    tables.set(
      buf.toString('latin1', entry, entry + 4),
      Buffer.from(buf.subarray(offset, offset + length)),
    );
  }
  return tables;
}

/** The glyph id of a code point in the `cmap` (the format 4 subtable), 0 when it is not mapped. */
function glyphOf(cmap, code) {
  const subtables = cmap.readUInt16BE(2);
  for (let n = 0; n < subtables; n++) {
    const base = cmap.readUInt32BE(4 + n * 8 + 4);
    if (cmap.readUInt16BE(base) !== 4) continue;
    const segments = cmap.readUInt16BE(base + 6) / 2;
    const ends = base + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const ranges = deltas + segments * 2;
    for (let s = 0; s < segments; s++) {
      if (code > cmap.readUInt16BE(ends + s * 2)) continue;
      const start = cmap.readUInt16BE(starts + s * 2);
      if (code < start) break;
      const delta = cmap.readUInt16BE(deltas + s * 2);
      const range = cmap.readUInt16BE(ranges + s * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const glyph = cmap.readUInt16BE(ranges + s * 2 + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
  }
  return 0;
}

const u16 = (...values) => {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, n) => buf.writeUInt16BE(v, n * 2));
  return buf;
};

const u32 = (value) => {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0);
  return buf;
};

/** A 16.16 fixed-point number. */
const fixed = (value) => u32(Math.round(value * 65536));

/** An F2Dot14 number as an unsigned 16-bit value. */
const f2dot14 = (value) => Math.round(value * 16384) & 0xffff;

/** The `fvar` table: the axes, and no named instance. */
function buildFvar() {
  const header = u16(1, 0, 16, 2, axes.length, 20, 0, 4 + axes.length * 4);
  const records = axes.map((axis, n) =>
    Buffer.concat([
      Buffer.from(axis.tag, 'latin1'),
      fixed(axis.min),
      fixed(axis.default),
      fixed(axis.max),
      u16(0, 256 + n),
    ]),
  );
  return Buffer.concat([header, ...records]);
}

/** The number of points of a simple glyph, or `null` for an empty or composite one. */
function pointsOf(glyf, loca, long, glyph) {
  const at = (n) => (long ? loca.readUInt32BE(n * 4) : loca.readUInt16BE(n * 2) * 2);
  const start = at(glyph);
  if (at(glyph + 1) === start) return null;
  const contours = glyf.readInt16BE(start);
  if (contours <= 0) return null;
  return glyf.readUInt16BE(start + 10 + (contours - 1) * 2) + 1;
}

/** The point numbers of one tuple: the count, then one run with the delta from 0. */
function packedPoint(point) {
  return point < 256
    ? Buffer.from([1, 0, point])
    : Buffer.from([1, 0x80, point >> 8, point & 255]);
}

/** One delta (a word run of 1) and the zero for the other direction. */
const packedWord = (value) => Buffer.from([0x40, (value >> 8) & 255, value & 255]);
const PACKED_ZERO = Buffer.from([0x80]);

/** The `GlyphVariationData` of a simple glyph with `points` points: two tuples per axis, on phantom point 2. */
function glyphData(points) {
  const tuples = [];
  axes.forEach((_, n) => {
    for (const [peak, delta] of [
      [-1, TOWARD_MIN],
      [1, TOWARD_MAX],
    ]) {
      const peaks = axes.map((__, m) => (m === n ? f2dot14(peak) : 0));
      // Phantom points follow the glyph's points: 0 is the origin, 1 the advance, 2 the top and 3 the bottom.
      const data = Buffer.concat([
        packedPoint(points + 1),
        packedWord(delta),
        PACKED_ZERO,
      ]);
      tuples.push({ peaks, data });
    }
  });
  const headerSize = 4 + tuples.length * (4 + axes.length * 2);
  const headers = tuples.map((t) =>
    Buffer.concat([u16(t.data.length, 0x8000 | 0x2000), u16(...t.peaks)]),
  );
  const body = Buffer.concat([
    u16(tuples.length, headerSize),
    ...headers,
    ...tuples.map((t) => t.data),
  ]);
  return Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4)]);
}

/** The `gvar` table: variation data for the simple glyphs mapped from `A`-`Z` and `a`-`z`. */
function buildGvar(tables) {
  const cmap = tables.get('cmap');
  const glyf = tables.get('glyf');
  const loca = tables.get('loca');
  const long = tables.get('head').readInt16BE(50) === 1;
  const count = tables.get('maxp').readUInt16BE(4);
  const wanted = new Set();
  for (const range of [
    [0x41, 0x5a],
    [0x61, 0x7a],
  ])
    for (let code = range[0]; code <= range[1]; code++) wanted.add(glyphOf(cmap, code));
  const entries = [];
  for (let glyph = 0; glyph < count; glyph++) {
    const points =
      wanted.has(glyph) && glyph !== 0 ? pointsOf(glyf, loca, long, glyph) : null;
    entries.push(points === null ? Buffer.alloc(0) : glyphData(points));
  }
  const headerSize = 20 + (count + 1) * 4;
  const offsets = [];
  let at = 0;
  for (const entry of entries) {
    offsets.push(at);
    at += entry.length;
  }
  offsets.push(at);
  // Header: version 1.0, axis count, no shared tuples, glyph count, long offsets and the data offset.
  const header = Buffer.concat([
    u16(1, 0, axes.length, 0),
    u32(headerSize),
    u16(count, 1),
    u32(headerSize),
  ]);
  return Buffer.concat([header, ...offsets.map(u32), ...entries]);
}

const checksum = (buf) => {
  let sum = 0;
  for (let n = 0; n < buf.length; n += 4) {
    const word = Buffer.alloc(4);
    buf.copy(word, 0, n, Math.min(n + 4, buf.length));
    sum = (sum + word.readUInt32BE(0)) >>> 0;
  }
  return sum;
};

const tables = readTables(readFileSync(source));
tables.set('fvar', buildFvar());
tables.set('gvar', buildGvar(tables));
tables.get('head').writeUInt32BE(0, 8);

const tags = [...tables.keys()].sort();
const count = tags.length;
const directory = 12 + count * 16;
const header = Buffer.alloc(directory);
header.writeUInt32BE(0x00010000, 0);
header.writeUInt16BE(count, 4);
const entrySelector = Math.floor(Math.log2(count));
header.writeUInt16BE(2 ** entrySelector * 16, 6);
header.writeUInt16BE(entrySelector, 8);
header.writeUInt16BE(count * 16 - 2 ** entrySelector * 16, 10);

const body = [];
let offset = directory;
tags.forEach((name, n) => {
  const data = tables.get(name);
  const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
  data.copy(padded);
  const entry = 12 + n * 16;
  header.write(name, entry, 'latin1');
  header.writeUInt32BE(checksum(padded), entry + 4);
  header.writeUInt32BE(offset, entry + 8);
  header.writeUInt32BE(data.length, entry + 12);
  body.push(padded);
  offset += padded.length;
});

const file = Buffer.concat([header, ...body]);
const headEntry = 12 + tags.indexOf('head') * 16;
const headOffset = file.readUInt32BE(headEntry + 8);
file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headOffset + 8);
writeFileSync(out, file);
