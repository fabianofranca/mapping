# Migration to Preact 11 — [Não lançado] (épico `epic/preact-11`, PR #2805, MCP 0.59.2, schema v24)

## Alterado

- The interface now runs on Preact 11 (`preact` 11.2.0, `@preact/signals` 2.11.4, `@testing-library/preact` 3.2.6), with no change in behavior, text, layout or tokens. The MCP server, the formats and the schema do not change.
- Dependabot proposes the major versions of Preact again (the `ignore` rule of `preact` left `.github/dependabot.yml`; the TypeScript one stays).

## Corrigido

- In a narrow Marking tree (a 180 px window), the name and the layer dots of a row no longer run under the row's padlock and ⋯ buttons.
- In a narrow List, the "Annotation" column header ends in an ellipsis instead of being cut ("Annotatio").
