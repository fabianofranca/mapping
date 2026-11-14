# Placement without noise — 2026-11-08 (épico `epic/placement-sem-ruido`, PR #978, MCP 0.28.4, schema v18)

## Corrigido

- The `mapping.json` no longer writes container positions like `275.00000000000006`: when moving, resizing, creating or swapping a container's image (through the app or the MCP, `add_container` and `update_container`), a value less than 1e-6 from an integer is written as the integer. A real fraction (dragging with zoom) stays. Files already written with noise are not rewritten: the noise goes away when the container is edited.
