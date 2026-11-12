# LazyRow

Lista horizontal rolável que só compõe o que aparece. Use para carrosséis simples de cartões, chips e miniaturas.

Tipo de anotação: `lazy-row` (camada Layout).

## Campos

| Chave                   | Rótulo                       | Tipo   | Obrigatório | Opções                                                                 | Padrão  | Descrição                                                                                                                                                                               |
| ----------------------- | ---------------------------- | ------ | ----------- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Distribuição horizontal      | enum   | não         | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | —       | Como os itens se distribuem no eixo horizontal (Arrangement). Vazio = o padrão do Compose: Start, ou End com reverseLayout; Start explícito com reverseLayout mantém o bloco no começo. |
| `verticalAlignment`     | Alinhamento vertical         | enum   | não         | `Top`, `CenterVertically`, `Bottom`                                    | `Top`   | Como os itens se alinham no eixo vertical (Alignment).                                                                                                                                  |
| `spacing`               | Espaçamento entre itens (dp) | number | não         |                                                                        |         | Espaço entre os filhos em dp (Arrangement.spacedBy). Vazio = 0.                                                                                                                         |
| `contentPadding`        | Margem do conteúdo (dp)      | number | não         |                                                                        |         | Margem interna da lista em dp (PaddingValues). Vazio = 0.                                                                                                                               |
| `reverseLayout`         | Layout invertido             | enum   | não         | `true`, `false`                                                        | `false` | true começa pelo fim da lista (reverseLayout).                                                                                                                                          |
| `width`                 | Largura                      | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                   |
| `height`                | Altura                       | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                     |
| `weight`                | Peso (weight)                | number | não         |                                                                        |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                       |

## Compose

- Símbolo: `androidx.compose.foundation.lazy.LazyRow`
- Arquivo (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
LazyRow(
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxWidth(),
) {
    item { /* filha 1 */ }
    item { /* filha 2 */ }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Cada marcação filha vira um `item { … }` no `content` (filhas iguais e repetidas viram `items(lista) { … }`). `contentPadding` vira `PaddingValues(<contentPadding>.dp)` e `spacing` vira `Arrangement.spacedBy(<spacing>.dp)` no lugar de `horizontalArrangement`. A lista precisa de largura limitada (`fill` ou `fixed`). Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Carrossel de chips**: spacing=8, contentPadding=16, verticalAlignment=CenterVertically, width=fill
- **Faixa de cartões**: horizontalArrangement=Start, spacing=12, width=fill, height=fixed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Este tipo é do Foundation, não do Material: não tem arquivo de tokens, e o desenho segue o comportamento do foundation, com os valores vindos dos campos.

**Arquivos usados**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt` (linhas 328 a 338: `LazyRow(contentPadding = PaddingValues(0.dp), reverseLayout = false, horizontalArrangement = if (!reverseLayout) Arrangement.Start else Arrangement.End, verticalAlignment = Alignment.Top)`).
- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Arrangement.kt` (linhas 110 a 290: `Start`, `End`, `Top`, `Bottom`, `Center`, `SpaceEvenly`, `SpaceBetween`, `SpaceAround`; linha 296: `spacedBy`).

**Como o desenho segue o Compose**

- `horizontalArrangement` vira o `justify` do slot (`Start` `start`, `Center` `center`, `End` `end`, `SpaceBetween` `space-between`) e `verticalAlignment` vira o `align` (`Top` `start`, `CenterVertically` `center`, `Bottom` `end`), por `$switch` (formato 4: expressão em `layout.justify` e `layout.align`).
- `spacing` é o `gap` e `contentPadding` é o `padding` do slot.
- `reverseLayout` liga o `layout.reverse` do slot; com a distribuição padrão (campo vazio) o bloco fica no fim do eixo, como o `Arrangement.End` que o Compose usa nessa combinação. Com `Start` explícito o bloco fica no começo, na ordem invertida; com `End` explícito, no fim.
- O slot tem `clip: true` (formato 4): a filha que passa da caixa do componente é cortada na borda, como o `clipScrollableContainer` que o `scrollingContainer` aplica ao `LazyRow` (`ScrollingContainer.kt` linha 56; `LazyList.kt` linhas 143 a 154). A caixa cortada é a do componente inteiro, com o `contentPadding` dentro dela, como no Compose.
- Nenhuma cor, fonte ou raio é desenhado.

**O que ainda difere do Compose**

- `SpaceAround` e `SpaceEvenly` viram `space-around` e `space-evenly` do `justify`.
- A ordem das filhas se inverte com `reverseLayout` (`layout.reverse`), como no Compose.
- Rolagem, `state` e `flingBehavior` não existem num desenho estático: o que passa da caixa é cortado e não há como rolar até lá.
