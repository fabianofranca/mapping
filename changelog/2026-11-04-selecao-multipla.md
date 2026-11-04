# Seleção múltipla — 2026-11-04 (épico `epic/selecao-multipla`, PR #448, MCP 0.13.0, schema v13)

## Adicionado

- **Ctrl+clique e Cmd+clique juntam e tiram itens da seleção**, como o Shift+clique, no canvas (inclusive sobre uma alça) e na Árvore. No macOS, o Ctrl+clique segue sendo o clique direito e não junta (use o Cmd+clique). Na revisão de propostas nenhum dos três vale, e Ctrl+roda continua sendo zoom.
- **As setas do teclado movem a seleção:** `←↑→↓` move todos os itens selecionados 1 px e `Shift+←↑→↓` move 10 px, em cada item no espaço dele (pixels da imagem para marcação de container; unidades do canvas para marcação do canvas, flutuante e container). O container leva as marcações e a marcação de container leva as descendentes; a seta (o traço) não anda. É tudo ou nada: se algum item não puder andar (trancado, sairia do container, container passaria a sobrepor outro), nada se move, sem aviso. Apertar e soltar vira uma entrada no desfazer; segurar a tecla é um gesto só, fechado ao soltar. Só vale com o foco no canvas ou em nenhum controle, em Navegar e Desenhar; não vale em campo de texto, Árvore, menu, abas, somente leitura nem na revisão de propostas.
- **Seleção por retângulo:** Shift+arrasto, em qualquer modo (Navegar e Desenhar), desenha um retângulo e, ao soltar, soma à seleção os itens inteiros dentro dele, sem os que já vão junto com outro item da seleção (a marcação de um container que entrou, por exemplo). Esc cancela. Sobre um item selecionado ou uma alça, o Shift+arrasto continua movendo e redimensionando. A lista de atalhos ganha "Selecionar por retângulo".
- A lista de atalhos ganha "Mover a seleção" (setas; Shift+setas, 10 px) e o Shift+clique passa a citar Ctrl/Cmd.

## Corrigido

- O **Esc cancela o retângulo de seleção** (e os outros gestos de ponteiro em andamento) também com o Shift apertado: o `Shift+Esc` só esconde a janela em foco quando não há gesto. A introdução da Ajuda › Atalhos não contradiz mais o Cmd+clique da seleção no macOS.
