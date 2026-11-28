# Intended overflow and absolute children — [Não lançado] (épico `epic/intended-overflow-absolute`, PR #3079, MCP 0.70.0, schema v25, unchanged)

## Adicionado

- Component `formatVersion` 4 (no raise): `overflow: "intended"` on a node says it may go past its parent's box on purpose (a 48 px touch target in a 44 px bar). The parent's "does not fit" checks are repeated without the flagged children, so the flagged overflow is no `component-overflow` pending item and no shortfall, while a sibling that really overflows still is one. Layout, `hug` and the drawing do not change. Not valid on the root; unknown on a `repeat`.
- Component `formatVersion` 4: `childOverflow: "intended"` on a `slot` keeps the child markings past its box out of the drawing's overflow. `slot-not-accepted`, `slot-full`, `slot-hidden` and `clip` do not change.
- `validate_library` reports each intended overflow as the warning `overflow intended: <frame>`, once per case, and nothing else does (the app, the viewer, the MCP reads and `plan_changes` see no overflow from either key). It is expected and needs no fix.
- `spec-author` skill, `docs/AGENT-GUIDE.md`, `docs/COMPONENT-FORMAT.md` and `docs/component.schema.json`: when to use each key.
- Component `formatVersion` 4 (no raise): `position: "absolute"` takes a child of a `row`, `column` or `grid` out of the flow, like CSS `position: absolute`. It takes no place on the main axis, no `gap`, `fill` share, grid cell or flow line, and the parent's `hug`, `min-content`, `max-content`, `justify` and baseline ignore it. It is sized and placed by its `anchors` like a child of a `none` frame of the parent's whole box (the padding does not apply); without anchors it sits at the start corner, the right edge in `rtl`. The draw order stays the template order. Valid on every node but the root and a `repeat`'s `template`; a `none` parent changes nothing.
- Example package `examples/libraries/touch-targets/` (a Top bar with 48 actions in a 44 bar, a List item with an absolute state layer and a 48 touch area, a Touch row whose slot has `childOverflow`; `validate_library` gives exactly the `overflow intended` warnings) and script R54 in `docs/TESTING.md`, in block 7 of the full round. `featureCoverage` no longer lists `overflow`, `childOverflow` and `position` as known gaps.

## Alterado

- The `dist/index.html` ceiling went up 16 KiB, from 2801664 to 2818048, by the budget rule; above the limits, `bug` #3093 for the owner to review.
