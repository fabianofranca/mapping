# Fidelity notices — 2026-11-10 (épico `epic/avisos-fidelidade`, PR #1510, MCP 0.32.0, schema v18)

## Adicionado

- `docs/SPEC-FORMAT.md` gains the subsection "Avisos de fidelidade e origens do aviso": the criterion for what becomes a notice, the `ref` (the type's doc), the `<platform>: ` prefix in the `message`, the two origins (tool-generated × hand-curated) and how the app shows both (the same list in the Notices window; the origin only in Details).
- The `spec-author` skill and `docs/AGENT-GUIDE.md` carry the rule: run each difference in the doc through the criterion, ignore notices with another platform's prefix and tell the user whatever is `diverges`.
- `get_code_hints` (MCP 0.32.0) brings `notices` in each type of `types` that has a notice: those of the type, of the fields and of the `table` columns, by severity, with `kind`, `message`, `since?`, `ref?` and the place (`key?`, `column?`). Types without `code` on the platform (`unmappedTypes`) bring no notices, and filtering by platform is the agent's job (prefix of the `message`). With no notice in the specialization, the output does not change.

## Alterado

- The rule for rewriting notices applies to the origin of each one: the tool rewrites those of its own `ref`, and a hand-curated notice only goes away when the author reviews the doc and the difference is gone (before, the texts said to rewrite all of them every round).
