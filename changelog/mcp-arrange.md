# Arrange in the MCP batch — [Não lançado] (épico `epic/mcp-arrange`, MCP 0.63.0, schema v25 unchanged)

## Adicionado

- MCP `arrange_marking` batch operation (`plan_changes`, `propose_changes`, `revise_proposal` and the `render_container`/`render_marking` preview): the app's **Arrange** on a component marking with a slot. It arranges the children and the nested components with a slot by the slot's layout (`justify` `center`/`end`/`space-*`, the aligned `none` slot, `wrap`, grid, `reverse`, the root `weight`) and fits a `hug` parent, with exactly the app's rectangles. Create the parent and its children with `inside`, then call it once on the outermost parent.

## Alterado

- The `not-arrangeable` error says that the marking is not a component with a slot (row, column, grid or aligned layout) that holds children to arrange, and its hint names `fit_marking` for a component with no children in the slot.
