# Acabamento visual — [Não lançado] (épico `epic/acabamento-visual`, PR #0, MCP 0.16.0, schema v13)

## Alterado

- Cabeçalho de camada dos Detalhes: a prioridade é nome > flag > selo. A flag "escondida" da revisão mantém o texto inteiro (é um estado da camada); o selo da especialização é o primeiro a encolher, depois o nome, e o que é cortado mostra o texto inteiro na dica.
- Faixas laterais: a dica dos botões sai ao lado do botão (e não embaixo), então não cobre mais o campo de busca do Catálogo nem o conteúdo das janelas.

## Corrigido

- Menus (canvas e Árvore): o atalho da entrada (por exemplo, Ctrl+G em **Envolver**) fica à direita do botão, e não colado ao rótulo.
- Detalhes: com o painel estreito (a 900 px, na revisão ou fora dela), X, Y, L e A mostram valores de 4 dígitos por inteiro; antes o terceiro dígito de Y e L ficava cortado.
