# Text measurer fallbacks and measure_component accuracy — [Não lançado] (épico `epic/measure-fallbacks`, PR #2267, MCP 0.56.2, schema v23 unchanged)

## Corrigido

- MCP server: a monospace library font (`JetBrains Mono`, `Fira Code`, `monospace`, …) whose shaping throws now falls back to Mapping Mono, with its bold from weight 600, instead of the proportional Mapping Sans.
- MCP server: when a library font's shaping throws, the baseline, the `cap-middle` position and the decoration (underline, line-through, justified lines included) come from the face that drew the glyphs, and `measure_component` and the drawing proof measure the text with that face's ascent and descent. Without a throw nothing changes.
- MCP server: `approximate`, in `measure_component` and in the `component-overflow` items of the drawing proof, is now `true` exactly when some text measured fell to the embedded font in place of its family, instead of "the project has no library font": a project that mixes library and non-library families no longer reports `false` for a text set in a family that is not a library font, and a drawing set in a library family is no longer marked because another one is.
- MCP server: `measure_component` of a component with a slot and an axis that follows the content gives the same size as before, plus a `hint` saying it is the size with the slots empty and that a new instance is born at the component's `size`.
