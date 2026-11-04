# Marcações espaciais, notas e setas — 2026-10-23 (PR #217, MCP 0.9.0, schema v13)

## Adicionado

- Marcação que pertence ao canvas (sem container) e que pode envolver containers; o pertencimento é resolvido pela geometria e gravado (o agente lê `parent`/`members`, nunca calcula).
- Seleção múltipla e arrasto conjunto.
- Notas: biblioteca embutida de marcações flutuantes (`floating`).
- Setas como marcações que apontam (coleção `arrows`, `appliesTo`) e tabelas com `repeat`.
- Especialização `formatVersion` 7, proposta `formatVersion` 3 e componente `formatVersion` 2.

## Alterado

- A herança entre marcações foi removida (schema v13).
