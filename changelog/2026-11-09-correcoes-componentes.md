# Fixes in the component engine — 2026-11-09 (épico `epic/correcoes-componentes`, PR #1173, MCP 0.28.9, schema v18)

## Corrigido

- Components: `visible` and `italic` with `{ "$field": "x", "default": true }` now use the `default` when the field is empty (the node no longer disappears).
- Components: Arrange, positioning a new child and the slot's `hug` now read the slot's `gap` and `padding` written as `$token`, with the tokens of the drawing mode (before they stayed at 0).
- `mapping-viewer`: `parseScreen` keeps the value tables (round-trip with `serializeScreen` without loss) and refuses a `parentId` that is self-referencing, cyclic or nonexistent, and a repeated `id`; `descendantsOf` no longer hangs on a cycle.
- Image swap: swapping the file for another of the same size no longer changes any rectangle, and rescaling respects the minimum size of each component marking (without inflating to 8 px); one that grew because of the minimum goes to review (MCP 0.28.9).
- Components: the canvas text measurer returns the real width of the widest line, and a `fill` text inside a `hug` frame no longer takes up the whole limit.
- Image swap through an MCP proposal: a component marking that grew up to the minimum size now gets a review (`needsReview`) on apply, as in the swap through the app.
