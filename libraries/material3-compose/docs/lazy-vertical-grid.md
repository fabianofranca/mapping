# LazyVerticalGrid

Grade vertical rolável que só compõe o que aparece. Use para galerias e catálogos em colunas.

Tipo de anotação: `lazy-vertical-grid` (camada Layout).

## Campos

| Chave               | Rótulo                        | Tipo   | Obrigatório | Opções                  | Padrão | Descrição                                                                                                  |
| ------------------- | ----------------------------- | ------ | ----------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `columns`           | Colunas                       | number | não         |                         | `2`    | Número de colunas fixas (GridCells.Fixed).                                                                 |
| `minColumnWidth`    | Largura mínima da coluna (dp) | number | não         |                         |        | Se preenchida, as colunas se adaptam a esta largura (GridCells.Adaptive) e o número de colunas é ignorado. |
| `verticalSpacing`   | Espaçamento vertical (dp)     | number | não         |                         |        | Espaço entre as linhas da grade em dp (verticalArrangement).                                               |
| `horizontalSpacing` | Espaçamento horizontal (dp)   | number | não         |                         |        | Espaço entre as colunas da grade em dp (horizontalArrangement).                                            |
| `contentPadding`    | Margem do conteúdo (dp)       | number | não         |                         |        | Margem interna da grade em dp (PaddingValues). Vazio = 0.                                                  |
| `width`             | Largura                       | enum   | não         | `wrap`, `fill`, `fixed` | `wrap` | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).      |
| `height`            | Altura                        | enum   | não         | `wrap`, `fill`, `fixed` | `wrap` | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).        |
| `weight`            | Peso (weight)                 | number | não         |                         |        | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                          |

## Compose

- Símbolo: `androidx.compose.foundation.lazy.grid.LazyVerticalGrid`
- Arquivo (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/grid/LazyGridDsl.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
LazyVerticalGrid(
    columns = GridCells.Fixed(2),            // minColumnWidth = 120: GridCells.Adaptive(120.dp)
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    modifier = Modifier.fillMaxSize(),
) {
    item { /* filha 1 */ }
    item { /* filha 2 */ }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Passe `columns = GridCells.Fixed(<columns>)`; com `minColumnWidth` preenchido use `GridCells.Adaptive(<minColumnWidth>.dp)` no lugar. Cada marcação filha vira um `item { … }` (filhas iguais e repetidas viram `items(lista) { … }`). `verticalSpacing` e `horizontalSpacing` viram `Arrangement.spacedBy(<n>.dp)` em `verticalArrangement` e `horizontalArrangement`, e `contentPadding` vira `PaddingValues(<contentPadding>.dp)`; a grade precisa de altura limitada. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Galeria de duas colunas**: columns=2, verticalSpacing=8, horizontalSpacing=8, contentPadding=16, width=fill, height=fill
- **Grade adaptativa**: minColumnWidth=120, verticalSpacing=12, horizontalSpacing=12, width=fill, height=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Este tipo é do Foundation, não do Material: não tem arquivo de tokens, e o desenho segue o comportamento do foundation, com os valores vindos dos campos.

**Arquivos usados**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/grid/LazyGridDsl.kt` (linhas 67 a 77: `LazyVerticalGrid(columns, contentPadding = PaddingValues(0.dp), reverseLayout = false, verticalArrangement, horizontalArrangement = Arrangement.Start)`; linhas 325 a 335: `GridCells.Fixed(count)`, `n` colunas iguais; linhas 354 a 366: `GridCells.Adaptive(minSize)`, `maxOf((availableSize + spacing) / (minSize + spacing), 1)` colunas).
- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/ScrollingContainer.kt` (linha 56: o `clipScrollableContainer` que o `LazyGrid.kt`, linhas 125 a 150, aplica pelo `scrollingContainer`).

**Como o desenho segue o Compose**

- O slot é uma **grade** (`layout.type: "grid"`, formato 4): `columns` dá `n` colunas iguais (o `GridCells.Fixed`) e, com `minColumnWidth` preenchido, a grade passa a adaptativa, `max(1, floor((conteúdo + gap) / (minColumnWidth + gap)))` colunas (o `GridCells.Adaptive`, mesma conta do `LazyGridDsl.kt`, linha 363). Os dois campos viram duas chaves de trilha por expressão e vale a que tem valor; `minColumnWidth` vence `columns`, como o `code` do tipo.
- `horizontalSpacing` é o `gap` entre as colunas e `verticalSpacing` o `lineGap` entre as linhas; `contentPadding` é o `padding` do slot, dentro da caixa cortada, como o `PaddingValues` do Compose. O **Arrumar** põe cada filha numa célula, da esquerda para a direita e de cima para baixo (a filha menor que a célula fica no início dela).
- O slot tem `clip: true` (formato 4): a filha que passa da caixa do componente é cortada na borda, como o `clipScrollableContainer` do Compose.
- Nenhuma cor, fonte ou raio é desenhado; o rótulo do slot mostra só o tamanho e o `weight` (a grade em si é desenhada pelo layout).

**O que ainda difere do Compose**

- As colunas têm tamanho igual (`1fr`): o formato não tem `GridCells.FixedSize` nem células de larguras diferentes, e a filha não ocupa mais de uma coluna (`span` de marcação filha não existe; o `GridItemSpan` do Compose fica de fora).
- `reverseLayout` e a grade horizontal (`LazyHorizontalGrid`) não são campos deste tipo.
- A filha é a de tamanho próprio dentro da célula (início da célula); o Compose entrega a ela a largura da célula como restrição máxima. Redimensione a filha para ocupar a coluna.
- Rolagem e `state` não existem num desenho estático: o que passa da caixa é cortado e não há como rolar até lá. O `weight` das filhas fica fora (o Arrumar não lê campos das filhas).
