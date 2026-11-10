# Bottom sheet

Folha que sobe da parte de baixo da tela. Modal cobre a tela com um scrim e se dispensa; standard fica ao lado do conteúdo.

Tipo de anotação: `bottom-sheet` (camada Componentes).

## Campos

| Chave             | Rótulo                | Tipo   | Obrigatório | Opções              | Padrão  | Descrição                                                            |
| ----------------- | --------------------- | ------ | ----------- | ------------------- | ------- | -------------------------------------------------------------------- |
| `title`           | Título                | string | não         |                     |         | Título no topo da folha.                                             |
| `style`           | Estilo                | enum   | não         | `modal`, `standard` | `modal` | modal (ModalBottomSheet) ou standard (BottomSheetScaffold).          |
| `dragHandle`      | Alça de arraste       | enum   | não         | `true`, `false`     | `true`  | false remove a alça no topo da folha.                                |
| `sheetPeekHeight` | Altura recolhida (dp) | number | não         |                     | `56`    | Altura visível da folha recolhida em dp. Só vale no estilo standard. |
| `items`           | Itens                 | table  | não         | ver Colunas abaixo  |         | Ações da folha, uma por linha.                                       |

Colunas de `items` (uma linha por item):

| Chave   | Rótulo | Tipo   | Obrigatório | Opções                                                         | Padrão |
| ------- | ------ | ------ | ----------- | -------------------------------------------------------------- | ------ |
| `label` | Rótulo | string | sim         |                                                                |        |
| `icon`  | Ícone  | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        |

## Compose

- Símbolo: `androidx.compose.material3.ModalBottomSheet`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ModalBottomSheet.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo                                                  |
| -------------- | -------------------------------------------------------- |
| `modal` (base) | `ModalBottomSheet`                                       |
| `standard`     | `BottomSheetScaffold` (arquivo `BottomSheetScaffold.kt`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Folha(onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(),
        // dragHandle = null quando dragHandle = false
    ) {
        Column {
            Text("Compartilhar", style = MaterialTheme.typography.titleLarge)
            ListItem(    // uma por linha de items
                headlineContent = { Text("Copiar link") },
                leadingContent = { Icon(Icons.Filled.Share, contentDescription = null) },
            )
        }
    }
}

// style standard: BottomSheetScaffold
BottomSheetScaffold(
    scaffoldState = rememberBottomSheetScaffoldState(),
    sheetPeekHeight = 96.dp,
    sheetContent = { Column { /* title e items, como acima */ } },
) { innerPadding ->
    /* conteúdo da tela atrás da folha */
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class). `onDismissRequest` e `sheetState = rememberModalBottomSheetState()` ligam à lógica da tela, e o scrim é desenhado pelo próprio composable. O `content` (uma Column) traz o `title` em `Text` com `MaterialTheme.typography.titleLarge` e, para cada linha de `items`, `ListItem(headlineContent = { Text(<label>) }, leadingContent = { Icon(Icons.Filled.<icon>, contentDescription = null) })`. Com `dragHandle` em `false`, passe `dragHandle = null`.

Variante `standard`: Exige @OptIn(ExperimentalMaterial3Api::class). O conteúdo da folha vai em `sheetContent = { … }` (uma Column com o `title` e os `items`, como no modal) e `sheetPeekHeight = <sheetPeekHeight>.dp`; o conteúdo da tela atrás da folha vai em `content = { innerPadding -> … }`. Com `dragHandle` em `false`, passe `sheetDragHandle = null`; `scaffoldState = rememberBottomSheetScaffoldState()` liga à lógica da tela.

## Exemplos

- **Modal**: title=Compartilhar, style=modal, dragHandle=true
- **Standard recolhida**: title=Detalhes, style=standard, sheetPeekHeight=96

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente, nenhum nó de texto declara `family` (todos herdam `font-sans`) e o ícone dos itens é o nó `icon` do conjunto da biblioteca, pelo `$switch` do nome do Compose para o do conjunto, sem caminho SVG no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ModalBottomSheet.kt` (linhas 123 a 137: `ModalBottomSheet`, `sheetMaxWidth`, `shape`, `containerColor`, `tonalElevation` e `dragHandle` padrão; 266 a 358: o `Surface` com `widthIn(max = sheetMaxWidth)` e `fillMaxWidth()` (280), a forma, a cor e o `tonalElevation` sem `shadowElevation`; 361 a 431: a `Column` com a alça no topo, centralizada por `DragHandleWithTooltip`, e depois o `content`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/BottomSheetScaffold.kt` (linhas 118 a 139: `BottomSheetScaffold`, `sheetPeekHeight`, `sheetShape`, `sheetTonalElevation` 0 e `sheetShadowElevation` = `BottomSheetDefaults.Elevation`; 262 a 322: o `Surface` com `widthIn(max = sheetMaxWidth)`, `requiredHeightIn(min = peekHeight)` (270) e `shadowElevation` (322)).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SheetDefaults.kt` (linhas 373 a 402: `BottomSheetDefaults`, `ExpandedShape`, `ContainerColor`, `Elevation`, `ScrimColor`, `SheetPeekHeight` 56, `SheetMaxWidth` 640 e `windowInsets`; 410 a 431: `DragHandle`, a forma `MaterialTheme.shapes.extraLarge`, a cor do token e o `padding(vertical = DragHandleVerticalPadding)`; 543: `DragHandleVerticalPadding` 22).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SheetBottomTokens.kt` (linhas 24 a 31: contêiner `SurfaceContainerLow`, forma `CornerExtraLargeTop`, alça `OnSurfaceVariant` de 32 × 4, `DockedMinimizedContainerShape` `CornerNone`, elevações `Level1` do modal e do standard), `ShapeTokens.kt` (linhas 31 a 37: `CornerExtraLargeTop`, 28 em cima e 0 embaixo) e `ElevationTokens.kt` (`Level1` 1 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` e `tokens/ListTokens.kt`, para os itens (ver `list-item.md`): contêiner `Surface` (`ListItemContainerColor`, linha 27), altura de uma linha 56 (linha 62), título em `BodyLarge` e `OnSurface`, ícone inicial de 24 em `OnSurfaceVariant` (linhas 54 e 55), respiro de 16 (`ListItemStartPadding`) e 16 até o texto (`LeadingContentEndPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`TitleLarge` 22/28/400/0 e `BodyLarge` 16/24/400/0,5).

**Como o desenho segue o Compose**

- Folha em `surface-container-low` com os cantos de cima de 28 (`CornerExtraLargeTop`, o `corner-extra-large`) e os de baixo retos. O modal não projeta sombra (o `Level1` dele é só `tonalElevation`, que não pinta quando a cor não é `surface`), e o standard tem a sombra do nível 1 (`sheetShadowElevation`, `elevation-shadow` com deslocamento 1 e desfoque 2, os valores de `elevation-1-y` e `elevation-1-blur`).
- Alça de 32 × 4 em `on-surface-variant` com a forma `corner-extra-large` (a cápsula do `shapes.extraLarge`), numa área de 48 (22 + 4 + 22), centralizada. A cor é cheia: o `DragHandle` do commit usa o token sem a opacidade 0,4 que o desenho tinha. Com `dragHandle: false` a área some.
- Título em `title-large` (22/28, peso 400) em `on-surface` e uma linha por item como `ListItem` de uma linha: 56 de altura mínima, contêiner `surface`, ícone do conjunto de 24 em `on-surface-variant` a 16 da borda, 16 até o rótulo e rótulo em `body-large` (16/24) em `on-surface`, numa linha só com `…` (a convenção do `list-item`). O item sem ícone começa a 16.
- Largura máxima de 640 (`SheetMaxWidth`, o `maxWidth` da raiz) e, no standard, altura mínima de `sheetPeekHeight` (`requiredHeightIn(min = peekHeight)`, o `minHeight` da raiz lido do campo). O modal não tem altura mínima.

**O que ainda difere do Compose**

- O conteúdo da folha é livre (`ColumnScope.() -> Unit`): o título, o espaço dele e o de baixo não são constantes do composable. O desenho usa 16 nas laterais do título (o `ListItemStartPadding`), 8 em cima e 16 embaixo, e 16 de respiro embaixo da lista no lugar do `contentWindowInsets` (a barra do sistema), que são convenções do desenho e não valores do código.
- O `ListItem` sem `colors` pinta o contêiner de `surface`, e é o que o desenho faz; a faixa fica um pouco mais clara que a folha em `surface-container-low`. Quem passa `ListItemDefaults.colors(containerColor = Color.Transparent)` não vê a faixa, e o tipo não tem campo para isso.
- Os cantos de cima são a lista `[corner-extra-large, corner-extra-large, 0, 0]` (a lista de raios aceita `$token` por item), então seguem o token se a especialização mudar.
- A sombra do standard é uma só (a do formato), em preto a 30% e com o `y` e o `blur` pelos tokens `elevation-1-y` e `elevation-1-blur`; o Compose compõe a sombra ambiente, a do ponto e a tonal. Com 1 dp ela quase não aparece no topo da folha.
- O desenho é o estado aberto e estático: sem o `scrim` (a película do `scrim` a 32%, do composable), sem arrastar, sem os estados recolhido, parcial e escondido (a forma `CornerNone` do `DockedMinimizedContainerShape` não é desenhada), sem a dica da alça (`DragHandleWithTooltip`), sem a animação e sem o recuo do sistema.
- O standard recolhido não corta o conteúdo na altura de `sheetPeekHeight`: o Compose mostra só esse trecho da folha, e o desenho a mostra inteira, com essa altura como mínimo.

- O `SheetBottomTokens.kt` define `FocusIndicatorColor` (linha 32), mas o tipo não tem `interaction`: o anel de foco não é desenhado.
