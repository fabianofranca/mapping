# Preview, density and free space — [Não lançado] (épico `epic/density-free-space-preview`, PR #0, MCP 0.50.2, schema v22)

## Corrigido

- Replacing a container's image with another resolution keeps the components' drawing: the container's `density` follows the ratio of the widths (3 → 4 from 1080 to 1440 px, clamped to 0.5–8), so each component keeps its size in units. It holds for the app's **Replace image** (one undo entry), for `replace_container` (the step says ", density 3x → 4x") and for the proposal (the container's `density` field goes next to `file`). The component's minimum is read at the new density, so replacing back does not grow a button that was only rescaled (#1891).
