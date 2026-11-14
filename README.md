# Mapping

A web app to mark **rectangular areas** on images, organize them into **layers** and annotate them with free key-value pairs or with **typed annotations** defined by a _specialization_ (e.g. SDUI, data model). Everything is saved in a `mapping.json` next to the images, in a format designed to be read by an AI agent: the coordinates are pixels of the original image, so the agent crops exactly the marked area.

The core is **generic** (images, markings, layers, annotations, components and screens): every domain concept (SDUI, platforms, Figma, contracts) comes in through _specializations_, so the same tool serves any number of applications.

- **Desktop only**: made for a workstation (mouse, keyboard, side-by-side panels), with a minimum window of 900×720 px; in a narrower or shorter window the app shows "Open in a larger window" and goes back to normal when the window grows. Simple touch (on a touch monitor) works; there is no phone layout.
- **A single file**: the build produces a self-contained `dist/index.html`; it works opened through `file://` (desktop Chrome/Edge) and hosted on GitHub Pages, with no network requests (see [Privacy](#privacy-and-your-data)).
- **Two storage modes**: a _folder_ on disk (File System Access API, desktop Chrome/Edge) or a _local project_ in the browser (IndexedDB). Any project can be exported as a `.zip`.
- Light/dark theme, Portuguese (pt-BR) and English (en-US), installable as a PWA (only on `https:`).
- **MCP server** for AI agents to read projects in a folder and **propose changes** to them, with the app's Ctrl+C copying the reference of the selected item. The agent never writes the `mapping.json` (there is no `apply_changes`). Installation and use in [`docs/MCP.md`](docs/MCP.md).
- **Change proposals with review** (stage 4): every change made by an agent arrives as a _proposal_, a kind of pull request inside the tool, saved in `proposals/` in the project folder (versioned along with the rest; the exported zip includes it). In the **Proposals** window (Ctrl+Shift+7) the user opens the proposal in **review mode**: the project becomes read-only, the canvas shows the project **as it would be** (Current / Proposed toggle), and they **accept or reject** at any level (proposal, image, item or change), leave **notes** on what they rejected and use **Apply accepted** (one undo entry). The review can be interrupted and resumed, even after closing the app. The agent reads the review (`get_proposal_review`) and fixes the same proposal (`revise_proposal`: replaces, withdraws and adds, without touching what the user accepted); after it is applied, it sends a new one (`supersedes`) with only the fixes. Images and markings have a generic external identity (`source`), and `formatVersion` 3 specializations declare which elements of an external system each type and field correspond to (`sources`); the core does not interpret the system. To try it without an agent, open `examples/proposta-exemplo.zip` in the app. Format in [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md).
- **Interactive guide and example project**: a 12-step tour (the `guia/` page, which works offline, opened from the home screen and from **Help**) and the example project, the `examples/exemplo-completo.zip` file in this repository, opened through **Open zip** (it is not embedded in the app). See [Interactive guide and example project](#interactive-guide-and-example-project).
- **Specialization code**: a specialization can declare _platforms_ and say which code creates an instance of each type on them (`code`: what is called, `symbol`, and the file that defines it, `path`, in the platform's `repo` repository); the project only keeps the local clone (`platformRepos`). In Details, the "Definition" row has "Open in repository" and "Copy path". The mapping stores nothing about the solution. The agent receives the calls to write for a marking (`get_code_hints`) and finds, from a file, the types that use it and their markings (`find_by_code`). The core stays generic: no platform name in the app or MCP server code. Format in [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md) and [`docs/FORMAT.md`](docs/FORMAT.md).
- **Component library** (Library stage, finished): a specialization can deliver a _package_ (a folder with components, sources, documents and examples) that the app validates, applies and updates with migrations; screens without an image assembled from components directly on the canvas, and a **Catalog** to browse the components and try out the fields. Format in [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md) and [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md).

## Privacy and your data

Your projects and images **stay on your device** (in the folder you chose or in the browser) and **are not sent to any server**. This is not just a promise of the code: the `index.html` carries a _Content Security Policy_ that the browser itself enforces, with `connect-src 'none'` and `default-src 'none'`. In practice:

- the app **cannot** make a network request (`fetch`, `XMLHttpRequest`, `WebSocket`…), nor load an image, font, script, style or frame from another address;
- there is no telemetry, analytics, or fonts or libraries loaded from a CDN: everything (code and styles) is inside the file, and the policy only accepts exactly that content (by hash), with no `'unsafe-inline'` or `'unsafe-eval'`;
- the only contact with the network is the **browser's**, when downloading the app (and the service worker, when looking for a new version) from where it is hosted; your data never takes part in it;
- what leaves the app is what **you** send: the exported `.zip`, downloaded or shared through the system share sheet.

The policy is generated at build time, and the build fails if it is missing or does not match the file's content; Playwright tests confirm the blocking. Details and reasons in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#content-security-policy).

## How to run

Requires Node 22 (pinned in `.nvmrc` and in `engines` in `package.json`; with nvm, `nvm use`).

```bash
npm ci
npm run dev        # development server (Vite)
npm run build      # generates dist/index.html (and sw.js, manifest.webmanifest) with the CSP
npm run dev:viewer # demo of the embeddable viewer in a React host (viewer/README.md)
npm run build:viewer # generates dist-viewer/ (embeddable viewer: core, React wrapper and types)
npm run build:guia   # regenerates public/guia/index.html (npm run build already does it)
npm run build:example # regenerates examples/exemplo-completo.zip and materializes examples/exemplo-completo/specs/
npm run build:proposal-components # regenerates examples/proposta-componentes.zip (proposal with new components, script R13)
npm run build:suggestions-kotlin # regenerates examples/sugestoes-kotlin.zip (Kotlin library with two data classes, script R14)
```

## Interactive guide and example project

Download `examples/exemplo-completo.zip` from the repository and open it through **Open zip**, on the home screen: it is a copy of the `examples/exemplo-completo/` project (to open the folder with **Open folder**, run `npm run build:example` first: its `specs/` is generated from the sources and is not in git; 4 screens, 31 markings, 41 annotations, 8 layers, 3 specializations and a change proposal to review). The **Interactive guide** (in the sidebar, and in **Help**) opens in a new tab the 12-step tour over that same project, to follow side by side with the app. The guide is a static page (`public/guia/index.html`, published at `guia/` next to the `index.html`), generated from the example project, in the app's theme, and kept in the service worker's cache.

```bash
npm run build:example   # examples/exemplo-completo.zip and specs/ of the examples/exemplo-completo/ folder (materialized from the sources)
npm run build:guia      # public/guia/index.html, from the template and the example
```

How it is generated, what opening the example writes and how to change the example: [`docs/GUIDE.md`](docs/GUIDE.md). Manual test script: R11 of [`docs/TESTING.md`](docs/TESTING.md).

## How to test

```bash
npm run build:mcp    # generates dist-mcp/mapping-mcp.js (single-file MCP server)
npm run lint         # eslint + prettier --check (includes per-function complexity up to 10; legacy in eslint-suppressions.json)
npm run lint:ci      # the same, with a cache in .cache/ (used by CI)
npm run typecheck    # tsc --noEmit (app and MCP server); build and build:mcp do not repeat tsc
npm test             # Vitest: model (Node), store, storage, canvas and components
npm run test:coverage # with a coverage report in coverage/ (skips the performance budgets)
npm run test:perf    # only the per-frame performance budgets
npm run test:e2e     # Playwright against dist/index.html (needs npm run build first; includes the CSP and the service worker, which use openssl)
```

Before opening a PR: `npm run lint && npm run typecheck && npm test && npm run build`.

E2E runs in CI. Locally, run `npm run build` and point to Chrome with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<path>`.

## How to publish

The workflows in `.github/workflows/`:

- **`ci.yml`**: on every PR (and through `workflow_call`, called by `deploy.yml`; it no longer runs on push): the `epic` job checks the origin (a PR to `main` only from `epic/*` or from Dependabot; a required check in `main`'s ruleset), and then lint, typecheck, tests with coverage, performance budgets, build (app and MCP server), size budget of `dist/index.html` (ceiling in `scripts/ci/dist-budget.json`, which `scripts/ci/distBudget.mjs raise --write` raises without touching `ci.yml`; the last step of `build` shows the size and the margin in the job summary and warns below 2 KiB) and E2E. Every job has a `timeout-minutes` close to double the measured time: one that hangs stops and the `check` ends red instead of staying pending. The `check` is the aggregator of four parallel jobs (`static`: lint and typecheck; `test`: 4 Vitest shards with coverage, balanced by time (`tests/support/timedSequencer.ts` reads the times from `tests/support/durations.json`; `npm run test:durations` regenerates them, and outdated times only unbalance) and without generating a report (`COVERAGE_REPORT=off`); `coverage`: merges the blobs and generates the report; `build`: performance, build, size, MCP and viewer), next to the `e2e`; `node_modules`, the ESLint/Prettier cache and the Playwright browser are cached. The `e2e` uses 3 workers in CI (`workers: 3`) and only runs `playwright install-deps chromium` if the cached Chromium does not open. Playwright retries once in CI, with a trace only on the retry.
- **`mcp-prerelease.yml`**: MCP server pre-releases to test before the stable one: a snapshot per PR based on `epic/**` (`mcp-snapshot-pr<N>`, deleted when the PR closes) and a release candidate on the merge of the epic's last-phase PR, which carries the `mcp-rc` label (`mcp-v<version>-rc.<n>`, deleted when the stable one is out); see [`docs/MCP.md`](docs/MCP.md).
- **`mcp-release.yml`**: on the merge of an epic into `main`, publishes the stable `mcp-v<version>` (tag and Release together, with `mapping-mcp.js` and the workspace files) when the version in `mcp/version.ts` does not have a tag yet; with the tag already existing, it ends green without publishing. A `mcp-v<version>` tag created by hand and the Run workflow for a tag that already exists remain as plan B (see [`docs/MCP.md`](docs/MCP.md)).
- **`preview-on-pr.yml`**: through `workflow_run`, when the `ci.yml` of a PR from the repository itself ends in success, it triggers `deploy.yml` with the PR's branch and validated SHA, which takes over `/preview/`. A superseded commit (cancelled CI) generates no preview.
- **`ci-rerun.yml`**: through `workflow_run`, when the `ci.yml` of a PR from the repository itself (not Dependabot's) ends red on attempt 1, it runs again, once, only the jobs that disappeared from the run because of an abandoned GitHub runner (`scripts/ci/ciRerun.mjs` decides, from the jobs of `main`'s `ci.yml`). Test, lint, build and timeout failures are not rerun. The change only takes effect after the merge into `main`.
- **`deploy.yml`**: a push to `main` publishes the main version on GitHub Pages (at `/`). Before that, it calls the whole `ci.yml` (`workflow_call`) for `main` and, in the preview, for the branch too. With the `sha` input whose `check` and `e2e` check runs are green, it does not run `ci.yml` again and publishes that SHA at `/preview/`; without it (manual dispatch), it runs `ci.yml` on the branch as before. Every deploy writes `deploy.json` at the site root with the published `main` commit. Without a preview, `main`'s failure blocks everything; with a preview, the branch must pass, but `main`'s failure (which is only checked if it changed since `deploy.json`) does not block: production is republished from the already published commit, with a notice in the summary.
- **`dependabot.yml`**: weekly npm and GitHub Actions updates, with minor and patch grouped into one PR per ecosystem.

The standalone `index.html` also comes out as a workflow artifact, to open through `file://`.

## How to use a branch preview

When a PR's CI turns green, its branch is published at `/preview/` automatically (`preview-on-pr.yml` triggers the Deploy with the validated SHA); there is only one preview, that of the last PR with green CI. To publish another branch by hand: in **Actions → Deploy → Run workflow**, choose the branch in "Use workflow from" (or type the name in the `branch` field). The workflow publishes:

- `main`, intact, at `/` (the last validated commit: if `main`'s checks fail, the already published one stays);
- the branch at **`/preview/`**, built with `VITE_CHANNEL=preview`.

The preview has **separate storage** (its own IndexedDB, `localStorage` and service worker): it does not see or migrate the local projects of the main version. A banner at the top warns that it is a test version (it can be dismissed for the session; the PREVIEW badge in the bar and the channel in the status bar always stay), and the manifest has another name, so both can be installed side by side.

## How to report a problem

To test the app end to end (where to get it, requirements, scripts with the expected result of each step and the report template), follow the tester's guide: [`docs/TESTING.md`](docs/TESTING.md). The tester agent is a Claude Code session in the cloud, without you at the computer; its initial prompt is in [`docs/TESTING-NUVEM.md`](docs/TESTING-NUVEM.md) (a full round or one driven by the findings of a report, by a list of steps or by the phases of a stage), and the guide has an appendix just for the agent.

The app sends nothing to the network (not even telemetry), so the report depends on you copying the data:

1. Open **Diagnostics**: the Diagnostics tab of the bottom window (`Ctrl+Shift+6`).
2. Click **Copy**. The text carries a header with the version (build), channel, schema, storage type (folder or local), browser, window size, language, theme, how many images, markings and annotations the project has and whether there is a pending write, followed by the logged errors. It does not carry project names, image names or paths.
3. Open an issue at [github.com/fabianofranca/mapping/issues](https://github.com/fabianofranca/mapping/issues) with the copied text, what you did, what you expected and what happened (a screenshot helps).

With no project open, the version is in **Settings → About**, which also has **Copy**; with a project open, it also appears at the end of the status bar.

## Documentation

- [`docs/TESTING.md`](docs/TESTING.md): the tester's guide (where to get the app, requirements, interface map, MCP installation, manual test scripts, advanced manual testing and the templates of the report and of the real-use log; appendices for the tester agent and for disk operations).
- [`docs/TESTING-NUVEM.md`](docs/TESTING-NUVEM.md): prompt of the cloud tester (a Claude Code session in the "Mapping - testes" environment, without the owner).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): layers, data flow, rules and where each thing lives.
- [`docs/GUIDE.md`](docs/GUIDE.md): interactive guide and example project (how they are generated, what opening the example writes, how to change them).
- [`docs/FORMAT.md`](docs/FORMAT.md): reference of the `mapping.json` (schema v13).
- [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md): format of the change proposal and the rules of the review.
- [`docs/COMMENT-FORMAT.md`](docs/COMMENT-FORMAT.md): format of the anchored thread (`mapping-thread`), the grammar of references and citations and the model API.
- [`docs/MCP.md`](docs/MCP.md): MCP server (installation, `.mcp.json`, roots, tools, references and troubleshooting); [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md) is the agent's guide.
- [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md): format of the specialization file (and [`docs/spec.schema.json`](docs/spec.schema.json)); examples in [`examples/specs/`](examples/specs/).
- [`.claude/skills/spec-author/SKILL.md`](.claude/skills/spec-author/SKILL.md): Claude Code skill that writes and validates a specialization from a codebase or design system (copy the folder to the mapped repository or to `~/.claude/skills/`).
- [`examples/workspace/`](examples/workspace/): skeleton of a folder that centralizes Mapping projects, ready for any MCP agent (server, roots, skill and `AGENTS.md` by relative path; `setup.sh` downloads the release).
- [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md): format of the component file (`mapping-component`): nodes, sizing, expressions and engine warnings; [`docs/component.schema.json`](docs/component.schema.json) is the JSON Schema (documentation; the code is the source of truth).
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md): design system (Claude Design artifact): component → code origin map, triggers, pending items and sync history.
- [`viewer/README.md`](viewer/README.md): embeddable viewer (package `mapping-viewer`): structure, commands and the React demo.
- **Planning in GitHub issues** ([github.com/fabianofranca/mapping/issues](https://github.com/fabianofranca/mapping/issues)): future items are issues with the `roadmap` label (each with an impact label, `impact: high`, `medium` or `low`, which stays when it becomes a stage), and defects with `bug` (a type that follows the issue until it closes, with a severity label `severity: high`, `medium` or `low`; before opening one, an equal issue or one that groups it is looked for; screenshots live in the `evidencias` branch); the detailed stage, ready to develop, is an issue with the `ready` label, with one sub-issue (label `step`) per phase; when the epic starts, it becomes `in-progress`; the finished ones stay in the closed issues with that label. What came before them is in the git history.
- [`CLAUDE.md`](CLAUDE.md): working rules for Claude Code.
- [`docs/PROCESS.md`](docs/PROCESS.md): delivery process (issues, epics, phases, tester, code review, model use).

## Stack

Vite + TypeScript (strict) + Preact + `@preact/signals`; Konva (canvas); JSZip; zod; idb; `vite-plugin-singlefile`; Vitest and Playwright.
