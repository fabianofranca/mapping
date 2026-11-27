# Justified bidi line in the MCP is reordered as a whole — [Não lançado] (épico `epic/mcp-justify-bidi`, PR #2923, MCP 0.61.1, schema v24, unchanged)

## Corrigido

- In the MCP's PNG, a justified line in `rtl`, or with right-to-left text, puts its words and the punctuation at their edges where Chromium does (#2653). The line is reordered once as a whole and each word is laid out in the direction of its run: `Hello, world.` in `rtl` keeps the period at the left edge and the comma on the right of `Hello`, and the words of a Hebrew run read from right to left. An `ltr` justified line with no code unit at or above U+0590 is drawn exactly as before. The app's canvas does not change.
