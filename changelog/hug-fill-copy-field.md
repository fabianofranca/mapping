# Hug fill and copy-field migration step — [Não lançado] (épico `epic/hug-fill-copy-field`, PR #2365, MCP 0.50.0, schema v22)

Schema unchanged. Details in #2164.

## Alterado

- A `fill` child on the main axis of a `hug` frame is now measured by its content (clamped by its limits and by the available limit) in every component `formatVersion`, instead of 0; the warning `fill inside hug becomes 0` no longer exists (#2164).
