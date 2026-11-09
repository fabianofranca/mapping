# Canvas em projeto grande — [Não lançado] (épico `epic/canvas-escala`, PR #1195, MCP 0.28.9 sem versão nova, schema v18)

## Alterado

- Com o projeto grande à vista, arrastar, editar e navegar no canvas ficam mais rápidos: no projeto de 2.000 marcações, o quadro de um arrasto cai de dezenas de milissegundos para poucos, e editar um nome redesenha só a camada das marcações e as sobreposições. Abrir um projeto grande já aproximado também fica mais rápido, porque o canvas só prepara o desenho das marcações que aparecem na tela.
- De longe, a marcação pequena aparece só com a borda (sem halo, linha dupla, selo "a revisar" nem ⚠) e a quase invisível, menor que 2 px, não aparece; a selecionada, a que está sob o mouse e a com marca da revisão aparecem sempre completas. Aproximado, nada muda.
- Durante um arrasto (mover, redimensionar, mexer na rota ou na ponta de uma seta), só o que se move é redesenhado: o custo de cada quadro deixa de depender do tamanho do projeto. O que se arrasta aparece por cima de tudo até soltar (inclusive das marcações flutuantes e dos desenhos de componente que não se movem); ao soltar ou cancelar, tudo volta ao lugar de antes.
