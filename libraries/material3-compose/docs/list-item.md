# List item

Item de lista de uma a três linhas, com conteúdo à esquerda e à direita. Use dentro de listas.

Tipo de anotação: `list-item` (camada Componentes).

## Campos

| Chave               | Rótulo         | Tipo   | Obrigatório | Opções                                                         | Padrão | Descrição                                                                                                                                                                                                                                                                                       |
| ------------------- | -------------- | ------ | ----------- | -------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headlineContent`   | Título         | string | sim         |                                                                |        | Linha principal do item.                                                                                                                                                                                                                                                                        |
| `overlineContent`   | Sobretítulo    | string | não         |                                                                |        | Linha pequena acima do título. Vazio = sem linha.                                                                                                                                                                                                                                               |
| `supportingContent` | Texto de apoio | string | não         |                                                                |        | Linha de apoio abaixo do título. Vazio = sem linha.                                                                                                                                                                                                                                             |
| `leadingIcon`       | Ícone inicial  | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Ícone à esquerda. Vazio = sem ícone.                                                                                                                                                                                                                                                            |
| `leadingImage`      | Avatar (URL)   | string | não         |                                                                |        | Endereço https:// do avatar à esquerda. Vazio = sem avatar.                                                                                                                                                                                                                                     |
| `trailingContent`   | Texto final    | string | não         |                                                                |        | Texto curto à direita (hora, valor). Vazio = sem texto.                                                                                                                                                                                                                                         |
| `trailingIcon`      | Ícone final    | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Ícone à direita. Vazio = sem ícone.                                                                                                                                                                                                                                                             |
| `interaction`       | Interação      | enum   | não         | `none`, `hovered`, `focused`, `pressed`, `dragged`             | `none` | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused), pressionado (pressed) ou arrastado (dragged, com a sombra do nível 4); none = sem camada de estado. Só muda o desenho, não entra no código. O item não tem desabilitado (sem enabled): o estado sempre desenha. |

## Compose

- Símbolo: `androidx.compose.material3.ListItem`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ListItem(
    overlineContent = { Text("Hoje") },
    headlineContent = { Text("Reunião de planejamento") },
    supportingContent = { Text("Sala 3, com a equipe de produto.") },
    leadingContent = { Icon(Icons.Filled.DateRange, contentDescription = null) },
    trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `headlineContent = { Text(<headlineContent>) }`; `overlineContent`, `supportingContent` e `trailingContent` preenchidos viram `{ Text(<campo>) }` (o item tem de uma a três linhas conforme o preenchimento). `leadingIcon` e `trailingIcon` viram `leadingContent`/`trailingContent` com `Icon(Icons.Filled.<nome>, contentDescription = null)`; `leadingImage` é um avatar de `Modifier.size(40.dp).clip(CircleShape)` que, remoto, usa o carregador de imagens do app (por exemplo Coil `AsyncImage`).

## Exemplos

- **Uma linha**: headlineContent=Wi-Fi, leadingIcon=Settings
- **Duas linhas**: headlineContent=Ana Souza, supportingContent=Vamos almoçar?, trailingContent=12:30, leadingImage=https://example.com/ana.jpg
- **Três linhas**: overlineContent=Hoje, headlineContent=Reunião de planejamento, supportingContent=Sala 3, com a equipe de produto., trailingIcon=KeyboardArrowRight
- **Mouse sobre**: headlineContent=Ana Souza, supportingContent=Vamos almoçar?, leadingIcon=Person, interaction=hovered
- **Com foco**: headlineContent=Ana Souza, overlineContent=Hoje, supportingContent=Vamos almoçar?, trailingContent=12:30, interaction=focused
- **Pressionado**: headlineContent=Ana Souza, supportingContent=Vamos almoçar?, leadingIcon=Person, interaction=pressed
- **Arrastado**: headlineContent=Ana Souza, supportingContent=Vamos almoçar?, leadingIcon=Person, interaction=dragged

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt` (linhas 95 a 186: `ListItem`, o `Surface` com `ListItemDefaults.shape` e `containerColor`, o estilo de cada texto por token e os `Box` com `LeadingContentEndPadding` e `TrailingContentStartPadding`; 191 a 330: `ListItemMeasurePolicy`, o respiro `ListItemStartPadding`/`ListItemEndPadding` e o tipo do item; 451 a 473: `calculateHeight`, a altura mínima por tipo; 475 a 524: `place`, o conteúdo centrado (uma e duas linhas) ou no topo com `topPadding` (três linhas); 527 a 610: `ListItemDefaults` e `defaultListItemColors`; 712 a 741: `ListItemType`, três linhas com sobretítulo e apoio juntos ou com apoio multilinha; 743 a 757: `ListItemVerticalPadding` 8, `ListItemThreeLineVerticalPadding` 12, `ListItemStartPadding` e `ListItemEndPadding` 16, `LeadingContentEndPadding` e `TrailingContentStartPadding` 16; 764 a 768: `verticalPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt` (linhas 27: `ListItemContainerColor` `Surface`; 29: `ListItemContainerShape` `CornerNone`; 46 e 47: título em `OnSurface` e `BodyLarge`; 49 a 53: avatar de 40, `PrimaryContainer`, `CornerFull`; 54 e 55: ícone inicial de 24 em `OnSurfaceVariant`; 62, 78 e 72: alturas 56, 72 e 88; 63 e 64: sobretítulo `OnSurfaceVariant` e `LabelSmall`; 70 e 71: apoio `OnSurfaceVariant` e `BodyMedium`; 73 e 74: ícone final de 24 em `OnSurfaceVariant`; 76 e 77: texto final `OnSurfaceVariant` e `LabelSmall`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypographyTokens.kt` (`BodyLarge` 16/24/400/0,5, `BodyMedium` 14/20/400/0,2 e `LabelSmall` 11/16/500/0,5).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt` (linhas 36 a 45 e 65 a 67: `ListItemDraggedContainerElevation` e os papéis `Hover*`, `Focus*`, `Pressed*` e `Dragged*` do rótulo e dos ícones; linha 26: `FocusIndicatorColor`) e `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevationTokens.kt` (`Level4`, 8 dp, o nível 4 da biblioteca).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Contêiner `surface` sem canto (`CornerNone`), com 16 de respiro dos dois lados e 16 entre o conteúdo inicial, o texto e o conteúdo final (`LeadingContentEndPadding` e `TrailingContentStartPadding`). O respiro vertical é 8 e passa a 12 no item de três linhas (sobretítulo e apoio presentes).
- Altura mínima por tipo (`calculateHeight`): 56 com só o título, 72 com sobretítulo ou apoio e 88 com os dois. É o `minHeight` da raiz, calculado pelos campos, e o `sizing` fica `hug` na altura: sem retângulo o item mede o conteúdo mais o respiro e nunca fica abaixo do mínimo. Com retângulo, o conteúdo se arruma na altura dele.
- Uma e duas linhas: conteúdo inicial, bloco de texto e conteúdo final centrados na altura (`CenterVertically.align`). Três linhas: tudo preso ao topo, a 12 (`topPadding`), inclusive o ícone inicial e o final.
- Título em `body-large` (16/24, `on-surface`), sobretítulo em `label-small` (11/16, `on-surface-variant`) acima dele e apoio em `body-medium` (14/20, `on-surface-variant`) abaixo, tudo pelos tokens e sem `family`. Texto final em `label-small` (`ListItemTrailingSupportingTextFont`) em `on-surface-variant`.
- Ícones inicial e final pelo nó `icon` do conjunto da biblioteca, de 24 em `on-surface-variant`. Avatar de 40 (`ListItemLeadingAvatarSize`) em `corner-full`, com o preenchimento `primary-container` (`ListItemLeadingAvatarColor`) enquanto a imagem não carrega.
- Texto cortado como o `Text` dos exemplos do Material: título e sobretítulo em uma linha com `…`, apoio em uma linha com `…` quando há sobretítulo e em até duas sem ele (`font.maxLines` e `font.ellipsis`), o que mantém o item dentro de 88.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered`, `focused`, `pressed` e `dragged`: o `ListTokens.kt` define os quatro (`ListItemHover*`, `ListItemFocus*`, `ListItemPressed*` e `ListItemDragged*`). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do item, por cima do conteúdo, na cor do rótulo dos quatro estados, `on-surface` (`ListItemHoverLabelTextColor`, `ListItemFocusLabelTextColor`, `ListItemPressedLabelTextColor` e `ListItemDraggedLabelTextColor`, linhas 43, 40, 65 e 37), com `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10), `state-pressed` (0,10) e `state-dragged` (0,16). O `ListTokens.kt` **não nomeia** cor nem opacidade de camada (e o `ListItem` não é clicável sozinho): é a convenção do `card`, a cor do conteúdo.
- **Arrastado:** a elevação sobe do nível 0 (`ListItemContainerElevation`) ao nível 4 (`ListItemDraggedContainerElevation`, linha 36): a raiz ganha a sombra do nível 4 da biblioteca (`y` 4, `blur` 16). O tom da elevação (`surface-tint`) não é desenhado.
- **Cores do conteúdo:** o rótulo (`on-surface`) e os ícones (`on-surface-variant`) repetem os papéis de sempre em todos os estados (`ListItem*LeadingIconColor`, `ListItem*TrailingIconColor`).
- **Estrutura:** a raiz passou a `layout` `none` e o conteúdo (a linha de avatar, ícone, textos e conteúdo final) foi para o quadro `corpo`; o tamanho continua `hug` na altura.

**O que ainda difere do Compose**

- O `ListItem` não corta nenhum texto: quem decide as linhas é o `Text` que a tela passa. O desenho adota o corte acima (`maxLines` 1, 1 e 1 ou 2), que é a convenção do Material, e não uma regra do composable.
- Apoio de duas linhas sem sobretítulo: o Compose o detecta pela linha de base (`isSupportingMultiline`) e passa a três linhas, com o conteúdo preso ao topo e 88 de altura. O desenho só conhece o tipo pelos campos preenchidos, então esse item mantém o respiro de 8 e o conteúdo inicial e final centrados (o bloco de texto cai no mesmo lugar numa caixa de 88, mas a altura medida é 80).
- Só ícone, avatar remoto e texto como conteúdo inicial e final; o `leadingContent` e o `trailingContent` do Compose são livres (checkbox, switch, imagem de 56, vídeo de 100 por 56). O `ListItemDefaults.colors`, o desabilitado a 0,38, o selecionado, o arrastado (`tonalElevation` e `shadowElevation`), o pressionado, o foco e o passar o mouse não existem: o desenho é o estado normal.
- A divisória entre itens (`ListTokens.DividerLeadingSpace` e `DividerTrailingSpace` de 16) é de um `HorizontalDivider` à parte, e não do `ListItem`, então o tipo não a desenha.
