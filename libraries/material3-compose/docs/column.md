# Column

Coloca os filhos em coluna, de cima para baixo. Use para blocos de conteúdo, formulários e qualquer pilha vertical.

Tipo de anotação: `column` (camada Layout).

## Campos

| Chave                 | Rótulo                 | Tipo   | Obrigatório | Opções                                                                  | Padrão  | Descrição                                                                                              |
| --------------------- | ---------------------- | ------ | ----------- | ----------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `verticalArrangement` | Distribuição vertical  | enum   | não         | `Top`, `Bottom`, `Center`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly` | `Top`   | Como os filhos se distribuem no eixo vertical (Arrangement).                                           |
| `horizontalAlignment` | Alinhamento horizontal | enum   | não         | `Start`, `CenterHorizontally`, `End`                                    | `Start` | Como os filhos se alinham no eixo horizontal (Alignment).                                              |
| `spacing`             | Espaçamento (dp)       | number | não         |                                                                         |         | Espaço entre os filhos em dp (Arrangement.spacedBy). Vazio = 0.                                        |
| `background`          | Fundo                  | enum   | não         | `none` e papéis do `ColorScheme`                                        | `none`  | Papel de cor do tema usado como fundo (Modifier.background). none = sem fundo.                         |
| `padding`             | Margem interna (dp)    | number | não         |                                                                         |         | Modifier.padding em dp. Vazio = 0.                                                                     |
| `scroll`              | Rolagem                | enum   | não         | `false`, `true`                                                         | `false` | true torna o conteúdo rolável sem usar lazy (verticalScroll/horizontalScroll com rememberScrollState). |
| `width`               | Largura                | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).  |
| `height`              | Altura                 | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).    |
| `weight`              | Peso (weight)          | number | não         |                                                                         |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                      |

## Compose

- Símbolo: `androidx.compose.foundation.layout.Column`
- Arquivo (`path`): `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Column.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Column(
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalAlignment = Alignment.Start,
    modifier = Modifier
        .fillMaxWidth()
        .verticalScroll(rememberScrollState())
        .padding(16.dp),
) {
    /* filhas */
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Os filhos vão no `content`. Com `spacing`, passe `Arrangement.spacedBy(<spacing>.dp)` no lugar de `verticalArrangement` (para manter Center ou Bottom use `Arrangement.spacedBy(<spacing>.dp, Alignment.CenterVertically)` ou `Alignment.Bottom`). Monte o `modifier` na ordem tamanho, `background`, `padding` e, com `scroll = true`, `Modifier.verticalScroll(rememberScrollState())`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Pilha espaçada**: verticalArrangement=Top, horizontalAlignment=Start, spacing=8, padding=16, width=fill
- **Conteúdo centralizado**: verticalArrangement=Center, horizontalAlignment=CenterHorizontally, width=fill, height=fill
- **Com rolagem**: spacing=16, scroll=true, width=fill, height=fill
