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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/foundation/foundation-layout/src/commonMain/kotlin/androidx/compose/foundation/layout/Column.kt` (linhas 82 a 86: `Column(verticalArrangement = Arrangement.Top, horizontalAlignment = Alignment.Start)`).
  `ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de cor do tema, lidos como tokens (`$token`) nos dois modos.

**Como o desenho segue o Compose**

- `verticalArrangement` vira o `justify` do layout do slot (`Top` em `start`, `Bottom` em `end`, `Center` em `center`, `SpaceBetween` em `space-between`) e `horizontalAlignment` vira o `align` (`Start` em `start`, `CenterHorizontally` em `center`, `End` em `end`); antes o slot ficava sempre em `start`.
- `spacing` é o `gap` (`Arrangement.spacedBy`) e `padding` o recuo do slot, depois do fundo, como na ordem dos `Modifier`.
- O fundo segue o papel do tema nos dois modos; `none` não desenha fundo.

**O que ainda difere do Compose**

- `SpaceAround` e `SpaceEvenly` caem em `space-between`: o `justify` do formato só reparte a folga entre os filhos, sem folga nas pontas.
- `scroll` só aparece no rótulo: a rolagem não é desenhada.
- O Compose limita os filhos à altura da Column; o formato não corta nem rola o que passa dela.
