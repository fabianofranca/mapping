import { inflateSync } from 'node:zlib';

// WOFF 1.0 (`wOFF`) to a plain sfnt (`.ttf`/`.otf`): HarfBuzz reads only the latter. Each table is stored raw or
// zlib-compressed; the sfnt has the same tables, byte for byte. `wOF2` (Brotli) is not read (#2126).

const WOFF_SIGNATURE = 0x774f4646; // 'wOFF'
const HEADER_BYTES = 44;
const ENTRY_BYTES = 20;
const SFNT_HEADER_BYTES = 12;
const SFNT_ENTRY_BYTES = 16;
/** Ceiling of the sfnt we build: a font of this size is already far beyond a UI font (a declared size is never trusted past it). */
const MAX_SFNT_BYTES = 64 * 1024 * 1024;

interface WoffTable {
  readonly tag: Uint8Array;
  readonly checksum: number;
  readonly data: Uint8Array;
}

const align4 = (n: number): number => (n + 3) & ~3;

/** The bytes of one table, inflated when compressed; `null` when the entry does not fit the file or the size is wrong. */
function readTable(bytes: Uint8Array, view: DataView, at: number): WoffTable | null {
  const offset = view.getUint32(at + 4);
  const compLength = view.getUint32(at + 8);
  const origLength = view.getUint32(at + 12);
  if (compLength > origLength || origLength > MAX_SFNT_BYTES) return null;
  if (offset + compLength > bytes.length) return null;
  const stored = bytes.subarray(offset, offset + compLength);
  let data = stored;
  if (compLength < origLength) {
    try {
      data = inflateSync(stored, { maxOutputLength: origLength });
    } catch {
      return null;
    }
    if (data.length !== origLength) return null;
  }
  return { tag: bytes.subarray(at, at + 4), checksum: view.getUint32(at + 16), data };
}

/** The tables of the WOFF, in the file's order (already sorted by tag), or `null`. */
function readTables(
  bytes: Uint8Array,
  view: DataView,
  count: number,
): WoffTable[] | null {
  const tables: WoffTable[] = [];
  let total = SFNT_HEADER_BYTES + count * SFNT_ENTRY_BYTES;
  for (let i = 0; i < count; i++) {
    const table = readTable(bytes, view, HEADER_BYTES + i * ENTRY_BYTES);
    if (table === null) return null;
    total += align4(table.data.length);
    if (total > MAX_SFNT_BYTES) return null;
    tables.push(table);
  }
  return tables;
}

/** Writes the sfnt header and directory (offsets aligned to 4) and the tables after them. */
function buildSfnt(flavor: number, tables: readonly WoffTable[]): Uint8Array {
  const count = tables.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 16;
  let offset = SFNT_HEADER_BYTES + count * SFNT_ENTRY_BYTES;
  const out = new Uint8Array(
    offset + tables.reduce((sum, table) => sum + align4(table.data.length), 0),
  );
  const view = new DataView(out.buffer);
  view.setUint32(0, flavor);
  view.setUint16(4, count);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, count * 16 - searchRange);
  tables.forEach((table, i) => {
    const at = SFNT_HEADER_BYTES + i * SFNT_ENTRY_BYTES;
    out.set(table.tag, at);
    view.setUint32(at + 4, table.checksum);
    view.setUint32(at + 8, offset);
    view.setUint32(at + 12, table.data.length);
    out.set(table.data, offset);
    offset += align4(table.data.length);
  });
  return out;
}

/** Whether the bytes start with the WOFF 1.0 signature. */
export function isWoff(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) ===
      WOFF_SIGNATURE
  );
}

/**
 * The sfnt inside a WOFF 1.0 file. `null` for anything else (`wOF2`, a plain sfnt, other bytes), for a file
 * whose tables do not fit in it and for a table that does not inflate to its declared `origLength`.
 */
export function woffToSfnt(bytes: Uint8Array): Uint8Array | null {
  if (!isWoff(bytes) || bytes.length < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(12);
  if (count === 0 || HEADER_BYTES + count * ENTRY_BYTES > bytes.length) return null;
  const tables = readTables(bytes, view, count);
  return tables === null ? null : buildSfnt(view.getUint32(4), tables);
}
