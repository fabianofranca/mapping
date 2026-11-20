# spec-author aligned with formatVersion 18 — [Não lançado] (épico `epic/spec-author-align`, PR #0, MCP 0.50.1, schema v22 unchanged)

## Corrigido

- A specialization with `ignore` next to `signature` in a type's `sources` (the Figma design sheet) validates in `validate_specialization`, `validate_library` and `plan_signature_import`, also when the `system` is not declared in `origins`; before, it failed with `only allowed in a system declared in origins`. Without `signature` and outside `origins`, `ignore` is still refused, now with the message `only allowed in a system declared in origins or next to signature` (from `formatVersion` 16); `slot` and the versions before 16 behave as before.
