# One drawing font, a token named by a field value and notes library v6 — [Não lançado] (épico `epic/drawing-font-notes-v6`, PR #0, MCP 0.61.0, schema v24 unchanged)

## Adicionado

- The drawing font: component text in the built-in `font-sans` and `font-mono` is now drawn with the embedded **Mapping Sans** and **Mapping Mono**, the same files the MCP measures and draws with, in the app canvas, the Catalog, the library preview and the viewer. The drawing no longer depends on the operating system's font, and a box the MCP fits (`fit_marking`, `create_marking` without `rect`, `measure_component`) is no longer cut in the app. Every project switches, with no opt-in and no schema change. The interface keeps the system font, and a library that redefines `font-sans` or `font-mono` in `tokens.values` still wins.
- `mapping-viewer` 0.12.0: the viewer registers the four Mapping faces on its first `createViewer` (the `./formats` entry before it sizes the boxes) and redraws when they load; its `fonts` option default is the model's. The host passes nothing. The bundles grow by about 100 KB each.
- `measure_component` and the drawing proof of `plan_changes` and `propose_changes`: a text in the default font (a family stack that starts with `Mapping Sans` or `Mapping Mono`) is exact, so `approximate` is `false` and `component-overflow` items drop the `approximate` flag and the `(approximate)` suffix for it. A stack that starts with another name that is not a library font (`sans-serif`, `Inter`) stays approximate. The library validator does not change.

## Alterado

- `DEFAULT_SANS` and `DEFAULT_MONO` of the model are `"Mapping Sans", sans-serif` and `"Mapping Mono", monospace`. The app no longer passes the theme's font stack to the component libraries (`readHostFonts` and `hostFontsFrom` are gone).
- A family stack that is just `Mapping Mono` (no generic after it) now measures with the mono face in the server.
- `docs/TESTING.md`, R12.47, R12.48, R25.26 and R39.16: the widths, the clipped box and the `approximate` values are recomputed for Mapping Sans and Mono.
- The `dist/index.html` ceiling went up 80 KiB, from 2654208 to 2736128, by the budget rule; above the limits, `bug` para o dono revisar
