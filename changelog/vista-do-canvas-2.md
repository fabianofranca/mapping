# Vista do canvas para o testador — [Não lançado] (épico `epic/vista-do-canvas-2`, PR #1612, MCP sem mudança, schema v18)

## Adicionado

- O `.canvas-host` publica três atributos de teste novos, só leitura, para quem testa e conduz o fluxo (nada muda na tela):
  - `data-selection`: `"<tipo> <id>"` da seleção primária (`image`, `marking` ou `arrow`); some sem seleção ou com o item fora do projeto desenhado. Diz qual item o clique selecionou quando há sobreposição.
  - `data-arrow-handles`: com uma seta desenhada como seleção primária, as entradas `"<nome> <x> <y>"` separadas por `;`, em px CSS relativos ao canto do host (como o `data-selection-box`): `center` (o meio do traço, onde o clique pega a seta), `from`, `to`, `point<i>`, `mid<i>` e `segment<i>`. Some com **Mostrar setas** desligado ou sem seta selecionada.
  - `data-container-boxes`: uma entrada `"<id> <x> <y> <largura> <altura> <escala>"` por container colocado, em unidades do canvas e na colocação desenhada (perspectiva aberta e revisão). Pan e zoom não o refazem.
