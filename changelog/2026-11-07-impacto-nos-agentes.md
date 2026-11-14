# Impact on agents — 2026-11-07 (épico `epic/impacto-nos-agentes`, PR #696, MCP 0.23.1, schema v14)

## Alterado

- The agent guide (`mapping-docs://AGENT-GUIDE.md`) states the current version of the specialization format (12), and the `spec-author` skill lists what each `formatVersion` from 1 to 12 adds.
- The guide covers the workspace rules it was missing: where to save the specialization source (`especializacoes/`, never `specs/`), `validate_specialization` only validates a library's file, `canvas-marking` and arrow without an image, and opening the agent in the code repository.

## Corrigido

- The `spec-author` skill said that the MCP does not apply a library package (`formatVersion` 4) through a proposal; it applies and updates it (`apply_specialization` and `update_specialization` with the folder in `file`). It also fixed the versions of the examples and libraries, the `material3-compose` folders, the `table` columns (includes `ref`), the platform's `language?`, the drawing proof (only the `size`), and it teaches the v4 migration steps (`rename-type`, `remove-type`, `rename-field`, `remove-field`, `map-values`, `fill-field`).
- The guide described assembling children in a slot by `parent` and without `rect`; the server ignores `parent` and, without `rect`, places in the center, so every child carries `rect`. It also fixed the return of `list_components`, the `invalid-arguments` cases, the use of `near`, `annotation.layer`, the references in the `get_code_hints` example, the `p` letter of the references, and the `ignored-argument` and `proposal-field-ignored` warnings.
- `docs/SPEC-FORMAT.md` gave the wrong versions to the examples (`sdui.json` is 12, the Kotlin one is 8) and said that the drawing proof uses the `minSize`.
- The descriptions of the MCP resources `FORMAT.md` and `SPEC-FORMAT.md` now cite the current version of the schema and of the specializations (before, they said v9 and 1 to 8), the description of `validate_specialization` lists all the warnings, and the Specializations help no longer says that the shared validation is still to come.
