# Vista do canvas para o testador — 2026-11-11 (épico `epic/vista-do-canvas-2`, PR #1612, MCP 0.34.3, schema v18)

## Adicionado

- O `.canvas-host` publica três atributos de teste novos, só leitura, para quem testa e conduz o fluxo (nada muda na tela):
  - `data-selection`: `"<tipo> <id>"` da seleção primária (`image`, `marking` ou `arrow`); some sem seleção ou com o item fora do projeto desenhado. Diz qual item o clique selecionou quando há sobreposição.
  - `data-arrow-handles`: com uma seta desenhada como seleção primária, as entradas `"<nome> <x> <y>"` separadas por `;`, em px CSS relativos ao canto do host (como o `data-selection-box`): `center` (o meio do traço, onde o clique pega a seta), `from`, `to`, `point<i>`, `mid<i>` e `segment<i>`. Some com **Mostrar setas** desligado ou sem seta selecionada.
  - `data-container-boxes`: uma entrada `"<id> <x> <y> <largura> <altura> <escala>"` por container colocado, em unidades do canvas e na colocação desenhada (perspectiva aberta e revisão). Pan e zoom não o refazem.
- Auxiliares novos do testador em `scripts/testing/cloud.mjs`, para achar um ponto na tela sem capturar:
  - `onCanvas(page, { x, y })` devolve `{ ok, element }`: o ponto cai no canvas ou o minimapa, uma janela ou a barra estão por cima? É a conferência única do `ponto`, do `drag` e do `paletteDrag`.
  - `viewCenter(page)` devolve o centro da vista, em px de tela e em unidades do canvas.
  - `arrowHandlesOf(page)` devolve o meio e as alças da seta selecionada já em ponto de tela, ou `null` (com `parseArrowHandles` e `parseContainerBoxes`, as partes puras).
- A linha `Seleção:` do `state()`, depois do `Foco:`, diz o que o clique selecionou: `marcação "Lado" (<id>)`, `seta "A → B" (<id>)`, `container "Tela" (<id>)` ou `nenhuma` (sem pasta ou com item da proposta na revisão, `marking <id>`).
- O apêndice A do `docs/TESTING.md` ganha os três atributos, o centro da vista, a área visível, a sobreposição, o exemplo com a seta e o `menuitemradio` do menu do traço.

## Alterado

- O `ponto` dá o ponto da posição **desenhada** (lê o `data-container-boxes`), também com outra perspectiva aberta e na revisão. Avisa no stderr quando a `--perspectiva` pedida não é a desenhada e quando o ponto cai fora do canvas. A saída da CLI continua `<x> <y>`.
- O `drag` lança, antes de qualquer ação do mouse, quando o ponto de partida não cai no canvas (`{ allowOffCanvas: true }` segue) e avisa quando o clique de seleção não selecionou nada.
