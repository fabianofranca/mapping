// gsub-font.mjs: node gsub-font.mjs <out.ttf> [--calt] [--rtl]
// Writes a test font: a copy of `mcp/fonts/MappingSans-Regular.ttf` whose GSUB table is replaced by
// one the MCP server's `opentype.js` 2.0.0 cannot fully apply (stage #2089, "A library font never
// makes the server fail"). No binary font is kept in the repository: tests and the tester build it.
//
// The new GSUB has the scripts `DFLT` and `latn`, each with the features `ccmp` and `liga` → lookups
// 0, 1 and 2 (`opentype.js` applies the DFLT `ccmp` to any text of two or more characters, so that
// is what makes the default calls fail):
//   - lookup 0: type 6 format 2 (chaining context by class; coverage `f`, one empty rule set).
//     `opentype.js` throws `substitutionType : 62 … is not yet supported` for it;
//   - lookup 1: type 3 format 1 (alternate substitution, `a` → `a`). Also not supported;
//   - lookup 2: type 4 format 1 (ligature, `ii` → the glyph of `m`). Supported: it must still apply.
// Without the fix, measuring or drawing Latin text with this font throws. With it, the server skips
// lookups 0 and 1 (skip list `{6,2,1}` and `{3,1,1}`) and `ii` measures as `m`.
//
// With `--calt` (stage #2121, decision 14) the font also has lookup 3 (type 1 format 2, `f` → the glyph of `w`) and
// lookup 0 carries one rule, `f` followed by `i` → lookup 3, under the feature `calt` (the features are then `calt` →
// lookup 0, `ccmp` → lookup 1 and `liga` → lookup 2): `fi` measures as `wi` with the chaining context that
// `opentype.js` could not apply, and the ligature `ii` → `m` stays under `liga`. Without the flag the font is #2089's.
//
// With `--rtl` (stage #2448, decision 9) the `cmap` also maps U+05D0 to U+05D9 (Hebrew letters) to the glyphs of `A` to
// `J`, so a test can lay out right-to-left text with a font the repository does not ship; every other mapping stays.
// The `cmap` is rebuilt as one format 4 subtable (shared by its two encoding records). Without the flag the font is
// unchanged.
//
// The table directory is rewritten: tables sorted by tag, offsets aligned to 4, checksums recomputed
// (`head.checkSumAdjustment` too).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
const withCalt = process.argv.includes('--calt', 3);
const withRtl = process.argv.includes('--rtl', 3);
if (out === undefined) {
  process.stderr.write('usage: node gsub-font.mjs <out.ttf>\n');
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

/** The glyph id of a character in the `cmap` (the format 4 subtable). */
function glyphOf(cmap, char) {
  const code = char.codePointAt(0);
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
  throw new Error(`no glyph for ${char} in ${source}`);
}

/** Every BMP mapping of the format 4 subtable of the `cmap`: code point → glyph (the sentinel and the missing glyph left out). */
function cmapEntries(cmap) {
  const entries = new Map();
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
      const start = cmap.readUInt16BE(starts + s * 2);
      const end = cmap.readUInt16BE(ends + s * 2);
      const delta = cmap.readUInt16BE(deltas + s * 2);
      const range = cmap.readUInt16BE(ranges + s * 2);
      for (let code = start; code <= Math.min(end, 0xfffe); code++) {
        const glyph =
          range === 0
            ? (code + delta) & 0xffff
            : cmap.readUInt16BE(ranges + s * 2 + range + (code - start) * 2);
        if (glyph !== 0)
          entries.set(code, range === 0 ? glyph : (glyph + delta) & 0xffff);
      }
    }
    return entries;
  }
  throw new Error('no format 4 subtable in the cmap');
}

/** A `cmap` with one format 4 subtable for `entries`, under the Unicode (0, 3) and Windows (3, 1) records. */
function buildCmap(entries) {
  const codes = [...entries.keys()].sort((a, b) => a - b);
  const segments = [];
  for (const code of codes) {
    const delta = (entries.get(code) - code) & 0xffff;
    const last = segments[segments.length - 1];
    if (last !== undefined && last.end + 1 === code && last.delta === delta)
      last.end = code;
    else segments.push({ start: code, end: code, delta });
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const count = segments.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 2;
  const subtable = u16(
    4,
    16 + count * 8,
    0,
    count * 2,
    searchRange,
    entrySelector,
    count * 2 - searchRange,
    ...segments.map((s) => s.end),
    0,
    ...segments.map((s) => s.start),
    ...segments.map((s) => s.delta),
    ...segments.map(() => 0),
  );
  const header = Buffer.alloc(20);
  header.writeUInt16BE(2, 2);
  [
    [0, 3],
    [3, 1],
  ].forEach(([platform, encoding], n) => {
    header.writeUInt16BE(platform, 4 + n * 8);
    header.writeUInt16BE(encoding, 6 + n * 8);
    header.writeUInt32BE(20, 8 + n * 8);
  });
  return Buffer.concat([header, subtable]);
}

const u16 = (...values) => {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((v, n) => buf.writeUInt16BE(v, n * 2));
  return buf;
};

/**
 * A table whose first bytes are `head` (16-bit fields) followed by `children`; each `null` in `head`
 * is replaced, in order, by the offset (from the table's start) of the next child.
 */
function table(head, children) {
  const size = head.length * 2;
  let at = size;
  const offsets = children.map((child) => {
    const here = at;
    at += child.length;
    return here;
  });
  let next = 0;
  const fields = head.map((value) => (value === null ? offsets[next++] : value));
  return Buffer.concat([u16(...fields), ...children]);
}

function buildGsub(f, a, i, m, w, calt) {
  const coverage = (glyph) => u16(1, 1, glyph);
  const emptyClassDef = u16(2, 0);
  const lookup = (type, subtable) => table([type, 0, 1, null], [subtable]);

  // Type 6 format 2. Without `--calt`: coverage `f`, three empty class definitions, one empty chain class set.
  // With it: class 1 is `f` as the input and `i` as the lookahead, and its rule applies lookup 3 to the first glyph.
  const chaining = calt
    ? table(
        [2, null, null, null, null, 2, 0, null],
        [
          coverage(f),
          emptyClassDef,
          u16(2, 1, f, f, 1),
          u16(2, 1, i, i, 1),
          table([1, null], [u16(0, 1, 1, 1, 1, 0, 3)]),
        ],
      )
    : table(
        [2, null, null, null, null, 1, null],
        [coverage(f), emptyClassDef, emptyClassDef, emptyClassDef, u16(0)],
      );
  const lookups = [
    lookup(6, chaining),
    // Type 3 format 1: `a` has the alternates [`a`].
    lookup(3, table([1, null, 1, null], [coverage(a), u16(1, a)])),
    // Type 4 format 1: `i` `i` → `m`.
    lookup(4, table([1, null, 1, null], [coverage(i), table([1, null], [u16(m, 2, i)])])),
  ];
  // Type 1 format 2: `f` → `w`, reached only through lookup 0's rule.
  if (calt) lookups.push(lookup(1, table([2, null, 1, w], [coverage(f)])));
  const lookupList = table([lookups.length, ...lookups.map(() => null)], lookups);

  // `opentype.js` applied `ccmp` of the DFLT script to any text of two or more characters, whatever
  // features the caller asked for: it is what made the unsupported subtables throw. `liga` is
  // applied only when a call asks for it.
  const feature = (...indexes) => u16(0, indexes.length, ...indexes);
  const tags = calt ? ['calt', 'ccmp', 'liga'] : ['ccmp', 'liga'];
  const features = calt
    ? [feature(0), feature(1), feature(2)]
    : [feature(0, 1, 2), feature(0, 1, 2)];
  const featureList = table(
    [tags.length, ...tags.flatMap((tag) => [...tagWord(tag), null])],
    features,
  );

  const langSys = u16(0, 0xffff, tags.length, ...tags.map((_, n) => n));
  const script = table([null, 0], [langSys]);
  const scriptList = table(
    [2, ...tagWord('DFLT'), null, ...tagWord('latn'), null],
    [script, script],
  );

  return table([1, 0, null, null, null], [scriptList, featureList, lookupList]);
}

/** A four-letter tag as two 16-bit words. */
function tagWord(name) {
  const bytes = Buffer.from(name, 'latin1');
  return [bytes.readUInt16BE(0), bytes.readUInt16BE(2)];
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
const cmap = tables.get('cmap');
tables.set(
  'GSUB',
  buildGsub(
    glyphOf(cmap, 'f'),
    glyphOf(cmap, 'a'),
    glyphOf(cmap, 'i'),
    glyphOf(cmap, 'm'),
    glyphOf(cmap, 'w'),
    withCalt,
  ),
);
if (withRtl) {
  const entries = cmapEntries(cmap);
  for (let n = 0; n < 10; n++)
    entries.set(0x05d0 + n, glyphOf(cmap, String.fromCharCode(0x41 + n)));
  tables.set('cmap', buildCmap(entries));
}
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
