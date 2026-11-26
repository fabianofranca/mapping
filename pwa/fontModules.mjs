// The drawing font embedded in the app and the viewer (stage #2825, decision 3): the four TTF files of `mcp/fonts/`
// (the single source, also embedded in the server) wrapped as WOFF 1.0 at build time and delivered as base64 text
// by the modules `drawing-font:sans`, `drawing-font:sans-bold`, `drawing-font:mono` and `drawing-font:mono-bold`.
// `src/storage/drawingFonts.ts` decodes the text with `atob` into an ArrayBuffer: never a URL (the CSP allows none).
// One module serves Vite (`drawingFontModules`, the app build and the Vitest projects) and esbuild
// (`drawingFontEsbuild`, the viewer build).
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { deflateSync } from 'node:zlib';

const MODULES = {
  'drawing-font:sans': '../mcp/fonts/MappingSans-Regular.ttf',
  'drawing-font:sans-bold': '../mcp/fonts/MappingSans-Bold.ttf',
  'drawing-font:mono': '../mcp/fonts/MappingMono-Regular.ttf',
  'drawing-font:mono-bold': '../mcp/fonts/MappingMono-Bold.ttf',
};

/** The module ids this plugin serves, with the TTF each one wraps (relative to this folder). */
export const drawingFontFiles = MODULES;

const SFNT_HEADER = 12;
const SFNT_RECORD = 16;
const WOFF_HEADER = 44;
const WOFF_RECORD = 20;
const pad4 = (n) => (n + 3) & ~3;

/** The tables of a TrueType file (`tag`, `checksum`, `data`), in the file's order (ascending by tag). */
function sfntTables(ttf) {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const count = view.getUint16(4);
  const tables = [];
  for (let i = 0; i < count; i++) {
    const at = SFNT_HEADER + i * SFNT_RECORD;
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    tables.push({
      tag: ttf.subarray(at, at + 4),
      checksum: view.getUint32(at + 4),
      data: ttf.subarray(offset, offset + length),
    });
  }
  return { flavor: view.getUint32(0), tables };
}

/** Compresses a table (zlib), or keeps it as is when that is not smaller (the WOFF 1.0 rule). */
function packed(data) {
  const deflated = deflateSync(data, { level: 9 });
  return deflated.length < data.length ? deflated : data;
}

/** Wraps a TrueType file as WOFF 1.0: each table zlib-compressed, no metadata and no private data. */
export function ttfToWoff(ttf) {
  const { flavor, tables } = sfntTables(ttf);
  const stored = tables.map((table) => ({ ...table, body: packed(table.data) }));
  const dataStart = WOFF_HEADER + WOFF_RECORD * stored.length;
  const length = stored.reduce((sum, table) => sum + pad4(table.body.length), dataStart);
  const sfntSize = stored.reduce(
    (sum, table) => sum + pad4(table.data.length),
    SFNT_HEADER + SFNT_RECORD * stored.length,
  );
  const out = Buffer.alloc(length);
  out.write('wOFF', 0, 'latin1');
  out.writeUInt32BE(flavor, 4);
  out.writeUInt32BE(length, 8);
  out.writeUInt16BE(stored.length, 12);
  out.writeUInt32BE(sfntSize, 16);
  let offset = dataStart;
  stored.forEach((table, i) => {
    const at = WOFF_HEADER + i * WOFF_RECORD;
    Buffer.from(table.tag).copy(out, at);
    out.writeUInt32BE(offset, at + 4);
    out.writeUInt32BE(table.body.length, at + 8);
    out.writeUInt32BE(table.data.length, at + 12);
    out.writeUInt32BE(table.checksum, at + 16);
    Buffer.from(table.body).copy(out, offset);
    offset += pad4(table.body.length);
  });
  return out;
}

/** The source of a module: the WOFF of its TTF as a base64 string. */
export function drawingFontSource(id) {
  const file = MODULES[id];
  if (file === undefined) throw new Error(`unknown drawing font: ${id}`);
  const ttf = readFileSync(new URL(file, import.meta.url));
  const woff = ttfToWoff(new Uint8Array(ttf.buffer, ttf.byteOffset, ttf.byteLength));
  return `export default ${JSON.stringify(woff.toString('base64'))};`;
}

/** Vite plugin: `import base64 from 'drawing-font:sans'`. */
export function drawingFontModules() {
  const prefix = '\0';
  return {
    name: 'drawing-font-modules',
    resolveId: (id) => (id in MODULES ? prefix + id : null),
    load: (id) =>
      id.startsWith(prefix) && id.slice(1) in MODULES
        ? drawingFontSource(id.slice(1))
        : null,
  };
}

/** esbuild plugin with the same modules (the viewer build). */
export const drawingFontEsbuild = {
  name: 'drawing-font-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^drawing-font:/ }, (args) =>
      args.path in MODULES
        ? { path: args.path, namespace: 'drawing-font' }
        : { errors: [{ text: `unknown drawing font: ${args.path}` }] },
    );
    esbuild.onLoad({ filter: /.*/, namespace: 'drawing-font' }, (args) => ({
      contents: drawingFontSource(args.path),
      loader: 'js',
    }));
  },
};
