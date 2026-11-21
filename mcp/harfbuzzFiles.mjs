// HarfBuzz (`harfbuzzjs`, WebAssembly) in the MCP server: the one patch that lets its two files go into the
// CommonJS bundle and into Vitest. Shared by the server build (mcp/build.mjs), by the Vite plugin of the tests
// (tests/support/mcpVitePlugins.ts) and by the bundle of tests/tooling/releaseInputs.test.ts.
//
// Two things stop `harfbuzzjs` 1.6.4 from being bundled as it is:
// - `dist/index.mjs` ends with `init(await createHarfBuzz());`, a top-level await, which esbuild refuses with
//   `format: 'cjs'` (even through a dynamic `import()`). The wrapper below turns that line into an exported
//   `initHarfBuzz(moduleArg)` that the server calls once at startup (`initShaper`, mcp/image/harfbuzz.ts).
// - `dist/harfbuzz.js` (the Emscripten glue) reads `import.meta.url`, which is empty in a CommonJS bundle. There it
//   becomes the bundle's own file URL (the glue only needs it to build paths it never opens: the bytes come from
//   `wasmBinary`).

/** The line of `dist/index.mjs` that initializes the module with a top-level await. */
const TOP_LEVEL_AWAIT = 'init(await createHarfBuzz());';

/** The replacement: the same initialization, on demand, with the options the caller passes (`wasmBinary`, `print`). */
const INIT_FUNCTION =
  'export function initHarfBuzz(moduleArg) { return createHarfBuzz(moduleArg).then(init); }';

/**
 * What `import.meta.url` becomes in a CommonJS bundle: the bundle's file URL, computed once at the top of the glue.
 * It cannot be written inline: the glue declares a `var require` of its own inside `createHarfBuzz`, which would shadow
 * the bundle's `require` where `import.meta.url` is read.
 */
const BUNDLE_URL_NAME = 'harfbuzzBundleUrl';
const BUNDLE_URL = `const ${BUNDLE_URL_NAME} = require("url").pathToFileURL(__filename).href;\n`;

/** Matches the two files of the package that are patched (with either path separator). */
export const harfbuzzSourceFilter =
  /node_modules[\\/]harfbuzzjs[\\/]dist[\\/](index\.mjs|harfbuzz\.js)$/;

/** Which of the two files a path is, or `null` (any other file). */
function harfbuzzFileOf(path) {
  const match = harfbuzzSourceFilter.exec(path.replaceAll('\\', '/'));
  return match === null ? null : match[1] === 'index.mjs' ? 'index' : 'glue';
}

/**
 * `dist/index.mjs` with the top-level await replaced by `initHarfBuzz(moduleArg)`.
 * Throws when the line is not there, so a version bump of the package fails the build loudly.
 */
export function patchHarfBuzzWrapper(source) {
  if (!source.includes(TOP_LEVEL_AWAIT)) {
    throw new Error(
      `harfbuzzjs: the line "${TOP_LEVEL_AWAIT}" was not found in dist/index.mjs; update mcp/harfbuzzFiles.mjs for this version.`,
    );
  }
  return source.replace(TOP_LEVEL_AWAIT, INIT_FUNCTION);
}

/** `dist/harfbuzz.js` for a CommonJS bundle: `import.meta.url` becomes the bundle's file URL. */
export function patchHarfBuzzGlue(source) {
  if (!source.includes('import.meta.url')) {
    throw new Error(
      'harfbuzzjs: import.meta.url was not found in dist/harfbuzz.js; update mcp/harfbuzzFiles.mjs for this version.',
    );
  }
  return BUNDLE_URL + source.replaceAll('import.meta.url', BUNDLE_URL_NAME);
}

/**
 * The patched source of a `harfbuzzjs` file, or `null` for any other file. `cjs` is true for the CommonJS bundles
 * (the server and the release inputs) and false for Vitest, which runs the glue as ESM and keeps `import.meta.url`.
 */
export function patchHarfBuzzSource(path, source, { cjs }) {
  const file = harfbuzzFileOf(path);
  if (file === 'index') return patchHarfBuzzWrapper(source);
  if (file === 'glue') return cjs ? patchHarfBuzzGlue(source) : source;
  return null;
}
