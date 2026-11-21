import { deflateSync } from 'node:zlib';

// Builds a WOFF 1.0 file from an sfnt, for the tests of mcp/image/woff.ts and of the font readers.

interface SfntTable {
  readonly tag: string;
  readonly checksum: number;
  readonly data: Uint8Array;
}

/** The tables of an sfnt, in directory order. */
export function sfntTables(bytes: Uint8Array): { flavor: number; tables: SfntTable[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables: SfntTable[] = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    tables.push({
      tag: String.fromCharCode(...bytes.subarray(at, at + 4)),
      checksum: view.getUint32(at + 4),
      data: bytes.slice(offset, offset + length),
    });
  }
  return { flavor: view.getUint32(0), tables };
}

const padded = (n: number) => (n + 3) & ~3;

export interface WoffOptions {
  /** A table kept uncompressed (`compLength` = `origLength`); a table that does not shrink is stored too. */
  readonly stored?: string;
  /** A table whose declared `origLength` is one byte too long. */
  readonly wrongOrigLength?: string;
}

/** A WOFF 1.0 file made from the sfnt: zlib per table, except the ones stored raw. */
export function makeWoff(sfnt: Uint8Array, options: WoffOptions = {}): Uint8Array {
  const { flavor, tables } = sfntTables(sfnt);
  const bodies = tables.map((t) => {
    const deflated = new Uint8Array(deflateSync(t.data));
    const keep = t.tag === options.stored || deflated.length >= t.data.length;
    return keep ? t.data : deflated;
  });
  let offset = 44 + tables.length * 20;
  const offsets = bodies.map((b) => {
    const at = offset;
    offset += padded(b.length);
    return at;
  });
  const out = new Uint8Array(offset);
  const view = new DataView(out.buffer);
  out.set([0x77, 0x4f, 0x46, 0x46], 0); // wOFF
  view.setUint32(4, flavor);
  view.setUint32(8, offset);
  view.setUint16(12, tables.length);
  tables.forEach((t, i) => {
    const at = 44 + i * 20;
    out.set(new TextEncoder().encode(t.tag), at);
    view.setUint32(at + 4, offsets[i]!);
    view.setUint32(at + 8, bodies[i]!.length);
    view.setUint32(
      at + 12,
      t.tag === options.wrongOrigLength ? t.data.length + 1 : t.data.length,
    );
    view.setUint32(at + 16, t.checksum);
    out.set(bodies[i]!, offsets[i]!);
  });
  return out;
}
