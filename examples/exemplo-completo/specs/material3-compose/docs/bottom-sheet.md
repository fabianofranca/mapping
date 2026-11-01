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
