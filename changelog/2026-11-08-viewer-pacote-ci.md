# Viewer package and CI on base change — 2026-11-08 (épico `epic/viewer-pacote-ci`, PR #1067, MCP unchanged, schema v18, unchanged)

## Corrigido

- `mapping-viewer` (0.4.1): the type declarations no longer import undeclared packages. `konva` moves to `peerDependencies` (for the types only; the bundle still ships the embedded copy) and `@preact/signals` left the declaration graph. The host compiles with `skipLibCheck: false`.
- `loadLibraryFromUrl` also downloads the specialization's icon file (`icons`), with or without `fonts: false`. Before, a library loaded by URL had no icons and `problems` cited "icon file not found".
- The PR's CI runs again when the PR's base changes (for example, from `epic/*` to `main`), so the `epic` check no longer stays green without checking the new base. An edit to only the title or body does not trigger CI.
