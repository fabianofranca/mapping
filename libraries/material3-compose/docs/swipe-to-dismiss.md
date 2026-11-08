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

O desenho mostra o estado do deslize: em repouso (`Settled`) só o item; em `StartToEnd` o item sai 56 (o `positionalThreshold`) para o fim e revela o fundo primary container com o ícone no início; em `EndToStart` sai 56 para o início e revela o error container com o ícone no fim. O sentido desligado (`enableDismiss…` falso) não revela nada, e o desenho volta ao repouso. As cores do fundo são ilustrativas: o Compose deixa a cor do `backgroundContent` para o app.

## Exemplos

- **Em repouso**: title=Reunião de equipe, supportingText=Hoje, 14:00, direction=Settled, icon=Delete, width=fill
- **Excluir arrastando para o início**: title=Reunião de equipe, supportingText=Hoje, 14:00, direction=EndToStart, enableDismissFromStartToEnd=false, icon=Delete, width=fill
- **Concluir arrastando para o fim**: title=Convite de Ana, direction=StartToEnd, enableDismissFromEndToStart=false, icon=Done, width=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade de cor fica literal no componente e nenhum nó de texto declara `family` (todos herdam `font-sans`). O `SwipeToDismissBox` só define o gesto e o recuo (`positionalThreshold` de 56): o fundo revelado e o item são do app, e o desenho os ilustra com os tokens do Material (o item é um `ListItem`, o fundo usa os papéis `container` do Material).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SwipeToDismissBox.kt` (linhas 44 a 53: `SwipeToDismissBoxValue`; 305 a 357: `SwipeToDismissBox`, o `Box` com `anchoredDraggable`, a `Row(content = backgroundContent, Modifier.matchParentSize())` (331) atrás da `Row` do conteúdo e os `DraggableAnchors` com `Settled at 0`, `StartToEnd at width` e `EndToStart at -width` (337 a 349); 360 a 364: `SwipeToDismissBoxDefaults.positionalThreshold` de 56 dp; 393: `DismissVelocityThreshold` 125 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` e `tokens/ListTokens.kt` (o item desenhado: o `Surface` `surface` sem canto, 16 de respiro lateral e 8 em cima e embaixo, título em `BodyLarge` e apoio em `BodyMedium`; ver `docs/list-item.md`), `tokens/TypeScaleTokens.kt` (`BodyLarge` 16/24/400/0,5 e `BodyMedium` 14/20/400/0,2).

**Como o desenho segue o Compose**

- Em repouso só o item aparece, em `surface` sobre a caixa. Em `StartToEnd` e `EndToStart` o item sai 56 (o `positionalThreshold`, a distância a partir da qual o gesto assenta no sentido) para o lado e revela o fundo atrás dele, atrás do `backgroundContent`: antes o desenho usava 80, que não vem do Compose. O sentido desligado (`enableDismiss…` falso) não existe como âncora, então o desenho volta ao repouso.
- Fundo revelado: `primary-container` no sentido do início para o fim, com o ícone em `on-primary-container`; `error-container` no sentido contrário, com o ícone em `on-error-container` (o `code` do tipo usa o `errorContainer` do tema; as cores do fundo são do app). Ícone de 24 a 24 da borda (o `padding(horizontal = 24.dp)` do `backgroundContent` do `code`), centrado na altura, no lado de onde o item saiu: `Alignment.CenterStart` ou `CenterEnd`.
- Item como `ListItem`: título em `body-large` (16/24) em `on-surface` e apoio em `body-medium` (14/20) em `on-surface-variant`, ambos numa linha com `…` (`maxLines` 1 e `ellipsis`), a 16 das bordas e centrados na altura de 72.
- O ícone é o nó `icon` do conjunto da biblioteca, pelo nome do Compose (`Delete`, `Done`…): campo vazio é `delete` (o padrão que o campo já tinha) e um nome fora da lista cai no reservado e avisa `ícone desconhecido`, em vez de voltar a `Delete` em silêncio.
- A caixa recorta o que sai dela (`clip`).

**O que ainda difere do Compose**

- No Compose o item só assenta fora da caixa (`EndToStart at -width`, `StartToEnd at width`), e os 56 são o limiar do gesto: o quadro desenhado é o de um arrasto de 56, não um estado assentado. Assentado em `StartToEnd` ou `EndToStart`, o `onDismiss` roda e o app remove o item.
- O item é sempre um `ListItem` de título e apoio (uma linha cada); o `content` do Compose é livre (um `Card`, um `ListItem` com ícones), e a mudança de cor do fundo com o progresso do gesto (`state.dismissDirection`, `progress`) é do app.
- O apoio longo termina em `…` numa linha, o que mantém o item em 72; o `ListItem` de três linhas (88) não é desenhado.
- Sem o gesto, a animação, o `gesturesEnabled`, a velocidade de dispensa (`DismissVelocityThreshold`), o `onDismiss` e o estado de foco ou pressionado.
