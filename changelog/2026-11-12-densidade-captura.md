# Capture density — 2026-11-12 (épico `epic/densidade-captura`, PR #1693, MCP 0.37.0, schema v19)

## Adicionado

- Container density (#1085, D1): `containers[].density` (from 0.5 to 8; default 1) says how many pixels of the image one component unit is worth (dp, pt, px at 1x). In a 3x capture, a 174 × 120 `button` draws the 14-unit label at 42 px, the same as the same button at 58 × 40 in a 1x container at `zoom` 3.
- The component's `minSize`, the instance's initial size, Arrange and fit to content apply in units and are saved in image pixels (× density).
- MCP: `add_container` and `update_container` accept `density` (`null` goes back to 1; outside 0.5 to 8 is `container-density`); `get_container`, `get_project` and `get_marking` return `density`; `component-overflow.missing` stays in image pixels.
- Schema v19 (the migration only bumps the number) and proposal `formatVersion` 7 (the container's `density` field).
- Density in the app (#1085, D2): the **Density** field in the container Details (1x, 1.5x, 2x, 3x, 4x or **Custom** from 0.5 to 8, which accepts 2.625) and in the **New container** dialog (default 1x). With a ready-made size from the specialization that explains the width (1080 = 3 × 360), the Details show "Suggestion: 3x (Phone 360 × 800)" and the **Apply** button; the app never applies on its own, and Apply is a single undo entry.
- The proposal review shows a container's density change as "Density: 1 → 3".

## Alterado

- `dist/index.html` ceiling raised by 16 KiB, from 2,097,152 to 2,113,536, by the budget rule.
- Material 3 (Compose) at version 10 (#1085, D3): the Fidelity of the 50 documents says "1 dp = 1 component unit; the container density converts to image pixels" (before, "1 dp = 1 component px"). Additive, with no new step in `migrations` (the existing `from → to` spans now end at 10). The `examples/material3-compose.zip` package, the full example and the guide are regenerated.
- Test scripts: `docs/TESTING.md` talks about schema v19 and, in R3.14 to R3.17, the Material 3 chain becomes `mat-v11` to `mat-v14` (the library is at version 10); R17 gains R17.39 (the 174 × 120 `button` in a 3x container equal to the 58 × 40 one at `zoom` 3) and R17.40 (`component-overflow` with `density` 3 and `container-density` with 12).
