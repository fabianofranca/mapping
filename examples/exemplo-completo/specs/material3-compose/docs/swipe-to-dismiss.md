# SwipeToDismissBox

Item que se dispensa deslizando para um lado ou para o outro, revelando um fundo com ícone (excluir, arquivar). Use em itens de lista.

Tipo de anotação: `swipe-to-dismiss` (camada Componentes).

## Campos

| Chave                         | Rótulo                         | Tipo   | Obrigatório | Opções                                                         | Padrão    | Descrição                                                                                                                                        |
| ----------------------------- | ------------------------------ | ------ | ----------- | -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`                       | Título                         | string | sim         |                                                                |           | Linha principal do item que se dispensa (o conteúdo é do app; o desenho mostra um item de lista).                                                |
| `supportingText`              | Texto de apoio                 | string | não         |                                                                |           | Linha de apoio abaixo do título. Vazio = sem linha.                                                                                              |
| `direction`                   | Estado do deslize              | enum   | não         | `Settled`, `StartToEnd`, `EndToStart`                          | `Settled` | Settled é o item em repouso; StartToEnd e EndToStart mostram o item deslizado e o fundo revelado (SwipeToDismissBoxValue).                       |
| `enableDismissFromStartToEnd` | Dispensar do início para o fim | enum   | não         | `true`, `false`                                                | `true`    | false impede o deslize no sentido da leitura (enableDismissFromStartToEnd).                                                                      |
| `enableDismissFromEndToStart` | Dispensar do fim para o início | enum   | não         | `true`, `false`                                                | `true`    | false impede o deslize contra o sentido da leitura (enableDismissFromEndToStart).                                                                |
| `icon`                        | Ícone do fundo                 | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |           | Ícone do fundo revelado (o desenho mostra Delete, Done, Check, Favorite, Edit, Star, Share, Add e Close; outros caem em Delete). Vazio = Delete. |
| `width`                       | Largura                        | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                            |
| `height`                      | Altura                         | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`    | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                              |
| `weight`                      | Peso (weight)                  | number | não         |                                                                |           | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                |

## Compose

- Símbolo: `androidx.compose.material3.SwipeToDismissBox`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SwipeToDismissBox.kt`
- Estável no commit fixado, sem opt-in.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
val state = rememberSwipeToDismissBoxState(
    initialValue = SwipeToDismissBoxValue.Settled,    // direction
)

SwipeToDismissBox(
    state = state,
    enableDismissFromStartToEnd = false,              // enableDismissFromStartToEnd
    enableDismissFromEndToStart = true,               // enableDismissFromEndToStart
    onDismiss = { value -> /* remove o item da lista */ },
    backgroundContent = {
        Box(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 24.dp),
            contentAlignment = if (state.dismissDirection == SwipeToDismissBoxValue.StartToEnd)
                Alignment.CenterStart else Alignment.CenterEnd,
        ) {
            Icon(Icons.Filled.Delete, contentDescription = null)    // icon
        }
    },
) {
    ListItem(headlineContent = { Text("Reunião de equipe") })    // title, supportingText
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Use o overload com `onDismiss` (o que só recebe `content` e `backgroundContent` e lê `state.currentValue` está `@Deprecated`). `state = rememberSwipeToDismissBoxState(initialValue = <direction>)`: o campo `direction` é o `initialValue` do estado (não é parâmetro do `SwipeToDismissBox`) e, em geral, fica em `Settled`; os dois `enableDismiss…` são parâmetros do box. `onDismiss = { value -> … }` remove o item (o app trata `StartToEnd` e `EndToStart`). `backgroundContent` (um `RowScope`) é o fundo revelado: um `Box(Modifier.fillMaxSize().background(<cor>).padding(horizontal = 24.dp), contentAlignment = if (state.dismissDirection == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) { Icon(Icons.Filled.<icon>, contentDescription = null) }`; as cores do fundo são do app. O `content` (um `RowScope`) é o item, em geral um `ListItem` ou `Card` (a marcação filha, ou o que o app já tem). Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Desenho

O desenho mostra o estado do deslize: em repouso (`Settled`) só o item; em `StartToEnd` o item sai 80 para o fim e revela o fundo primaryContainer com o ícone no início; em `EndToStart` sai 80 para o início e revela o errorContainer com o ícone no fim. O sentido desligado (`enableDismiss…` falso) não revela nada, e o desenho volta ao repouso. As cores do fundo são ilustrativas: o Compose deixa a cor do `backgroundContent` para o app.

## Exemplos

- **Em repouso**: title=Reunião de equipe, supportingText=Hoje, 14:00, direction=Settled, icon=Delete, width=fill
- **Excluir arrastando para o início**: title=Reunião de equipe, supportingText=Hoje, 14:00, direction=EndToStart, enableDismissFromStartToEnd=false, icon=Delete, width=fill
- **Concluir arrastando para o fim**: title=Convite de Ana, direction=StartToEnd, enableDismissFromEndToStart=false, icon=Done, width=fill
