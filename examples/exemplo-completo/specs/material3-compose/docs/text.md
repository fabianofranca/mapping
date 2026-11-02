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
