# CLAUDE.md

## Project

Mapping: a web app to mark rectangular areas on images, organize them into layers and annotate them with key-value pairs, saving everything in a `mapping.json` next to the images.

**Before any task of a stage, read its GitHub issue and [`docs/PROCESS.md`](docs/PROCESS.md)** (label `ready` or `in-progress`, with the phase sub-issues and the comments; see "Issue planning" in `docs/PROCESS.md`). Work on **one phase at a time**, in order, and tick the finished checkboxes in the phase sub-issue. The current reference is in `docs/` (`ARCHITECTURE.md`, `FORMAT.md`, `SPEC-FORMAT.md`, `COMMENT-FORMAT.md`, `MCP.md`, `AGENT-GUIDE.md`, `DESIGN-SYSTEM.md`); the plan of the finished stages is in the closed issues with the `in-progress` label (what came before them is in the git history). The manual test scripts and the report template are in `docs/TESTING.md`; the prompt of the cloud tester (a Claude Code session without the owner) is in `docs/TESTING-NUVEM.md`.

Claude Code skills live in `.claude/skills/`: **`spec-author`** writes and validates specializations (`docs/SPEC-FORMAT.md`); the prompt that invokes it only specifies the origin, the `id`, the `formatVersion` and the platforms (template at the end of the skill itself). **`detalhar-backlog`** coordinates Opus subagents (the `Agent` tool, at high or medium effort by the skill's criteria, no manual prompt) that detail as `ready` stages every `roadmap` and `bug` that is not `ready` yet: first it proposes merging issues into a single epic, and the questions reach the owner through the question picker (`docs/FLOW.md`). **`implementar-fila`** coordinates the sequential implementation of the `ready` ones (order by `**Depende de:**`), with phases, tester, fixes until the ❌ are zero and the "Fila de desenvolvimento" panel; the merge of each epic waits for the owner, unless `mesclar=auto` is written by them in the call (`docs/FLOW.md`). To use `spec-author` in the repository of the code being mapped, copy the folder to its `.claude/skills/` or to `~/.claude/skills/`. `examples/workspace/` is the skeleton of a central folder of mappings (server, roots, skill and `AGENTS.md` for any MCP client). What each example shows and how to open it is in `examples/README.md`. The **interactive guide** (`public/guia/`, generated) and the **example project** (`examples/exemplo-completo/` and the zip) come from a single source; see `docs/GUIDE.md`. `viewer/` is the embeddable viewer (package `mapping-viewer`), with the React demo in `viewer/demo/`; structure and commands in `viewer/README.md`.

## Stack

- Vite + TypeScript (strict) + Preact + @preact/signals
- Konva.js (canvas), JSZip (zip), zod (schema validation), idb (IndexedDB)
- vite-plugin-singlefile: the build produces **a single, self-contained `dist/index.html`**
- Vitest for tests
- Deploy: GitHub Pages via GitHub Actions

## Commands

```bash
npm run dev       # development server
npm run build     # generates dist/index.html
npm test          # vitest (model, store, storage, canvas and components)
npm run test:coverage # vitest with a coverage report (coverage/); skips the performance budgets
npm run test:durations # regenerates tests/support/durations.json (per-file times that balance the 4 CI shards; runs the suite with coverage)
npm run test:perf # only the performance budgets (no coverage; CI runs it separately)
npm run test:scale # growth tests (n and 4n markings, ratio < 6×), outside npm test; runs in CI after test:perf
npm run perf:canvas # measures the canvas in a real Chromium against dist/index.html (2,000 and 5,000 markings; frames of pan, zoom, edit, drag and open; table on stdout; options `--setas <n>`, `--sem-setas`, `--componentes` and `--vezes <k>` (median of k runs)); outside CI; locally: npm run build and PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>
npm run test:e2e  # Playwright against dist/index.html; runs in CI (locally: npm run build and PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>)
npm run build:mcp # generates dist-mcp/mapping-mcp.js (MCP server, stage 3a)
npm run dev:viewer # demo of the embeddable viewer in a React host (viewer/demo)
npm run build:viewer # generates dist-viewer/ (mapping-viewer.js, mapping-viewer-react.js and types/)
npm run build:example # generates examples/exemplo-completo.zip and materializes examples/exemplo-completo/specs/ from the sources (zip checked by a test)
npm run build:guia # generates public/guia/index.html (the interactive guide; `npm run build` already runs it; checked by a test)
npm run lint      # eslint + prettier --check
npm run lint:ci   # the same lint with a cache in .cache/ (only CI uses it)
npm run typecheck # tsc --noEmit (app and mcp/); types are only checked here: `build` and `build:mcp` do not run `tsc`
```

Before finishing any task: `npm run lint && npm run typecheck && npm test && npm run build` must pass.

## Architecture rules

- `src/model/` holds only pure, immutable functions, without DOM. All business rules live here and are tested.
- **`src/model/` must not depend on browser APIs** (DOM, `window`, `document`, IndexedDB, File System Access, `createImageBitmap`, `Image`, canvas, `localStorage`). It will be reused by an MCP server in Node in stage 3. Use only APIs available in both the browser and Node (e.g. `crypto.randomUUID()`). Everything that depends on the browser (reading image dimensions, EXIF, bitmaps) lives in `src/storage/` or `src/canvas/` and hands ready data to `model/`. The rule is enforced automatically: ESLint (`no-restricted-globals`/`no-restricted-imports` in `src/model/**`) and the `model` project of Vitest, which runs `tests/model/` with `environment: 'node'`.
- Every project mutation goes through a store action. Never change the state directly in a component.
- The project state (JSON + undo) is separate from the UI state (selection, visibility, mode, viewport).
- Lookups by id and groupings of the project use `projectIndex(p)` (`src/model/projectIndex.ts`, memoized by project version), never `find`/`filter` inside loops. The derived editor state (visible layers, indicators, visibility, pending items, list) lives in `src/store/derived.ts` and is read by canvas, panel and list, without recomputing.
- **Spaces, containment and arrows:** a marking lives in the container's space (its pixels) or in the canvas's (`containerId` null); who contains whom is decided only by geometry, by `settleHierarchy` (`src/model/hierarchySettle.ts`), at the end of every model operation that changes geometry (gesture previews use `settle: false`; the gesture ends by repeating the operation with `settle: true`, in one undo entry). The settle at the end of the operation (`settleFrom`) is clipped to what it touched, with the same result as the full settle (`settleHierarchy` without `before`, which still settles everything). The parent is never chosen by hand and no intersection is computed outside the model. The arrow (`arrows`) is a marking that points, outside the containment tree; the floating one (`floating`) too.
- `mapping.json` is only written by the session (`src/store/session.ts`): it checks the file (`revision` and content) before writing and writes `revision + 1`; no other code writes to the project storage. External changes (MCP, text editor) become a reload or the "Project changed outside the app" dialog (`docs/ARCHITECTURE.md`).
- The canvas draws at most once per frame (`requestAnimationFrame`); pan and zoom do not recompute data that depends only on the project.
- A gesture (drag/resize) produces **one** undo history entry.
- Konva is isolated in `src/canvas/` (imperative `CanvasController`). Preact components do not import Konva, except `CanvasHost`. Do not use `react-konva`.
- The coordinates of the markings are **always** in pixels of the original image. Screen/canvas conversions live only in `src/canvas/`.
- No hardcoded UI string: everything goes through `t()` with keys in `src/i18n/pt-BR.ts` and `src/i18n/en-US.ts`.
- No fixed design value (color, spacing, radius, font, opacity, duration, z-index) outside the tokens: use `var(--…)` from the tokens of `src/theme/tokens.ts` (single source, light and dark themes). A control border uses `--color-border-control`; `--color-border` is only a divider. The canvas reads the theme's tokens. A test (`tests/theme/tokenLiterals.test.ts`) looks for literals in the CSS.
- Form controls and buttons come from `src/ui/controls/` (`Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`) and icons from `<Icon name="…" />` (`src/ui/icons.tsx`); do not create a loose button, field or icon. Height, radius and icon come from the `--control-*` roles (28px/16px).

## Runtime environment restrictions

- The `index.html` must work on **`file://` in desktop Chrome/Edge** and hosted on **GitHub Pages**:
  - no external module imports at runtime and no network requests;
  - the service worker is only registered when `location.protocol === 'https:'`;
  - detect features at runtime (`showDirectoryPicker`, IndexedDB, `navigator.canShare`) and degrade gracefully;
  - the `dist/index.html` carries a **CSP** in a `<meta>` generated at build time (`pwa/csp.ts`; hashes of the embedded blocks, no `'unsafe-inline'`/`'unsafe-eval'`, `connect-src 'none'`). Hence: no `style=""` or inline handlers in the HTML, no `eval`/`new Function`, no `setAttribute('style')`, no `fetch`/XHR/WebSocket (dynamic style only through JS: `el.style.x`, Preact's `style` object). The app's CSP also allows `https:`/`http:` in `img-src` and requires Trusted Types: no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`dangerouslySetInnerHTML` with content and no `script.src` (build the DOM with JSX or `textContent`), and an image by URL only through the loader in `src/canvas/components/` (or `src/storage/` for `blob:`; lint rule). The guide and the viewer demo use the `static` profile (no remote image or Trusted Types). Do not write the CSP by hand in `index.html`. Details in `docs/ARCHITECTURE.md`.
- **Desktop only**: minimum window of 900×720 px (tokens `size-app-min` and `size-app-min-height`), mouse and keyboard; simple touch works (click, drag, scroll and pinch), phone gestures do not. Below 900 px wide or 720 px tall the app shows the "Open in a larger window" notice in place of the screen, without unmounting anything (the project stays open and saving). There is no phone layout (decision of phase 5.8). On an Android tablet, with a window of at least 900×720 and simple touch, the app works without guarantee; a project in a folder goes through Android's folder access, slower than the desktop's.
- Wrap every `localStorage`/IndexedDB access in try/catch.

## Code

- **Language:** everything in the repository and on GitHub is in **English**: identifiers, file names, comments, documentation, tests, error and MCP messages, commit messages, titles and bodies of issues and PRs, and the comments and reports that agents write on GitHub. Brazilian Portuguese (pt-BR) stays only where decision 2 of #741 allows: `src/i18n/pt-BR.ts` and the `pt-BR` parts of the bilingual modules of `src/i18n/`, the pt-BR strings of the interactive guide, the locale tests that check pt-BR text, the fixtures declared in the exceptions list, the protocol terms (`PROTOCOL_TERMS` in `tests/tooling/portugueseAllowlist.ts`, only inside backticks or quotes) and `mappings-workspace/`. The app UI stays bilingual (en-US and pt-BR, the same keys). Chats with the owner stay in Portuguese.
- TypeScript strict, no `any` (use `unknown` + validation).
- Small, functional components; logic outside the components.
- Do not add dependencies beyond the stack above without justifying it in the PR.
- **Complexity per function:** a new or changed function stays at cyclomatic complexity up to 10 (ESLint `complexity`, an error in `src/**` and `mcp/**`); legacy above that is in `eslint-suppressions.json`, where the per-file count can only go down.
  - Whoever reduces a suppressed function below the limit runs `npx eslint --prune-suppressions` in the same PR (without it `lint` fails on an unused suppression).
  - `eslint-disable` is not used for `complexity`: the exception lives in the suppressions file, visible in the diff.
  - A suppressed function that the phase had to touch does not need to be reduced (just do not create another one above the limit in the same file); the big debt becomes a `roadmap` issue, not a refactor in the middle of the phase.

## Workflow (summary)

- The project owner uses Claude Code **from a phone** and does not run anything locally.
- **Session start:** the session works directly in the repository folder (no worktree, unless the owner asks), on the branch in use. Before any new task, go to an up-to-date `main` (`git switch main && git pull --ff-only`) and create the epic branch from there; if there is an uncommitted change or the branch in use is not merged, ask the owner before switching.
- Nothing is implemented without a `ready` issue (or `in-progress`, when resuming), and everything reaches `main` through an epic (`epic/<name>`, with a PR to `main`); each phase is a short branch with a PR to the epic. The exception is the fast track: a small process tweak goes in a one-PR epic, with no `ready` or phases, through the `/via-rapida` skill (`.claude/skills/via-rapida/SKILL.md`; "except the fast track").
- Before finishing any task: `npm run lint && npm run typecheck && npm test && npm run build` must pass.
- **Before opening an issue, branch, PR or session, read [`docs/PROCESS.md`](docs/PROCESS.md)** (the sections that apply to the task): planning in issues, labels, bugs, automated flow, code review, test scripts, PR description, model use and stages. The ready-made messages are in [`docs/FLOW.md`](docs/FLOW.md).

## Mapping workspace

`mappings-workspace/` holds the Mapping projects used to design and evolve this app (screens, flows and components mapped as markings and annotations). It is isolated from the app code: ignored by eslint and prettier, and not part of any build. Read `mappings-workspace/AGENTS.md` before touching it. The `mapping` MCP server is configured in `.mcp.json` (it runs `mappings-workspace/serve.mjs`, which in cloud sessions runs `setup.sh` first). Never edit `mapping.json`, `specs/` or `proposals/` by hand: use the MCP tools.
