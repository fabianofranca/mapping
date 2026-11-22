# Text measurer fallbacks and measure_component accuracy — [Não lançado] (épico `epic/measure-fallbacks`, PR #2267, MCP 0.56.2, schema v23 unchanged)

## Corrigido

- MCP server: a monospace library font (`JetBrains Mono`, `Fira Code`, `monospace`, …) whose shaping throws now falls back to Mapping Mono, with its bold from weight 600, instead of the proportional Mapping Sans.
- MCP server: when a library font's shaping throws, the baseline, the `cap-middle` position and the decoration (underline, line-through, justified lines included) come from the face that drew the glyphs, and `measure_component` and the drawing proof measure the text with that face's ascent and descent. Without a throw nothing changes.
