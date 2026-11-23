# The MCP server sets the variable axes of a library font like the browser — [Não lançado] (épico `epic/mcp-variable-axes`, PR #0, MCP 0.58.1, schema v23 unchanged)

## Alterado

- The `slnt` axis of a variable library font follows the style the library declares for the face, as in Chromium: −14 for a face declared `italic` and 0 for one declared `normal`, clamped to the axis, whatever style the text asks for. The `ital` axis and the other axes stay at their defaults.

## Corrigido

- A variable font declared with one weight is no longer emboldened twice (#2652): the `wght` axis is clamped to the weight range the entry declares before it is clamped to the axis, so a `wght` 100–900 font declared `"400"` and asked for 700 measures at 400 and gets the synthetic bold once, as in Chromium.
- A library font file that already slants is no longer slanted again (#2574): an italic text on a face declared `normal` gets the synthetic skew (0.25) only when the file is upright. Chromium does not skew it when the file's `OS/2.fsSelection` has bit 0 (italic) or bit 9 (oblique) set, or when it is a variable font whose `slnt` or `ital` default is not 0, and now neither does the server. The embedded fonts and every upright library file lean as before.
