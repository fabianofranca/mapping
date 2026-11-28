# Intended overflow and absolute children — [Não lançado] (épico `epic/intended-overflow-absolute`, PR #0, MCP 0.68.0, schema v25, unchanged)

## Adicionado

- Component `formatVersion` 4 (no raise): `overflow: "intended"` on a node says it may go past its parent's box on purpose (a 48 px touch target in a 44 px bar). The parent's "does not fit" checks are repeated without the flagged children, so the flagged overflow is no `component-overflow` pending item and no shortfall, while a sibling that really overflows still is one. Layout, `hug` and the drawing do not change. Not valid on the root; unknown on a `repeat`.
- Component `formatVersion` 4: `childOverflow: "intended"` on a `slot` keeps the child markings past its box out of the drawing's overflow. `slot-not-accepted`, `slot-full`, `slot-hidden` and `clip` do not change.
- `validate_library` reports each intended overflow as the warning `overflow intended: <frame>`, once per case, and nothing else does (the app, the viewer, the MCP reads and `plan_changes` see no overflow from either key). It is expected and needs no fix.
- `spec-author` skill, `docs/AGENT-GUIDE.md`, `docs/COMPONENT-FORMAT.md` and `docs/component.schema.json`: when to use each key.
