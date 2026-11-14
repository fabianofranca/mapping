# Click cycle — 2026-11-06 (epic `epic/ciclo-do-clique`, PR #615, MCP 0.19.0, schema v14)

## Corrigido

- After dragging (or canceling a selection rectangle), clicking the same item again selects it, instead of going up to the parent. Only consecutive clicks, with no gesture between them, still go up one step.
- Test guide (R12.10c): a warning that Shift+drag starts about 30 px from the selected item's corners, because the handle grabs at 22 px and resizes, and that each new attempt starts with Esc until no selection is left.
