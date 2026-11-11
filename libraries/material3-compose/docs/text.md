# Text

Texto na tipografia do tema. Use para títulos, parágrafos, rótulos e qualquer texto solto.

Tipo de anotação: `text` (camada Conteúdo).

## Campos

| Chave       | Rótulo               | Tipo   | Obrigatório | Opções                                                               | Padrão      | Descrição                                                                                             |
| ----------- | -------------------- | ------ | ----------- | -------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `text`      | Texto                | string | sim         |                                                                      |             | O texto exibido.                                                                                      |
| `style`     | Estilo               | enum   | não         | papéis de `MaterialTheme.typography` (`displayLarge` a `labelSmall`) | `bodyLarge` | Papel da tipografia do tema (MaterialTheme.typography).                                               |
| `color`     | Cor                  | enum   | não         | papéis do `ColorScheme`                                              |             | Papel de cor do tema. Vazio = cor do conteúdo (LocalContentColor).                                    |
| `textAlign` | Alinhamento do texto | enum   | não         | `Start`, `Center`, `End`, `Justify`                                  |             | Alinhamento horizontal do texto (TextAlign). Vazio = padrão do Compose.                               |
| `maxLines`  | Máximo de linhas     | number | não         |                                                                      |             | Limite de linhas (Int). Vazio = sem limite.                                                           |
| `width`     | Largura              | enum   | não         | `wrap`, `fill`, `fixed`                                              | `wrap`      | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`    | Altura               | enum   | não         | `wrap`, `fill`, `fixed`                                              | `wrap`      | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`    | Peso (weight)        | number | não         |                                                                      |             | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.material3.Text`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Text.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Text(
    text = "Configurações",
    style = MaterialTheme.typography.headlineMedium,
    color = MaterialTheme.colorScheme.onSurfaceVariant,   // só se color preenchido
    textAlign = TextAlign.Center,                          // só se textAlign preenchido
    maxLines = 2,                                          // só se maxLines preenchido
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `color` e `textAlign` só entram quando preenchidos; com `maxLines`, considere `overflow = TextOverflow.Ellipsis`. Se o app usa recursos de string, o `text` vira `stringResource(R.string.x)`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Título de tela**: text=Configurações, style=headlineMedium
- **Parágrafo**: text=Texto de apoio com uma frase um pouco mais longa., style=bodyMedium, color=onSurfaceVariant
- **Rótulo centralizado**: text=Salvar, style=labelLarge, textAlign=Center, width=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Text.kt` (linhas 105 a 120: `color`, `overflow = TextOverflow.Clip`, `softWrap = true`, `maxLines = Int.MAX_VALUE` e `style = LocalTextStyle.current`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt`: tamanho, altura de linha, peso e espaçamento entre letras das 15 escalas (`BodyLargeSize` 16 sp na linha 26, `LabelLargeWeight` na linha 73, `TitleMediumTracking` 0,2 sp na linha 92…).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ColorLightTokens.kt` e `ColorDarkTokens.kt`: os papéis de cor (`color`).

**Como o desenho segue o Compose**

- Cada estilo lê `<escala>-size`, `<escala>-line-height`, `<escala>-weight` e `<escala>-tracking` (por exemplo `body-large-size`); sem `style`, vale `bodyLarge`.
- A família não é escrita no componente: o texto herda a `font-sans` da especialização (Roboto), como o `TypefaceTokens.Plain` do Compose herda a fonte do tema.
- A cor é o papel escolhido em `color`; sem `color`, a cor do conteúdo herdada (`on-surface` quando nada a oferece). Cada papel tem a cor do modo `light` e a do `dark`.
- `maxLines` corta o texto na última linha permitida, sem reticências, porque o padrão do `Text` é `TextOverflow.Clip` (`font.maxLines`, sem `ellipsis`).

**O que ainda difere do Compose**

- `textAlign = Justify` desenha justificado (`font.align: "justify"`): as linhas se esticam até as duas bordas da caixa e a última linha de cada parágrafo fica à esquerda, como o `TextAlign.Justify` (`Text.kt`, linha 133: `textAlign` passa ao estilo).
- Sem `color`, o texto lê a cor do conteúdo herdada (`LocalContentColor`, `Text.kt`, linha 123: `color.takeOrElse { style.color.takeOrElse { LocalContentColor.current } }`): dentro de um `surface` ou `scaffold` ele sai na cor que o pai oferece (por exemplo `on-primary` sobre `primary`), e sem pai, em `on-surface`. Um `color` escolhido vale mais que a herança.
- As variantes `*Emphasized` da escala (Material 3 Expressive) ficam fora da etapa.
