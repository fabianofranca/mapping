# Layout alinhado a Flexbox e CSS Grid — [Não lançado] (épico `epic/layout-flex-grid`, PR #1673, MCP 0.36.0, schema v18)

## Adicionado

- **Sobreposição alinhada.** Um quadro `layout: { "type": "none" }` aceita `align` (eixo vertical) e `justify` (eixo horizontal) com `start`, `center`, `end` e `stretch`, escritos direto ou por expressão. É o `Box(contentAlignment)` do Compose, o `place-items` do CSS Grid e o `ZStack(alignment:)` do SwiftUI: o selo centrado num ícone não precisa mais de conta de `anchors`. As `anchors` do filho continuam valendo e vencem o alinhamento no eixo em que existem. Só na `formatVersion` 4 do componente; antes dela, o erro é `só é permitido com formatVersion 4`.
- **`clip` no slot e por expressão.** O slot ganha `clip` (padrão `false`): com ele, as marcações filhas desenhadas dentro do slot são recortadas pela caixa do slot, na app, no visualizador e no PNG do MCP (`render_container`, `render_marking`). O `clip` do quadro também passa a aceitar expressão. Não há rolagem. Só na `formatVersion` 4 do componente.
- O `docs/COMPONENT-FORMAT.md` ganha o mapa de conceitos (sobreposição, fileira e coluna, ordem invertida, quebra, corte) com as chaves equivalentes de CSS, Compose, SwiftUI e Flutter.

## Alterado

- O desenho dos componentes ficou mais rápido ao medir texto repetido: o mesmo texto, com a mesma fonte e o mesmo limite de largura, é medido uma vez só, na app e no servidor MCP (nos 15 componentes do exemplo Material 3, as medidas por instância caíram de 69 para 26). Nenhum desenho muda.

## Corrigido

- A prova de desenho e a validação da biblioteca (#1093) agora avisam `conteúdo maior que a caixa: <quadro>` também quando o pai do filho que passa é `layout: none`, como já faziam em `row` e `column`. O aviso aparece na pendência "o componente não cabe" da app, no `component-overflow` do `plan_changes` e do `propose_changes` e nos avisos da `validate_library`.
