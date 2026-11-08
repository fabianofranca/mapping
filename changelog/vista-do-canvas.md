# Vista do canvas para o testador — [Não lançado] (épico `epic/vista-do-canvas`, PR #1070, MCP 0.28.4 sem mudança, schema v18)

## Adicionado

- O `.canvas-host` publica `data-viewport` (`"x y escala"`: a translação e a escala do canvas, em px CSS relativos ao canto do host) e `data-selection-box` (`"esquerda topo largura altura"`: a caixa da seleção primária, marcação, container ou flutuante, em px CSS relativos ao host, já com o container somado). Quem testa acha na tela onde clicar ou arrastar sem captura nem calibragem, inclusive para marcações dentro de um container. São só leitura para teste; nada é gravado no `mapping.json`.
- A receita "Onde está uma marcação na tela" (`docs/TESTING.md`, apêndice A) traz um trecho de Playwright pronto para copiar: seleciona pela **Árvore**, espera um quadro, lê `data-selection-box` e `getBoundingClientRect()` do `.canvas-host` e devolve o centro e as oito alças da marcação, com a conversão de um ponto do canvas para a tela por `data-viewport`. Os passos dos roteiros não mudam.
