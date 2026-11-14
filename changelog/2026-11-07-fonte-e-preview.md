# Font and preview — 2026-11-07 (épico `epic/fonte-e-preview`, PR #755, MCP 0.25.1, schema v15)

## Adicionado

- `create_marking` with `annotation` warns (`ignored-argument`) when the type declares a component and the batch does not find it (file missing, unreadable or with a problem): "the type … declares a component, but …: the annotation was created without the preview and without the minimum size".
- Library validation (`validate_library` and the library window in the app) warns when a literal `font.family` is not a family the CSS accepts (empty item, unclosed quotes, quotes in the middle of a name), with the node's path and the value. It is a warning, not an error: the drawing falls back to `sans-serif` with the component's size and weight.

## Corrigido

- `create_marking` with partial `values` fills the other fields with the component's `preview` also after `apply_specialization` or `update_specialization` in the same batch (the batch catalog follows the batch's specializations; optional `rect` and `minSize` apply in the new version), and `addComponentMarking` with `values` now applies the `preview` to the missing fields.
- A component with `font.family` as a CSS stack (e.g. the theme's) or a generic name (`system-ui`) draws the text with the requested family, size and weight; before it fell back to 10px sans-serif without a warning (in the app and in the embeddable viewer).
