# Canvas em projeto grande — [Não lançado] (épico `epic/canvas-escala`)

## Pendências

- **DA3 — tokens** (seção Tokens do mapa em `docs/DESIGN-SYSTEM.md`, tamanhos): `size-lod-min-marking` (24px; marcação menor que isto na tela, na largura ou na altura, desenha só a borda) e `size-lod-hide-marking` (2px; menor que isto nas duas medidas, não é desenhada). Ambos lidos pelo canvas (`canvas/theme.ts`), nos dois temas.
- **DA3 — `CanvasMarking` e `Canvas.md`:** a regra do nível de detalhe. De longe a marcação pequena aparece só com a borda (sem halo, linha dupla, selo "a revisar" nem ⚠) e a quase invisível não aparece; a selecionada, a sob o mouse e a com marca da revisão aparecem sempre completas.
- **DA4 — `Canvas.md`:** durante um gesto (mover, redimensionar, rota e ponta de seta), o que se arrasta é desenhado por cima de tudo até soltar (inclusive das marcações flutuantes e dos desenhos de componente que não se movem); ao soltar ou cancelar, a ordem de desenho volta à de sempre. Sem token, ícone nem componente novo.

## Sincronização

Preenchida no fechamento do épico.

## Ficou sem gravar

Preenchida no fechamento do épico.
