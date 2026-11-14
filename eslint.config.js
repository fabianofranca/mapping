import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

// src/model/ also runs on Node (MCP server): it forbids browser-only globals
// (what exists in `globals.browser` and not in Node) and UI/storage dependencies.
const nodeGlobals = { ...globals.node, ...globals.nodeBuiltin };
const browserOnlyGlobals = Object.keys(globals.browser).filter(
  (name) => !(name in nodeGlobals),
);
// Node 22 exposes these names, but they do not behave like the browser's.
const browserStorageGlobals = ['localStorage', 'sessionStorage', 'navigator'];
const restrictedGlobals = [
  ...new Set([...browserOnlyGlobals, ...browserStorageGlobals]),
].map((name) => ({
  name,
  message: 'src/model/ must not depend on browser APIs (see CLAUDE.md).',
}));

// Import groups of src/model/ (the subdirectory block only changes the reach of the relative one).
const modelPackageGroup = {
  group: ['konva', 'konva/*', 'idb', 'jszip', 'preact', 'preact/*', '@preact/*'],
  message: 'src/model/ must not import UI, canvas or storage.',
};
const modelRelativeGroup = (group) => ({
  group: [group],
  message: 'src/model/ may only import files of the model itself.',
});
// mcp/ runs only on Node and does no networking: it only reads and writes local files (docs/ARCHITECTURE.md, "mcp/").
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map(
  (name) => ({ name, message: 'mcp/ does not make network requests.' }),
);
const mcpOnlyFromModel = [
  'ui',
  'canvas',
  'app',
  'storage',
  'store',
  'i18n',
  'theme',
  'utils',
];

// Stage 8 (8.3): a class selector in `querySelector(All)` crosses components (the
// class belongs to another component's CSS); inside the `ref` itself, use `[data-…]` or `[role=…]`.
// It also applies to `closest(...)` (8.7, audit leftover 5): climbing up to another component's
// class is the same invisible contract.
const classSelectorMessage =
  'Class selector crosses components: use a ref or [data-…]/[role=…] inside the ref itself (docs/ARCHITECTURE.md, "Focus and keyboard").';
const classSelectorRules = [
  {
    selector:
      'CallExpression[callee.property.name=/^(querySelector(All)?|closest)$/] > Literal.arguments[value=/\\./]',
    message: classSelectorMessage,
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(querySelector(All)?|closest)$/] > TemplateLiteral.arguments > TemplateElement[value.raw=/\\./]',
    message: classSelectorMessage,
  },
];
// Global DOM query in src/ui and src/app: an invisible contract between components.
const focusSyntaxRules = [
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName)$/]",
    message:
      'Global DOM query: use a ref, returnFocus, buttonRef/triggerRef or a signal (docs/ARCHITECTURE.md, "Focus and keyboard").',
  },
  ...classSelectorRules,
];
// Named exceptions to the global query: the last resort of focus return
// (`data-focus-root`) and the tool window by `data-window` (module function).
const focusGlobalQueryExceptions = ['src/ui/focus.ts', 'src/ui/toolWindowLayout.ts'];

// App directories that do not talk to Konva (src/model/ has its own, stricter rule).
const konvaImportPattern = {
  group: ['konva', 'konva/*'],
  message: 'Konva stays only in src/canvas/ (see CLAUDE.md).',
};
const rawToolWindowPattern = {
  group: ['**/store/toolWindows'],
  importNames: ['showToolWindow', 'hideToolWindow', 'toggleToolWindow'],
  message:
    'Open and close windows through openToolWindow/closeToolWindow/toggleToolWindowFocus (src/ui/toolWindowLayout.ts): they save and restore focus.',
};
const konvaFreeDirs = ['ui', 'app', 'store', 'storage', 'i18n', 'theme', 'utils'];

// Only the session (src/store/session.ts) reads and writes the mapping.json of an open project: the
// external-change check (revision and content) depends on every access going through it
// (phase 8.1; see docs/ARCHITECTURE.md, "Session and saving"). The exceptions: `loadProject.ts`
// (open and reload) and, in the controller, the existence checks and the folder creation.
// The selectors live in named constants because `no-restricted-syntax` of a later block
// REPLACES the earlier one in the files they share: another set for `src/ui/**` or
// `src/app/**` (e.g. the focus one, phase 8.3, or `imageCreationSyntaxRules`, decision 14 of
// remote images, which applies to all of `src/**` except the exceptions) must be merged into the same
// block (`[...sessionStorageSyntaxRules, ...imageCreationSyntaxRules, ...others]`). `tests/tooling/sessionStorageLint.test.ts`
// proves that the rule catches the old pattern in `src/app/` and `src/ui/`.
const mappingCall = (method) =>
  `CallExpression[callee.type='MemberExpression'][callee.property.name='${method}']`;
const onlyInFunction = (method, kind, name) =>
  `${mappingCall(method)}:not(${kind}[id.name='${name}'] CallExpression)`;
export const sessionStorageSyntaxRules = ['loadMapping', 'saveMapping'].map((method) => ({
  selector: mappingCall(method),
  message: `Only the session (src/store/session.ts) reads and writes the mapping.json of an open project; use session.sync()/flush() (see docs/ARCHITECTURE.md).`,
}));
const sessionFileSyntaxRules = [
  {
    selector: onlyInFunction('loadMapping', 'VariableDeclarator', 'readMapping'),
    message:
      'In session.ts, storage.loadMapping() only inside readMapping (the single read point).',
  },
  {
    selector: onlyInFunction('saveMapping', 'VariableDeclarator', 'writeProject'),
    message:
      'In session.ts, storage.saveMapping() only inside writeProject (the single write point).',
  },
];
// Phase 8.4: the controller checks whether the folder has a project through `hasMappingFile` (storage/folder.ts),
// without `loadMapping`; it only writes the mapping.json when creating the project in a folder.
const controllerFileSyntaxRules = [
  {
    selector: onlyInFunction('saveMapping', 'FunctionDeclaration', 'createFolderProject'),
    message:
      'In the controller, saveMapping() only when creating the project in a folder (createFolderProject); the rest belongs to the session.',
  },
  {
    selector: mappingCall('loadMapping'),
    message:
      'In the controller, use hasMappingFile (storage/folder.ts) to check the folder; reading the mapping.json belongs to the session and loadProject.',
  },
];

// Phase 8.4: browser storage only goes through `utils/safeStorage.ts` (try/catch and the
// channel key) and `storage/local.ts` (the IndexedDB databases). `src/model/` is left out of
// this block: its architecture rule already forbids these names (and more), and a second
// `no-restricted-globals` on the same files would replace that one.
// `tests/tooling/storageGlobalsLint.test.ts` proves both rules.
const storageGlobalsMessage =
  'Use readSetting/writeSetting (utils/safeStorage.ts) or storage/local.ts: direct access to browser storage can throw (private mode, file://).';
const storageGlobalNames = ['localStorage', 'sessionStorage', 'indexedDB'];
const storageGlobals = storageGlobalNames.map((name) => ({
  name,
  message: storageGlobalsMessage,
}));
const storageGlobalProperties = ['window', 'globalThis', 'self'].flatMap((object) =>
  storageGlobalNames.map((property) => ({
    object,
    property,
    message: storageGlobalsMessage,
  })),
);
const storageGlobalExceptions = ['src/utils/safeStorage.ts', 'src/storage/local.ts'];

// A single image creator (docs/ARCHITECTURE.md, "Remote images: policy, consent and loader"). No code builds an
// image URL outside the URL policy and consent; only the loader
// (`src/canvas/components/imageLoader.ts`) and `src/storage/**` (project images, via `blob:`)
// may create `Image`, an `img` element or assign `src`. Applies to `src/**` and `viewer/**`.
const imageCreationMessage =
  'No code builds an image URL outside the URL policy and consent: use the loader (src/canvas/components/imageLoader.ts); project images live in src/storage/ (docs/ARCHITECTURE.md, "Remote images").';
const imageCreationSyntaxRules = [
  { selector: "NewExpression[callee.name='Image']", message: imageCreationMessage },
  {
    selector:
      'CallExpression[callee.property.name=/^createElement(NS)?$/] > Literal.arguments[value=/^(img|image)$/i]',
    message: imageCreationMessage,
  },
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(src|srcset)$/]",
    message: imageCreationMessage,
  },
  {
    selector:
      "AssignmentExpression[left.type='MemberExpression'][left.computed=true][left.property.value=/^(src|srcset)$/]",
    message: imageCreationMessage,
  },
  {
    selector:
      "CallExpression[callee.property.name='setAttribute'] > Literal.arguments:first-child[value=/^(src|srcset)$/i]",
    message: imageCreationMessage,
  },
  {
    selector: "CallExpression[callee.property.name='fromURL']",
    message: imageCreationMessage,
  },
];
// Files that may create images (each one gets only the session rules, not these).
const imageCreationExceptions = [
  'src/canvas/components/imageLoader.ts',
  'src/storage/**',
];

// Import restrictions of mcp/ (see the "MCP server" block below).
const mcpImportPatterns = [
  {
    group: mcpOnlyFromModel.flatMap((dir) => [`**/src/${dir}`, `**/src/${dir}/**`]),
    message: 'mcp/ may only import src/model/ (docs/ARCHITECTURE.md, "mcp/").',
  },
  {
    group: ['konva', 'konva/*', 'idb', 'jszip', 'preact', 'preact/*', '@preact/*'],
    message: 'mcp/ must not import UI, canvas or storage.',
  },
  {
    group: [
      'node:http',
      'node:https',
      'node:http2',
      'node:net',
      'node:tls',
      'node:dns',
      'node:dgram',
    ],
    message: 'mcp/ does not make network requests.',
  },
];
// The same patterns without the network group (only `mcp/imageServer.ts`, below).
const mcpImportPatternsWithoutNetwork = mcpImportPatterns.filter(
  (pattern) => pattern.message !== 'mcp/ does not make network requests.',
);

// Phase 8.5 (M8): only three mcp/ modules write to disk (`paths.ts`, `createProject.ts`,
// `proposalStore.ts`); in the others, the `node:fs` write functions cannot be imported.
// The test `tests/mcp/staticGuards.test.ts` is the full rule (it also catches `fs.promises.x`).
const fsWriters = [
  'writeFile',
  'appendFile',
  'rename',
  'link',
  'symlink',
  'mkdir',
  'mkdtemp',
  'rm',
  'rmdir',
  'unlink',
  'copyFile',
  'cp',
  'truncate',
  'open',
  'createWriteStream',
];
const mcpWriterImports = ['node:fs', 'node:fs/promises', 'fs', 'fs/promises'].map(
  (name) => ({
    name,
    importNames: [...fsWriters, ...fsWriters.map((fn) => `${fn}Sync`)],
    message:
      'mcp/ only writes in paths.ts, createProject.ts, proposalStore.ts and threadStore.ts (the mapping.json belongs to the app).',
  }),
);

// signature/ (signature extractor, stage #1079 S3) runs only on Node and does no networking: it reads the
// code file it is given and only writes the `--out` (module `cli.ts`). From the app, only `src/model/`.
const signatureNetworkGlobals = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
].map((name) => ({ name, message: 'signature/ does not make network requests.' }));
const signatureImportPatterns = [
  {
    group: mcpOnlyFromModel.flatMap((dir) => [`**/src/${dir}`, `**/src/${dir}/**`]),
    message: 'signature/ may only import src/model/.',
  },
  {
    group: ['konva', 'konva/*', 'idb', 'jszip', 'preact', 'preact/*', '@preact/*'],
    message: 'signature/ must not import UI, canvas or storage.',
  },
  {
    group: [
      'node:http',
      'node:https',
      'node:http2',
      'node:net',
      'node:tls',
      'node:dns',
      'node:dgram',
      'node:child_process',
      'node:worker_threads',
      'node:cluster',
    ],
    message: 'signature/ does not make network requests or spawn processes.',
  },
];
const signatureWriterImports = mcpWriterImports.map((entry) => ({
  ...entry,
  message: 'signature/ only writes in cli.ts (the `--out`).',
}));

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-mcp',
      'dist-viewer',
      'dist-viewer-demo',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      // Local Claude Code worktrees (`.claude/worktrees/`): copies of the repository.
      '.claude/worktrees',
      // Mapping workspace (project data and pipeline scripts, outside the app's code).
      'mappings-workspace',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  // Only the two classic rules; the React Compiler rules (preset
  // `recommended` of v7) do not apply to Preact.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Konva stays isolated in src/canvas/ (CanvasController and CanvasHost; see CLAUDE.md).
  {
    files: [`src/{${konvaFreeDirs.join(',')}}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', { patterns: [konvaImportPattern] }],
    },
  },
  // Stage #323 (FC1): whoever opens, closes or toggles a tool window in the UI goes through
  // `src/ui/toolWindowLayout.ts` (saves and restores focus). The raw store commands only
  // go in there. This block replaces the previous one in src/ui and src/app, so it repeats Konva.
  {
    files: ['src/{ui,app}/**/*.{ts,tsx}'],
    ignores: ['src/ui/toolWindowLayout.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [konvaImportPattern, rawToolWindowPattern] },
      ],
    },
  },
  // Only the session reads and writes the mapping.json (phase 8.1) and only the loader creates images (decision 14
  // of remote images); constants defined above. The files allowed to create images
  // (`imageCreationExceptions`) get only the session rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/store/session.ts',
      'src/storage/loadProject.ts',
      'src/app/controller.ts',
      ...imageCreationExceptions,
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionStorageSyntaxRules,
        ...imageCreationSyntaxRules,
      ],
    },
  },
  {
    files: ['src/canvas/components/imageLoader.ts', 'src/storage/**/*.{ts,tsx}'],
    ignores: ['src/storage/loadProject.ts'],
    rules: { 'no-restricted-syntax': ['error', ...sessionStorageSyntaxRules] },
  },
  {
    files: ['src/store/session.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionFileSyntaxRules,
        ...imageCreationSyntaxRules,
      ],
    },
  },
  {
    files: ['src/app/controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...controllerFileSyntaxRules,
        ...imageCreationSyntaxRules,
      ],
    },
  },
  // The viewer does not create images from outside either (without the session rules, which belong to the app).
  {
    files: ['viewer/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...imageCreationSyntaxRules] },
  },
  // Browser storage (phase 8.4; constants defined above).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/model/**', ...storageGlobalExceptions],
    rules: {
      'no-restricted-globals': ['error', ...storageGlobals],
      'no-restricted-properties': ['error', ...storageGlobalProperties],
    },
  },
  // Phase 8.4: signal of the next god-module (the controller had 713 lines and eight
  // responsibilities). A warning, not an error: splitting is a design decision, not a lint one.
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/model/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-imports': [
        'error',
        {
          patterns: [modelPackageGroup, modelRelativeGroup('../*')],
        },
      ],
    },
  },
  // src/model/components/ (component engine, phase B1): everything from the previous block still applies;
  // only the reach of the relative import changes, because from here `../x` is still the model.
  {
    files: ['src/model/*/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [modelPackageGroup, modelRelativeGroup('../../*')],
        },
      ],
    },
  },
  // MCP server: pure Node. From the app it may only import `src/model/`.
  {
    files: ['mcp/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals, ...networkGlobals],
      'no-restricted-imports': [
        'error',
        { patterns: mcpImportPatterns, paths: mcpWriterImports },
      ],
    },
  },
  // Signature extractor: pure Node; only `cli.ts` and `build.mjs` write to disk.
  {
    files: ['signature/**/*.{ts,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-globals': [
        'error',
        ...restrictedGlobals,
        ...signatureNetworkGlobals,
      ],
      'no-restricted-imports': [
        'error',
        { patterns: signatureImportPatterns, paths: signatureWriterImports },
      ],
    },
  },
  {
    files: ['signature/cli.ts', 'signature/build.mjs'],
    rules: {
      'no-restricted-imports': ['error', { patterns: signatureImportPatterns }],
    },
  },
  { files: ['tests/signature/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['tests/mcp/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['pwa/**/*.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  // Phase 8.5: the disk hook of the MCP tests (`tests/mcp/fsHooks.mjs`) runs on Node.
  { files: ['tests/mcp/**/*.mjs'], languageOptions: { globals: globals.node } },
  // MCP stdio client of the tester agent (docs/TESTING.md, appendix A): runs on Node.
  { files: ['scripts/testing/**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['scripts/perf/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Conversation watcher of the example workspace (stage #645, CM6): runs on Node.
  { files: ['examples/workspace/*.mjs'], languageOptions: { globals: globals.node } },
  // Phase 8.5: the three server modules that write, and the build script (`build.mjs`, which generates
  // `dist-mcp/` and is not part of the bundle). In the flat config, this block replaces the rule of the
  // "MCP server" block in those files: it repeats the old restrictions (`mcpImportPatterns`) and only
  // removes the `node:fs` write ones.
  {
    files: [
      'mcp/paths.ts',
      'mcp/createProject.ts',
      'mcp/proposalStore.ts',
      'mcp/threadStore.ts',
      'mcp/build.mjs',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: mcpImportPatterns }],
    },
  },
  // `mcp/imageServer.ts` listens only on 127.0.0.1 to deliver the tool images to the client's
  // chat; no outgoing requests. That is why only it may import `node:http`.
  {
    files: ['mcp/imageServer.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: mcpImportPatternsWithoutNetwork, paths: mcpWriterImports },
      ],
    },
  },
  // Test-first stage (TP2): cyclomatic complexity per function, up to 10. The legacy above
  // that is in `eslint-suppressions.json` (the per-file count only goes down; reducing a function
  // requires `npx eslint --prune-suppressions` in the same PR). Out: viewer/, scripts/, pwa/ and tests/.
  // `tests/tooling/complexityLint.test.ts` proves the rule.
  {
    files: ['src/**/*.{ts,tsx}', 'mcp/**/*.ts', 'signature/**/*.ts'],
    rules: { complexity: ['error', 10] },
  },
  prettier,
  // Stage 8 (8.3), focus and keyboard: no component finds another through the global DOM or through the
  // class of another component (`docs/ARCHITECTURE.md`, "Focus and keyboard"). In the flat config the
  // last block wins per rule, so these blocks repeat the session selectors (8.1)
  // for the same files: `sessionStorageSyntaxRules` in src/ui and src/app and
  // `controllerFileSyntaxRules` in the controller (8.1 exception), plus `imageCreationSyntaxRules`
  // (decision 14 of remote images) in all of them. Another phase that uses
  // `no-restricted-syntax` in these files merges its selectors here.
  {
    files: ['src/{ui,app}/**/*.{ts,tsx}'],
    ignores: [...focusGlobalQueryExceptions, 'src/app/controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionStorageSyntaxRules,
        ...imageCreationSyntaxRules,
        ...focusSyntaxRules,
      ],
    },
  },
  {
    files: focusGlobalQueryExceptions,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...sessionStorageSyntaxRules,
        ...imageCreationSyntaxRules,
        ...classSelectorRules,
      ],
    },
  },
  {
    files: ['src/app/controller.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...controllerFileSyntaxRules,
        ...imageCreationSyntaxRules,
        ...focusSyntaxRules,
      ],
    },
  },
);
