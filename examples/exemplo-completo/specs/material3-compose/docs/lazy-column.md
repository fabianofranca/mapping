# LazyColumn

Lista vertical rolável que só compõe o que aparece. Use para listas longas de List items, cartões ou linhas.

Tipo de anotação: `lazy-column` (camada Layout).

## Campos

| Chave                 | Rótulo                       | Tipo   | Obrigatório | Opções                                                                  | Padrão  | Descrição                                                                                             |
| --------------------- | ---------------------------- | ------ | ----------- | ----------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `verticalArrangement` | Distribuição vertical        | enum   | não         | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Top`   | Como os itens se distribuem no eixo vertical (Arrangement).                                           |
| `horizontalAlignment` | Alinhamento horizontal       | enum   | não         | `Start`, `CenterHorizontally`, `End`                                    | `Start` | Como os itens se alinham no eixo horizontal (Alignment).                                              |
| `spacing`             | Espaçamento entre itens (dp) | number | não         |                                                                         |         | Espaço entre os filhos em dp (Arrangement.spacedBy). Vazio = 0.                                       |
| `contentPadding`      | Margem do conteúdo (dp)      | number | não         |                                                                         |         | Margem interna da lista em dp (PaddingValues). Vazio = 0.                                             |
| `reverseLayout`       | Layout invertido             | enum   | não         | `true`, `false`                                                         | `false` | true começa pelo fim da lista (reverseLayout).                                                        |
| `width`               | Largura                      | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `fill`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`              | Altura                       | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `fill`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`              | Peso (weight)                | number | não         |                                                                         |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.lazy.LazyColumn`
- Arquivo (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/lazy/LazyDsl.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
LazyColumn(
    verticalArrangement = Arrangement.spacedBy(8.dp),
    contentPadding = PaddingValues(16.dp),
    modifier = Modifier.fillMaxSize(),
) {
    item { /* filha 1 */ }
    item { /* filha 2 */ }
    // filhas iguais e repetidas: items(lista) { item -> ... }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Cada marcação filha vira um `item { … }` no `content` (filhas iguais e repetidas viram `items(lista) { … }`). `contentPadding` vira `PaddingValues(<contentPadding>.dp)` e `spacing` vira `Arrangement.spacedBy(<spacing>.dp)` no lugar de `verticalArrangement`. A lista precisa de altura limitada (`fill`, `fixed` ou `weight`). Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Lista da tela**: spacing=8, contentPadding=16, width=fill, height=fill
- **Lista compacta**: verticalArrangement=Top, width=fill, height=fixed
