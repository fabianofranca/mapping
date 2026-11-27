# A `hug` text with `runs` fits its measured lines — 2026-11-27 (épico `epic/hug-runs-sizing-fields`, PR #3008, MCP 0.61.2, schema v24)

## Corrigido

- A `hug` text with `runs` is no longer measured narrower than its line breaking needs, so it is drawn on the lines it was measured with (#2925).
- A field that a component reads only in its root `sizing` no longer gets the warning 'not used by the drawing'; one the type does not declare is an error at its `sizing` path, as in the root `weight` (#2921).

## Alterado

- COMPONENT-FORMAT.md says what `maxWidth: { "$size": "width" }` on a `hug` text and `stroke.width: 0` do (#2920).
