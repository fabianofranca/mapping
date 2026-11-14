# Embeddable viewer (`viewer/`)

A Mapping tool for those who develop `mapping-viewer`: a **read-only viewer**, framework-free, that a host site embeds (React included) to draw a screen from a component library and a screen description, updating in real time. It is not consumed by the app; it uses the engine that already lives in `src/`. The usage guide for those who install the package is [`PACKAGE-README.md`](PACKAGE-README.md).

## Structure

- Core, at the root of the folder:
  - `index.ts`: public entry of the core (`createViewer` and the engine re-exports).
  - `viewer.ts`: `createViewer`, `Viewer`, `ViewerOptions`; applies Konva's pixel ratio cap (2) when the first viewer is created.
  - `react.tsx`: `<MappingViewer/>` wrapper, a `<div>` that hosts a `createViewer`.
  - `tree.ts`: `screenTree` and `flattenTree` (tree of instances, pure).
  - `host.ts`: `loadLibraryFromUrl` and `registerLibraryFonts`, host functions (network and fonts); the core does neither.
  - `remoteImages.ts`: remote images, off by default and always `pixelSafe`.
  - `build.mjs`, `packageManifest.mjs` and `tsconfig.json`: the package build, its manifest (version and dependencies; the declarations test reads it) and the type declarations.
- `demo/`: demo page in real React 19 (no `preact/compat`), with its own CSS (`--demo-*`, without the app's tokens). It is a copyable example of a host.
- `samples/`: bundled examples (`samples.ts`, `samplesMaterial3.ts`, `settings.sdui.json`), used by the demo and by the model and canvas tests.
- The tests live in `tests/viewer/`. The drawing itself is the `ScreenRenderer` of `src/canvas/components/`.

## Commands

```bash
npm run dev:viewer    # React demo in development (vite.viewer.config.ts)
npm run build:viewer  # generates dist-viewer/ (tsc runs first and checks the types)
cd dist-viewer && npm pack   # generates mapping-viewer-<version>.tgz to install in the host
```

The demo is not part of `npm run build` or of the deploy. `npm run build:viewer` generates `mapping-viewer.js` (core) and `mapping-viewer-react.js` (wrapper), minified ESM, with external maps and Konva bundled, plus `package.json`, `types/` and the package's `README.md`. At the end it checks that every file pointed to by `exports` exists. The package version is the `VIEWER_VERSION` constant of `packageManifest.mjs` and goes up with API changes.

## API summary

- `createViewer(container, { library, screen, source, sourceSystem, onSource, drawingMode, direction, onHover, onClick, onWarnings, measure, fonts, fit, padding, interactive, selectionColor, hoverColor, remoteImages, allowOrigin })` returns `{ update, redraw, setSelection, setHover, setInteractive, fit, scale, boxOf, instanceAt, clientToScreen, warnings, screen, toDataURL, dispose }`. `source` (external JSON) wins over `screen`, `sourceSystem` chooses the specialization's origin, `onSource` receives each computed screen, `fonts` sets the default font of the texts and `screen()` returns the drawn screen.
- The container may have padding and a border: the stage takes the usable area and `clientToScreen` discounts them. Resizing is applied on the next frame, once, however many `ResizeObserver` notices arrive.
- `update` diffs by identity (`===`): only new instances or instances with a new object are re-instantiated. Drawing runs in `requestAnimationFrame`, at most once per frame.
- `direction` (`ltr`, the default, or `rtl`) is the reading direction of the screen computed from `source`: it goes to `layoutScreen` (mirrors the in-flow roots, the logical anchors and the slots) and to the component engine; it wins over the origin's `screen.direction`. It changes through `update({ direction })` (or the wrapper's prop) and recomputes the screen. The computed screen carries the direction in `Screen.direction` (only `rtl`; without the key it is `ltr`), and the inside of each component follows it, including in a ready-made `screen` (without `source`), which already carries the boxes and is not recomputed; the `direction` option, if given, wins over the screen's.
- `drawingMode` chooses the mode of the specialization's `tokens` (`light`, `dark`…); without it (or with a mode the specialization does not declare) the first mode applies. The viewer has no project or container: the mode is only the option's. Changing it at runtime (`update({ drawingMode })`, or the wrapper's `drawingMode` prop) redraws without reloading the library or the screen (the library with the mode's tokens is kept per mode). The built-in `font-sans` and `font-mono` tokens are worth the host's font (`fonts`, or the app theme's stack) in any mode, unless the specialization redefines them.
- `<MappingViewer library screen selection hover interactive ... />` reads the callbacks by ref and survives `<StrictMode>`.
- The library comes from `loadLibrary(files)` (or `loadLibraryFromUrl`); the screen, from `parseScreen(json)`, from an object or from a source JSON (`source`) translated by the specialization's declaration.
- The core does not register fonts: the host supplies them and calls `redraw()` (or changes `fontsVersion` in the wrapper).

The details of each option and each export are in `PACKAGE-README.md`.

## What is left out, on purpose

- **Dragging and resizing**: that is editing. The core gives click selection, hover and the no-interaction mode (`interactive: false`); `boxOf`, `scale` and `clientToScreen` let the host draw its own DOM handles. Whoever needs dragging wires the gesture into the groups via `ScreenRenderer` (exported).
- Network and fonts in the core: they stay in `host.ts`, for the site that installs the package.
- Tokens and i18n of the app: the demo does not use them. The package uses only `tokenValue` (`src/theme/tokens.ts`, light theme) for the default highlight colors (`color-accent` and `opacity-viewer-hover`) and for the default font stack; it uses neither `t()` nor CSS.

## Open points

- `toDataURL` captures only what fits in the `Stage`: with a numeric `fit` larger than the container, the screen comes out cropped.
- The two bundles duplicate Konva: whoever uses both on the same site loads two copies; the way out would be a single bundle with the wrapper inside.
- Test with the real JSON of an SDUI backend (the `settings.sdui.json` example passes without warnings).

## Folder rules

TypeScript strict, no `any`, no network requests; React is a development dependency only and only of the demo; the demo uses the `static` profile CSP only in the demo build (`vite build --config vite.viewer.config.ts`, output in `dist-viewer-demo/`); in `npm run dev:viewer` the Vite server does not apply that CSP. Image by URL only through the loader of `src/canvas/components/` (the lint rule also applies in `viewer/**`).
