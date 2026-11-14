# Queue panel reads the list fields of the meta — 2026-11-11 (epic `epic/painel-meta-texto`, PR #1624, MCP 0.34.3 unchanged, schema v18)

## Corrigido

- The "Custo da fila" card, those of "Pedidos do supervisor" and "Regras em vigor" and the "Por que há vaga livre" of the published panel stop showing "—" when the Dashboard type delivers the `meta` lists (`sessions`, `requests`, `rules` and `vagasItens`) as JSON text: the page reads the four fields through a single helper (`asList`), which accepts the list or its JSON text. `tests/tooling/queuePanelPage.test.ts` loads the page with the `meta` in both forms.
