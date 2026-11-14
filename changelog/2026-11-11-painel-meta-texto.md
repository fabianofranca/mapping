# Queue panel reads the list fields of the meta — 2026-11-11 (épico `epic/painel-meta-texto`, PR #1624, MCP 0.34.3 unchanged, schema v18)

## Corrigido

- The "Queue cost" card, those of "Supervisor requests" and "Rules in force" and the "Why there is a free slot" of the published panel stop showing "—" when the Dashboard type delivers the `meta` lists (`sessions`, `requests`, `rules` and `vagasItens`) as JSON text: the page reads the four fields through a single helper (`asList`), which accepts the list or its JSON text. `tests/tooling/queuePanelPage.test.ts` loads the page with the `meta` in both forms.
