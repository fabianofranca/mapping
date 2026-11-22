# The MCP server sets the variable axes of a library font like the browser — [Não lançado] (épico `epic/mcp-variable-axes`, PR #0, MCP 0.57.7, schema v23 unchanged)

## Alterado

- The `slnt` axis of a variable library font follows the style the library declares for the face, as in Chromium: −14 for a face declared `italic` and 0 for one declared `normal`, clamped to the axis, whatever style the text asks for. The `ital` axis and the other axes stay at their defaults.

## Corrigido

- A variable font declared with one weight is no longer emboldened twice (#2652): the `wght` axis is clamped to the weight range the entry declares before it is clamped to the axis, so a `wght` 100–900 font declared `"400"` and asked for 700 measures at 400 and gets the synthetic bold once, as in Chromium.
