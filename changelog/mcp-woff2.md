# The MCP server reads `.woff2` library fonts — [Não lançado] (épico `epic/mcp-woff2`, PR #2459, MCP 0.54.0, schema v20 unchanged)

## Alterado

- The MCP server reads a library's `.woff2` fonts with its own decoder, so Material 3 is measured and drawn in Roboto, the font the app uses, instead of the embedded font; `validate_library` also checks `.woff2` (#2126).
