# Arrange in the MCP batch — 2026-11-27 (épico `epic/mcp-arrange`, PR #3023, MCP 0.64.0, schema v25 unchanged)

## Adicionado

- MCP `arrange_marking` batch operation (`plan_changes`, `propose_changes`, `revise_proposal` and the `render_container`/`render_marking` preview): the app's **Arrange** on a component marking with a slot. It arranges the children and the nested components with a slot by the slot's layout (`justify` `center`/`end`/`space-*`, the aligned `none` slot, `wrap`, grid, `reverse`, the root `weight`) and fits a `hug` parent, with exactly the app's rectangles. Create the parent and its children with `inside`, then call it once on the outermost parent.
- MCP `plan_changes`, `propose_changes` and `revise_proposal`: each `created` marking comes with its final `parent` and `container`, and each created container with its `parent`.
- MCP `plan_changes`, `render_container` and `render_marking`: an `operationsFile` batch of up to 5,000 operations (two large proposals can be planned together by joining their lists in one file); `propose_changes` and `revise_proposal` keep 1,000 from a file, with a message that names both limits.

## Alterado

- MCP `plan_changes` and `propose_changes` always carry `membership` (`[]` when nothing that already existed changes place); the tool descriptions and the guide say the operation index is 0-based.
- The `not-arrangeable` error says that the marking is not a component with a slot (row, column, grid or aligned layout) that holds children to arrange, and its hint names `fit_marking` for a component with no children in the slot.
