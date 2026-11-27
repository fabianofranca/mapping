# Preview and compare a library — [Não lançado] (épico `epic/mcp-preview-compare`, PR #3041, MCP 0.65.0, schema v25 unchanged)

## Adicionado

- The `fonts` of a library that a batch or proposal applies or updates measure and draw the text in the `render_container` and `render_marking` preview, before it is applied (#2928).

## Alterado

- The preview warning "the library's fonts count only after it is applied" is gone; a declared font the package does not carry gives a warning with its path and is drawn with the embedded font (#2928).
