# The MCP server shapes text with HarfBuzz — [Não lançado] (épico `epic/mcp-harfbuzz`, PR #2398, MCP 0.51.0, schema v21)

## Alterado

- The MCP server measures and draws text with HarfBuzz, so library fonts are shaped like in the browser (contextual alternates, every GPOS lookup, the variable weight, the spacing without ligatures). Sizes measured with a library font can change by fractions of a pixel, towards the app's (#2121).
- Removed: the two "skipped substitution" warnings of `validate_library` (#2121).
