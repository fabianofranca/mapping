// Generates dist-mcp/mapping-mcp.js: a single file, with the dependencies embedded.
// CommonJS on purpose: the `.js` runs with `node` in any repository, unless
// it declares `"type": "module"` (in that case, put a package.json `{"type":"commonjs"}` in tools/).
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { fontFiles } from './fontFiles.mjs';
import { wasmFiles } from './wasmFiles.mjs';

// `import bytes from 'wasm:<codec>'` embeds the bytes of the image codec's WebAssembly module
// (@jsquash). The packages have a `.d.ts` next to each `.wasm`, so the import goes through this
// virtual name (typed in mcp/image/wasm.d.ts).
const require = createRequire(import.meta.url);
const wasmModules = {
  name: 'wasm-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^wasm:/ }, (args) => {
      const file = wasmFiles[args.path];
      if (!file)
        return { errors: [{ text: `unknown WebAssembly module: ${args.path}` }] };
      return { path: require.resolve(file), namespace: 'wasm-bytes' };
    });
    esbuild.onLoad({ filter: /.*/, namespace: 'wasm-bytes' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
      watchFiles: [args.path],
    }));
  },
};

// `import bytes from 'font:sans'` embeds the bytes of the free TTF (mcp/fonts/), like the wasm ones.
const fontModules = {
  name: 'font-modules',
  setup(esbuild) {
    esbuild.onResolve({ filter: /^font:/ }, (args) => {
      const file = fontFiles[args.path];
      if (!file) return { errors: [{ text: `unknown font: ${args.path}` }] };
      return { path: resolve(import.meta.dirname, file), namespace: 'font-bytes' };
    });
    esbuild.onLoad({ filter: /.*/, namespace: 'font-bytes' }, async (args) => ({
      contents: await readFile(args.path),
      loader: 'binary',
      watchFiles: [args.path],
    }));
  },
};

// `import text from './file.md?raw'` embeds the file's text (the documentation served as a resource).
const rawText = {
  name: 'raw-text',
  setup(esbuild) {
    esbuild.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    esbuild.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
      watchFiles: [args.path],
    }));
  },
};

// Suffix of the publishing channel (PR snapshot or release candidate), set by the workflow
// `mcp-prerelease.yml`; empty on the stable one. Becomes `BUILD_VERSION` in mcp/version.ts.
const suffix = process.env.MCP_BUILD_SUFFIX ?? '';
if (suffix !== '' && !/^-(snapshot\.pr\d+\+[0-9a-f]{7,}|rc\.\d+)$/.test(suffix)) {
  throw new Error(
    `invalid MCP_BUILD_SUFFIX: "${suffix}" (expected empty, "-rc.<n>" or "-snapshot.pr<N>+<sha>").`,
  );
}

const result = await build({
  entryPoints: ['mcp/main.ts'],
  plugins: [rawText, wasmModules, fontModules],
  // The minified version of opentype.js (245 kB instead of 495 kB): the server's limit is +500 kB.
  alias: { 'opentype.js': 'opentype.js/dist/opentype.min.mjs' },
  outfile: 'dist-mcp/mapping-mcp.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // The legal comments that the dependencies already carry go to the end of the file; the notices
  // of the ones that do not (most of them) are appended below, from the LICENSE files.
  legalComments: 'eof',
  metafile: true,
  banner: { js: '#!/usr/bin/env node' },
  define: { __MCP_BUILD_SUFFIX__: JSON.stringify(suffix) },
  logLevel: 'info',
});

/** Folder of each `node_modules` package that went into the bundle (scoped ones included). */
function bundledPackages(inputs) {
  const dirs = new Set();
  for (const input of Object.keys(inputs)) {
    // The plugins' files carry the namespace name in front (`wasm-bytes:<path>`).
    const match = /^(?:[a-z-]+:)?(.*?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (match) dirs.add(resolve(match[1]));
  }
  return [...dirs].sort();
}

/** License texts of a package: `LICENSE*` at the root and the codecs' `LICENSE.codec.md`. */
async function licenseTexts(dir) {
  const names = (await readdir(dir)).filter((n) => /^licen[cs]e(\.|$)/i.test(n)).sort();
  const files = names.map((n) => join(dir, n));
  if ((await readdir(dir)).includes('codec')) {
    files.push(join(dir, 'codec', 'LICENSE.codec.md'));
  }
  const texts = [];
  for (const file of files) {
    try {
      texts.push((await readFile(file, 'utf8')).trim());
    } catch {
      // Without this file (only the `codec` folder exists): the package keeps the ones that exist.
    }
  }
  return texts;
}

// The license notices (Apache-2.0, BSD, MIT) of the embedded packages go at the end of the bundle.
const notices = [];
for (const dir of bundledPackages(result.metafile.inputs)) {
  const name = dir.slice(dir.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const texts = await licenseTexts(dir);
  if (texts.length === 0) continue;
  notices.push(`== ${name} ==\n${texts.join('\n\n')}`);
}
if (notices.length > 0) {
  const body = `THIRD-PARTY NOTICES\n\n${notices.join('\n\n')}`.replaceAll('*/', '* /');
  await appendFile('dist-mcp/mapping-mcp.js', `\n/*!\n${body}\n*/\n`);
}

// This repository declares "type": "module": without this, `node` would read the bundle as ESM.
await writeFile('dist-mcp/package.json', '{ "type": "commonjs" }\n');
