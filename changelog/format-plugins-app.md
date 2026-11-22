# Format plugins in the app — [Não lançado] (épico `epic/format-plugins-app`, PR #2607, MCP 0.58.0 provisional, schema v23 unchanged, specialization `formatVersion` 22 expected)

## Alterado

- The rules of the MCP batch for `add_container` with only a background, `create_marking` and `update_marking` now live in the model (`src/model/batchMarkings.ts`), so the app and the format import can apply them too. The batch behaves exactly as before: same results, same messages, same error codes.
- The rules of the MCP batch for `create_annotation`, `update_annotation` and `create_arrow` (values, table rows and their aliases, `ref` values, owner and role) also live in the model now (`src/model/batchAnnotations.ts`, with the reference lookups in `batchRefs.ts`), and `applyFormatResult` (`src/model/formatApply.ts`) applies a format plugin's result through them; `import_format` now uses it. The batch and `import_format` behave exactly as before: same results, messages and error codes. One test of the error registry (`tests/mcp/errorCodes.test.ts`) now counts a code raised only by a model batch rule as used.
