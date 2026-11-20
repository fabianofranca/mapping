# Component keeps size in units across spaces — 2026-11-20 (épico `epic/settle-units`, PR #2321, MCP 0.48.1, schema v21 unchanged)

## Corrigido

- A Text (or any component marking) dropped from the canvas into a container, or out of one, no longer overflows right after the move: it keeps its size in component units, so its box and its font stay in the same unit without Arrange (#2210).
- Floating on a component in a container with density or scale other than 1 keeps its units on the canvas (#2210).
- A component that leaves a container whose density differs from the target's no longer grows when density × scale is 1 (for example density 2 at scale 0.5), when Floating is turned on, or when the scaled set would fall back inside a container: its minimum follows the target density; a container density of 0 or not finite counts as 1 (#2210).

## Alterado

- When the geometry moves a component marking to a space with another density × scale, its `rect` is scaled by the ratio; the set that moves together (with its descendants) scales as a whole around its top-left corner. A plain marking keeps its size on screen, as before. The MCP batch (`create_marking`, `update_marking`) converts the same way and `plan_changes` shows the converted `rect` (#2210).
