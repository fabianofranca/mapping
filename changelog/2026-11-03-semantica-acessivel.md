# Semântica acessível — 2026-11-03 (épico `epic/semantica-acessivel`, PR #355, MCP 0.13.0, schema v13)

## Alterado

- Guia interativo: uma nota embaixo da tabela de atalhos explica o atalho de janela. Com o foco fora da janela, o atalho leva o foco a ela e a abre, se estiver fechada; com o foco dentro, ele esconde a janela.
- Ajuda › Atalhos: a linha de cada janela diz as duas coisas ("Ir para Árvore de marcações (com o foco, esconde)", numa linha só, também em pt-BR a 900 px). O comportamento do atalho não muda.

## Corrigido

- Detalhes: o seletor segmentado de um campo (por exemplo `estilo` do Button) não passa mais da borda do painel nem cria barra de rolagem horizontal: em coluna estreita as opções quebram de linha, cada uma inteira e clicável. A tabela de um campo `table` continua rolando na própria caixa.
- Leitor de tela: os menus em popover (o do projeto, no nome do projeto, e o **Em lote** da revisão em janela estreita) agora são menus de verdade. Os itens são anunciados como itens de menu, o foco vai ao primeiro ao abrir, ↑/↓ andam entre eles em círculo e Esc fecha e devolve o foco ao botão, que anuncia que abre um menu.
- Comando de voz: o nome dos botões com texto da revisão passa a começar pelo texto visível, no formato "texto: alvo" — "Aceitar imagem: Confirmação", "Rejeitar marcação: Topo", "Sobrescrever: Nome", "Manter atual: Nome". O estado (aceita ou rejeitada) fica só no estado do botão, e o efeito do conflito (sobrescreve ou mantém o valor atual) na descrição. O mesmo vale para o botão do menu do projeto ("Meu projeto: ações do projeto"), o do **Em lote**, o zoom ("100%: zoom atual…") e o **Adicionar** da paleta da Biblioteca ("Adicionar: Button").
