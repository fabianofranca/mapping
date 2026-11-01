# LazyRow

Lista horizontal rolável que só compõe o que aparece. Use para carrosséis simples de cartões, chips e miniaturas.

Tipo de anotação: `lazy-row` (camada Layout).

## Campos

| Chave                   | Rótulo                       | Tipo   | Obrigatório | Opções                                                                 | Padrão  | Descrição                                                                                             |
| ----------------------- | ---------------------------- | ------ | ----------- | ---------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Distribuição horizontal      | enum   | não         | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Start` | Como os itens se distribuem no eixo horizontal (Arrangement).                                         |
| `verticalAlignment`     | Alinhamento vertical         | enum   | não         | `Top`, `CenterVertically`, `Bottom`                                    | `Top`   | Como os itens se alinham no eixo vertical (Alignment).                                                |
| `spacing`               | Espaçamento entre itens (dp) | number | não         |                                                                        |         | Espaço entre os filhos em dp (Arrangement.spacedBy). Vazio = 0.                                       |
| `contentPadding`        | Margem do conteúdo (dp)      | number | não         |                                                                        |         | Margem interna da lista em dp (PaddingValues). Vazio = 0.                                             |
| `reverseLayout`         | Layout invertido             | enum   | não         | `true`, `false`                                                        | `false` | true começa pelo fim da lista (reverseLayout).                                                        |
| `width`                 | Largura                      | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`                | Altura                       | enum   | não         | `wrap`, `fill`, `fixed`                                                | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`                | Peso (weight)                | number | não         |                                                                        |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

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
