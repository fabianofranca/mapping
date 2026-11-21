# Preview, density and free space — 2026-11-20 (épico `epic/density-free-space-preview`, PR #2384, MCP 0.50.2, schema v22)

## Corrigido

- Replacing a container's image with another resolution keeps the components' drawing: the container's `density` follows the ratio of the widths (3 → 4 from 1080 to 1440 px, clamped to 0.5–8), so each component keeps its size in units. It holds for the app's **Replace image** (one undo entry), for `replace_container` (the step says ", density 3x → 4x") and for the proposal (the container's `density` field goes next to `file`). The component's minimum is read at the new density, so replacing back does not grow a button that was only rescaled (#1891).
- The MCP's `create_marking` no longer fills optional fields (media, icons, actions) with the component's sample values: only the required fields without a `default` come from the `preview`, and the initial size is measured with those same values. The app's Palette keeps the whole `preview` (#1891).

## Alterado

- With no free space, the new piece from the Palette (drop, **Add to screen**, **Add to canvas**) and from `create_marking` without `rect` goes up to the level above, up to the container, instead of landing over the markings of a full area. With no spot at any level, or in a full slot, it goes over the others, never inside or equal to a sibling (#1891).

## Adicionado

- A warning when the new piece ended up over other markings: a toast in the app ("No free space: the new component overlaps other markings.") and the usual `ignored-argument` warning in the MCP's `create_marking` (#1891).
