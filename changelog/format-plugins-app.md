# Format plugins in the app — [Não lançado] (épico `epic/format-plugins-app`, PR #2607, MCP 0.58.0 provisional, schema v23 unchanged, specialization `formatVersion` 22 expected)

## Alterado

- The rules of the MCP batch for `add_container` with only a background, `create_marking` and `update_marking` now live in the model (`src/model/batchMarkings.ts`), so the app and the format import can apply them too. The batch behaves exactly as before: same results, same messages, same error codes.
