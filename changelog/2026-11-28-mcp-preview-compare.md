# Preview and compare a library — 2026-11-28 (épico `epic/mcp-preview-compare`, PR #3041, MCP 0.67.0, schema v25 unchanged)

## Adicionado

- The `fonts` of a library that a batch or proposal applies or updates measure and draw the text in the `render_container` and `render_marking` preview, before it is applied (#2928).
- `measure_component` accepts `path` (a package folder) with `project`: it measures a working copy with the folder's own components and fonts, before `update_specialization` (#2928).
- `render_container` accepts `region` (`x`, `y`, `width`, `height` in container pixels): it draws only that window at the asked `zoom`, with or without the preview arguments; a region outside the container is `region-outside-container` (#2928).
- `render_container` accepts `compare` (the before side: the project as it is, a batch or a proposal; `compare.ref` for a container the call's side recreates) and returns the count of different pixels, the boxes of the changed regions in container pixels and a side-by-side crop of them; nothing is written (#2928).

## Alterado

- The preview warning "the library's fonts count only after it is applied" is gone; a declared font the package does not carry gives a warning with its path and is drawn with the embedded font (#2928).
- The `not-found` of a container (or a marking of it) that the previewed batch or proposal deletes says so (`deletedBy`) and names the `$alias` or final reference of the container created in its place, with `replace_container` in the hint (#2928).
