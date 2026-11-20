# Format gaps — [Não lançado] (épico `epic/format-gaps`, PR #0, MCP 0.49.0, schema v22)

Icons file formatVersion 3; component format 4, specialization and schema unchanged.

## Adicionado

- The `fillRule` of an icon path (icons file `formatVersion` 3): each item of `paths` accepts `"fillRule": "evenodd"` (or `"nonzero"`, the default). With `evenodd` the inner shapes of a path are holes, so an icon exported from Figma or Android no longer needs its subpaths rewritten. It draws the same in the app, in the `render_marking` and `render_container` PNG of the MCP and in the viewer (`mapping-viewer` 0.6.0). `fillRule` in a version 1 or 2 file is `only allowed with formatVersion 3`, at `icons.<name>.paths[i].fillRule`; a value other than `nonzero` or `evenodd` is `expected one of: nonzero, evenodd`.
- The example package `examples/libraries/drawing-keys/`, with the Icon holes component and an icons file in version 3 (`ring`, `square-hole`, `star-evenodd`).

## Alterado

- The icons file accepts `formatVersion` 1, 2 and 3 (`formatVersion: must be 1, 2 or 3` for any other). Versions 1 and 2 keep validating and drawing as before. An earlier app or MCP refuses a version 3 file at level 1 (`formatVersion: must be 1 or 2`), so it never draws the holes filled: update the MCP first (0.49.0).
- The `dist/index.html` ceiling went up 16 KiB, from 2326528 to 2342912 bytes, by the budget rule (FG1: 1001 bytes over); above the limits, `bug` #2339 for the owner to review.
