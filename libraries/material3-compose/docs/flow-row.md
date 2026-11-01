# FlowRow

Linha que quebra para a linha de baixo quando os filhos não cabem. Use para grupos de chips e etiquetas.

Tipo de anotação: `flow-row` (camada Layout).

## Campos

| Chave                   | Rótulo                         | Tipo   | Obrigatório | Opções                                                                  | Padrão  | Descrição                                                                                             |
| ----------------------- | ------------------------------ | ------ | ----------- | ----------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `horizontalArrangement` | Distribuição horizontal        | enum   | não         | `Start`, `End`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`  | `Start` | Como os filhos se distribuem em cada linha (Arrangement).                                             |
| `verticalArrangement`   | Distribuição vertical          | enum   | não         | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Top`   | Como as linhas se distribuem no eixo vertical (Arrangement).                                          |
| `itemVerticalAlignment` | Alinhamento vertical dos itens | enum   | não         | `Top`, `CenterVertically`, `Bottom`                                     | `Top`   | Como os itens se alinham dentro de cada linha (Alignment).                                            |
| `maxItemsInEachRow`     | Máximo de itens por linha      | number | não         |                                                                         |         | Limite de itens em cada linha (Int). Vazio = sem limite.                                              |
| `maxLines`              | Máximo de linhas               | number | não         |                                                                         |         | Limite de linhas (Int). Vazio = sem limite.                                                           |
| `spacing`               | Espaçamento horizontal (dp)    | number | não         |                                                                         |         | Espaço entre os itens de uma linha em dp (Arrangement.spacedBy).                                      |
| `verticalSpacing`       | Espaçamento vertical (dp)      | number | não         |                                                                         |         | Espaço entre as linhas em dp (Arrangement.spacedBy).                                                  |
| `padding`               | Margem interna (dp)            | number | não         |                                                                         |         | Modifier.padding em dp. Vazio = 0.                                                                    |
| `width`                 | Largura                        | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`                | Altura                         | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`                | Peso (weight)                  | number | não         |                                                                         |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.foundation.layout.FlowRow`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/FlowLayout.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
FlowRow(
    horizontalArrangement = Arrangement.spacedBy(8.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
    modifier = Modifier.fillMaxWidth(),
) {
    /* filhas (chips, etiquetas) */
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Os filhos vão no `content`. `spacing` e `verticalSpacing` viram `Arrangement.spacedBy(<n>.dp)` em `horizontalArrangement` e `verticalArrangement`; `maxItemsInEachRow` e `maxLines` entram só quando preenchidos, e `padding` vira `Modifier.padding(<padding>.dp)`. Use o overload sem o parâmetro `overflow`, que é o estável. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Grupo de chips**: spacing=8, verticalSpacing=8, width=fill
- **Duas linhas no máximo**: spacing=12, maxLines=2, itemVerticalAlignment=CenterVertically, width=fill
