# Rodada completa em 5 blocos — 2026-11-09 (épico `epic/rodada-4-blocos`, PR #1145, MCP 0.28.6, schema v18)

## Adicionado

- `Shift+1` enquadra tudo (o botão **Enquadrar tudo** mostra o atalho e a Ajuda o lista), no par do `Shift+2` (**Enquadrar seleção**), pela tecla física, e nunca com o foco num campo de texto.

## Alterado

- A rodada completa do testador roda em 5 blocos (antes, 3), com limite de 200 mil caracteres no guia gerado de cada bloco, conferido por teste; a passada visual fica no bloco 4.
- Testador da nuvem: o auxiliar `ponto` do `cloud.mjs` converte um ponto em pixels de um container em ponto de tela (lendo o `data-viewport` do canvas), e os passos de gesto do R12, R22 e R23 passam a usá-lo em vez de calibrar por captura.

## Corrigido

- Guia da rodada de teste: o `round-guide.mjs` corta da introdução da seção 8 e do apêndice A os trechos que só roteiros não pedidos usam e aceita faixa de passos (`R6.3-R6.7`); o `mark`/`tempos` do `cloud.mjs` acham a pasta de apoio da rodada sozinhos quando `APOIO` não está exportado.
- Incompletas: a anotação numa camada que não existe também aparece na lista (antes o contador somava e a lista a omitia).
- Detalhes e Incompletas a 900×720: a coluna de motivos da Incompletas ganha mais largura e não quebra mais a palavra no meio.
- Componentes: um trecho de texto literal só de espaços (o vão entre uma palavra em negrito e um chip, por exemplo) não some mais do layout; o campo vazio ou só de espaços continua caindo no padrão.
- Componentes: o **Arrumar** de um Row com chips (o Row "Filtros" do exemplo) não grava mais largura 1 nos chips: um componente `hug` cujo conteúdo é um quadro esticado por âncoras volta a medir o conteúdo.
- Canvas, perspectivas: o selo "Veio de …" de uma raiz pequena fica 10 px abaixo do canto (livre das alças da seleção) e, se isso cairia sobre outra raiz ou o nome dela, vai para o lado.
