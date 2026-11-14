# Reference as URL — 2026-11-06 (epic `epic/referencia-url`, PR #622, MCP 0.21.0, schema v14)

## Alterado

- `mapping://` references are just a valid URL: `mapping://<project>/<m|i|a|p>/<code>`, with the `<project>` percent-encoded (`Meu Projeto (v2)` becomes `Meu%20Projeto%20%28v2%29`) and nothing after the code. The app's copy (`Ctrl+C` and the reference button) and all MCP responses (items, proposals and the `detail` of `image-overlap`) no longer carry the readable path in parentheses; the separate fields with a name or path (`name`, `from`/`to` of the arrows) stay as they were.
- Old references, with the path in parentheses or the project unencoded, are no longer valid: the MCP answers `invalid-ref` with a `hint` that states the accepted format and tells you to copy again in the app. The short forms (`m/3f2a9c1e` with `project`, only the code and the full id) remain.
