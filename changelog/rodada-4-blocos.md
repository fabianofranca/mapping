# Rodada completa em 5 blocos — [Não lançado] (épico `epic/rodada-4-blocos`, PR #1145, MCP 0.28.6, schema v18)

## Adicionado

- `Shift+1` enquadra tudo (o botão **Enquadrar tudo** mostra o atalho e a Ajuda o lista), no par do `Shift+2` (**Enquadrar seleção**), pela tecla física, e nunca com o foco num campo de texto.

## Alterado

- A rodada completa do testador roda em 5 blocos (antes, 3), com limite de 200 mil caracteres no guia gerado de cada bloco, conferido por teste; a passada visual fica no bloco 4.

## Corrigido

- Guia da rodada de teste: o `round-guide.mjs` corta da introdução da seção 8 e do apêndice A os trechos que só roteiros não pedidos usam e aceita faixa de passos (`R6.3-R6.7`); o `mark`/`tempos` do `cloud.mjs` acham a pasta de apoio da rodada sozinhos quando `APOIO` não está exportado.
