# Child in the slot — 2026-11-10 (épico `epic/filha-no-slot`, PR #1519, MCP 0.33.0, schema v18)

## Adicionado

- **MCP:** `create_marking` with `inside` (the component with a slot, from the batch or the project): the child is born in the slot, after the last child, with the slot's `gap` and `padding`, without computing a rectangle, like the app's **Add inside X**. The stored parent still comes from geometry; with `rect`, the `rect` gives only the size; a full slot is accepted, with a warning. `parent` is still ignored with a warning.
