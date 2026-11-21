// MCP release inputs (stage #920, decision 6): the files whose change changes what goes
// into `mapping-mcp.js` and into the workspace files published with it. The `epic` job of `ci.yml`
// uses the list to require a new MCP version. A test (`tests/tooling/releaseInputs.test.ts`)
// runs esbuild with `metafile` and fails if anything bundled is left out of the list.
// Node only, no dependencies. Ending in `/` = a whole folder; no trailing `/` = a file.
import { WORKSPACE_SOURCES } from './workspaceAssets.mjs';

export const RELEASE_INPUTS = [
  // Server (includes the build, the TTF fonts and the wasm list).
  'mcp/',
  // Pure model, the only part of `src/` the bundle imports.
  'src/model/',
  // Signature extractor: the `mapping-signature.mjs` bundle goes in the Release, next to the server.
  'signature/',
  // Documentation embedded by `?raw` (server resources and the agent guide).
  'docs/AGENT-GUIDE.md',
  'docs/COMMENT-FORMAT.md',
  'docs/COMPONENT-FORMAT.md',
  'docs/FORMAT.md',
  'docs/PLUGIN-FORMAT.md',
  'docs/SIGNATURE-FORMAT.md',
  'docs/SPEC-FORMAT.md',
  // Embedded notes library.
  'libraries/notas/',
  // Sources of the workspace files: the list is that of `workspaceAssets.mjs`, with no copy here.
  ...WORKSPACE_SOURCES,
];

/** Is the file (path relative to the root, with `/`) a release input? */
export function isReleaseInput(path) {
  return RELEASE_INPUTS.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );
}

/** Of the given paths, those that are release inputs, in the same order. */
export function releaseInputsIn(paths) {
  return paths.filter(isReleaseInput);
}
