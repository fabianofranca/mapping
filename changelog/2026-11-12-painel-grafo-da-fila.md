# Dependency graph in the queue panel — 2026-11-12 (épico `epic/painel-grafo-da-fila`, PR #1773, MCP 0.38.2 unchanged, schema v19)

## Adicionado

- Queue panel: the `meta` gains the queue graph, recalculated on every write (`painel.py`): `grafoNos` brings the unfinished stages with the wave (0 is what runs now), the expected entry order (`rank`), the state and the reason for waiting, and `grafoSetas` brings the dependencies (only the essential ones) and the files in common with the stage that runs. `show`, `meta.vagas` and `meta.vagasItens` do not change.

## Alterado

- Queue panel: the "Por que há vaga livre" card becomes the "Dependências e ordem de entrada" card, the graph of the stages in waves ("Agora", "Onda 1", …): each stage shows the state, the reason for waiting and, on those that are waiting, the expected entry order; solid arrows for dependency, dashed for a file in common, and the longest arrow becomes "espera #…" on the card. Legible without horizontal scrolling on a tablet (768 to 1366 px) and usable by touch: a touch on a card shows all of its arrows and the issue link. The subtitle keeps "Vagas k/N". After the merge, whoever closes the stage swaps the published panel's `files/index.html`.
