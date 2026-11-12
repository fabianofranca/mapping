# Grafo de dependências no painel da fila — [Não lançado] (épico `epic/painel-grafo-da-fila`, PR #0, MCP 0.38.2 sem mudança, schema v19)

## Adicionado

- Painel da fila: o `meta` ganha o grafo da fila, recalculado em toda gravação (`painel.py`): `grafoNos` traz as etapas não concluídas com a onda (0 é o que roda agora), a ordem prevista de entrada (`rank`), o estado e o motivo de espera, e `grafoSetas` traz as dependências (só as essenciais) e os arquivos em comum com a etapa que roda. O `show`, o `meta.vagas` e o `meta.vagasItens` não mudam.

## Alterado

- Painel da fila: o card "Por que há vaga livre" vira o card "Dependências e ordem de entrada", o grafo das etapas em ondas ("Agora", "Onda 1", …): cada etapa mostra o estado, o motivo de espera e, nas que aguardam, a ordem prevista de entrada; setas cheias para dependência, tracejadas para arquivo em comum, e a seta mais longa vira "espera #…" no card. Legível sem rolagem horizontal no tablet (768 a 1366 px) e usável por toque: o toque num card mostra todas as setas dele e o link da issue. O subtítulo segue com "Vagas k/N". Depois do merge, quem fecha a etapa troca o `files/index.html` do painel publicado.
