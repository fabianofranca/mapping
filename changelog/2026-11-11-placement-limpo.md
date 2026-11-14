# Clean placement — 2026-11-11 (epic `epic/placement-limpo`, PR #1650, MCP 0.35.1, schema v18)

## Corrigido

- The positions and scales of the containers, and the positions of the perspectives, stop writing the floating-point tail: `x` and `y` keep at most 6 decimal places (`-188.75` instead of `-188.75000000000006`, `-739.655172` instead of `-739.6551724137931`) and the scale at most 12 significant digits (`17.2413793103` instead of `17.24137931034483`). It applies to create (including the **Selection size** and `add_container`), move, resize, swap the image, the repair of overlapping images and the perspectives, in the app and in the MCP (`update_container` and `add_container` write and show the rounded value). The deviation stays below the model's 1e-6 tolerance: no touching becomes an overlap and no containment changes. Old files are not rewritten: the tail only goes away when the container is edited.
- Dragging a container only vertically no longer rewrites its `x` (in Main and in a perspective): the position comes from the sum `x + offset`, without the lost bits of `(x + c) - c` with fractional zoom.
