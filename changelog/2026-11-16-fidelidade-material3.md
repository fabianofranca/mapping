# Fidelity notices of Material 3 (Compose) — 2026-11-16 (épico `epic/fidelidade-material3`, PR #2011, MCP unchanged, schema v20)

## Adicionado

- `material3-compose` library (version 18): 107 `diverges` notices in the specialization, one per place where the drawing differs from Compose: the 21 types that have the `weight` field say that the drawing does not apply it (mark the real width or height), the `list-item` says that `leadingContent` and `trailingContent` accept any composable while the type draws only icon, avatar and text, and 85 more cover sizes, wrapping, spacing and states that the drawing approximates, each one citing the type's document (`ref`).
- A test (`tests/model/material3ComposeLibrary.test.ts`) that fails when a notice of the library has a `ref` that is neither the type's document nor a signature sheet, and when a type with a `weight` field or the `list-item` lacks its notice.

## Alterado

- The Material 3 (Compose) annotations now show notices: the **Notices** window and the status bar count them (the 20 annotations of `full-example` have one), the type list of the **Catalog** shows the badge on every component (46 "Diverges" and 4 "Removed"), and `plan_changes`/`propose_changes` return them in `notices.new`. The update from version 17 is additive (`diffSpecs` is empty).
- `docs/snackbar.md`: the item of the Fidelity section about the action on a new line left, since the field description already says what the drawing does.
- `docs/TESTING.md`: the `evolve.py` chain is relative to the folder's `version`; R9.23, R10.1, R11.4 and the new R17.59 (`list-item` notice in Details, in the Notices window and in `get_code_hints`) follow the notices.
