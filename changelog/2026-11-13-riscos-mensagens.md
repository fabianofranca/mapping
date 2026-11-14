# Model messages: maintenance risks — 2026-11-13 (epic `epic/riscos-mensagens`, PR #1797, MCP 0.39.1, schema v19)

## Alterado

- **Model messages (internal cleanups, #1589):** the problems in the declaration of the sources (`origins`) become data (path, text and code), with the code at the emitter, and the code is no longer found by reading the text back; `pathErrorMsg` lives in `specIssueCode.ts` and the text of the bundle path comes only from the catalog; the contract of `SPEC_PATTERN_CODES` is now enforced by a test and the text of the zod enums leaves the catalog; `spec.onlyFormat10` and `spec.onlyFormat15` go away (`spec.onlyFormat` with `{ version }` applies); the key of the warning collector does not allocate in the common case; and `reason` no longer goes into `params` when there is a `detail`. No text changes: the pt-BR `message` of the model, the en-US and pt-BR of the interface and the MCP JSON stay the same.

## Corrigido

- **Specialization source with an unknown key or an invalid anchor that carries `": "` or `"; use "` in the value:** the unknown key with `": "` in the name (`{ "system": "a", "x: y": 1 }`) came out on the wrong path (`origins[0].x`, with the text `y: chave desconhecida: x: y`) and with no code, so the app in en-US showed it in Portuguese; the literal anchor `"a; use b"` came out with the parameters swapped. Now the problem comes out on the right path (`origins[0].x: y`) and in the app's language, in the app's validation and in the MCP's `validate_specialization`/`validate_library`.
