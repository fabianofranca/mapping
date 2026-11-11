# Painel da fila lê os campos-lista do meta — 2026-11-11 (épico `epic/painel-meta-texto`, PR #1624, MCP 0.34.3 sem mudança, schema v18)

## Corrigido

- O card "Custo da fila", os de "Pedidos do supervisor" e "Regras em vigor" e o "Por que há vaga livre" do painel publicado deixam de ficar com "—" quando o tipo Dashboard entrega as listas do `meta` (`sessions`, `requests`, `rules` e `vagasItens`) como texto JSON: a página lê os quatro campos por um ajudante único (`asList`), que aceita a lista ou o texto JSON dela. O `tests/tooling/queuePanelPage.test.ts` carrega a página com o `meta` nas duas formas.
