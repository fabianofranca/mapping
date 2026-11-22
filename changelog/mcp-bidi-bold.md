# The MCP server lays mixed-direction text out like the browser — [Não lançado] (MCP 0.57.1, schema v23 unchanged)

## Alterado

- A line that mixes text directions is reordered by the MCP server, and each run is shaped in its own direction and script, as in Chromium: a Hebrew or Arabic run inside a Latin line comes out reversed in place, a number inside an `rtl` line keeps its left-to-right order, the neutral at the edge of an `rtl` line (`Pay invoice.`) goes to the left, and brackets are mirrored in a right-to-left run. The widths of mixed lines can change by fractions of a pixel; text with no character at or above U+0590 in `ltr` measures and draws exactly as before.
