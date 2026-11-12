# Grafo de dependências no painel da fila — [Não lançado] (épico `epic/painel-grafo-da-fila`, PR #0, MCP 0.38.2 sem mudança, schema v19)

## Adicionado

- Painel da fila: o `meta` ganha o grafo da fila, recalculado em toda gravação (`painel.py`): `grafoNos` traz as etapas não concluídas com a onda (0 é o que roda agora), a ordem prevista de entrada (`rank`), o estado e o motivo de espera, e `grafoSetas` traz as dependências (só as essenciais) e os arquivos em comum com a etapa que roda. O `show`, o `meta.vagas` e o `meta.vagasItens` não mudam.
