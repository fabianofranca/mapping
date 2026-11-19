# ImageCompare

Comparação antes/depois de uma imagem trocada (`src/ui/review/ImageCompare.tsx`, aberto pelo CompareDialog de `ReviewCanvasControls.tsx`; `.image-compare*` de `src/theme/review.css`).

- `modo` `deslizar` (o padrão): a área (`color-canvas-bg`, borda `color-border-control`, raio 4) com o depois por baixo e o antes recortado até a divisória; a divisória de 2 px (`cv-line`, halo `cv-halo`) e a alça redonda de 28 px (`color-surface`, borda de controle, sombra de popup, ícone `compare`) no meio; as etiquetas "Antes" e "Depois" (`t-micro` em `cv-line` sobre `cv-badge`, raio 2) nos cantos de cima, a 8 px.
- `modo` `sobrepor`: a mesma área, sem a divisória; a alça no meio controla a mistura.
- `modo` `lado-a-lado`: as duas imagens em duas colunas (8 px entre elas), cada uma com a etiqueta embaixo.

O desenho mostra a moldura no ponto de 50% (o padrão do app); as imagens são bitmaps e não são desenhadas. Ficam como marcações filhas o Segmented do modo (Lado a lado / Deslizar / Sobrepor), os nomes "Antes: … · Depois: …" (Texto `t-small` `muted`) e a decisão da troca (o DecisionControl em texto).

**Não conferido numa captura:** a fixture medida não tem imagem trocada; o desenho saiu do CSS e do código da 0.25.0.
