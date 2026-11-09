# Short navigation bar

Barra de navegação curta, inferior, com três a seis destinos. Cada linha de Itens é um destino; o ícone fica acima ou ao lado do rótulo.

Tipo de anotação: `short-navigation-bar` (camada Componentes).

## Campos

| Chave          | Rótulo           | Tipo  | Obrigatório | Opções                                  | Padrão        | Descrição                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------- | ----- | ----------- | --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`        | Itens            | table | sim         | ver Colunas abaixo                      |               | Um destino por linha, na ordem em que aparecem na barra (de três a cinco com o ícone acima; até seis com o ícone ao lado).                                                                                                                                                                             |
| `arrangement`  | Distribuição     | enum  | não         | `EqualWeight`, `Centered`               | `EqualWeight` | EqualWeight reparte a largura por igual (telas estreitas); Centered agrupa os itens no centro (telas médias; o desenho ocupa 80% da largura).                                                                                                                                                          |
| `iconPosition` | Posição do ícone | enum  | não         | `Top`, `Start`                          | `Top`         | Top põe o ícone acima do rótulo; Start põe o ícone ao lado dele (parâmetro do item, o mesmo em todos).                                                                                                                                                                                                 |
| `interaction`  | Interação        | enum  | não         | `none`, `hovered`, `focused`, `pressed` | `none`        | Aparência parada do estado de interação do item selecionado: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O tipo não tem desabilitado (sem enabled): o estado sempre desenha. Sem item selecionado, nada muda. |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.ShortNavigationBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ShortNavigationBar(arrangement = ShortNavigationBarArrangement.EqualWeight) {
    // uma linha de items vira um ShortNavigationBarItem
    ShortNavigationBarItem(
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        iconPosition = NavigationItemIconPosition.Top,    // o mesmo em todos os itens
    )
    ShortNavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Buscar") },
        iconPosition = NavigationItemIconPosition.Top,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Um `ShortNavigationBarItem` por linha de `items`, dentro de `ShortNavigationBar(arrangement = <arrangement>) { … }`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` (o `label` é anulável, mas a barra mostra sempre o rótulo), e `iconPosition = <iconPosition>` (parâmetro do item, não da barra: repita o valor em todos). Dentro de um Scaffold, a barra vai em `bottomBar`. A altura mínima é de 64 dp, vinda do composable; a largura é a da tela. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Ícone acima, distribuída**: arrangement=EqualWeight, iconPosition=Top
- **Ícone ao lado, centralizada**: arrangement=Centered, iconPosition=Start
- **Ícone acima, centralizada**: arrangement=Centered, iconPosition=Top
- **Mouse sobre**: arrangement=EqualWeight, iconPosition=Top, interaction=hovered
- **Com foco**: arrangement=EqualWeight, iconPosition=Top, interaction=focused
- **Pressionado**: arrangement=EqualWeight, iconPosition=Top, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt` (linhas 121 a 146: `DefaultShortNavigationBarOverride`, o `Surface` de `defaultMinSize(minHeight = NavigationBarTokens.ContainerHeight)` e a escolha entre `EqualWeight` e `Centered`; 210 a 256: `ShortNavigationBarItem` e os recuos do indicador por `iconPosition`; 263 e 305 a 309: cor do contêiner e do item; 384 a 434: `EqualWeightContentMeasurePolicy`, a largura dividida por igual; 436 a 511: `CenteredContentMeasurePolicy` e `calculateCenteredContentHorizontalPadding` (60%, 70%, 80% e 90% da largura com 3 a 6 itens); 521 a 540: `TopIconItemVerticalPadding` 6, os recuos do indicador e `StartIconToLabelPadding` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (linhas 553 a 645: `TopIconOrIconOnlyMeasurePolicy`; 647 a 735: `StartIconMeasurePolicy`; 895 a 975: `placeLabelAndTopIcon` e `placeLabelAndStartIcon`, as posições do ícone, do rótulo e do indicador).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (linhas 24 a 38) e `NavigationBarVerticalItemTokens.kt` (24 a 27: indicador 56 × 32, `ContainerBetweenSpace` 6) e `NavigationBarHorizontalItemTokens.kt` (24 a 27: `ActiveIndicatorHeight` 40, `ActiveIndicatorLeadingSpace` e `TrailingSpace` 16).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (linhas 1102 a 1108: `IndicatorRipple`, `ripple()` recortado na forma do indicador) e `ShortNavigationBar.kt` (linhas 265 a 267: `contentColor` = `contentColorFor(containerColor)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Contêiner de 64 (`NavigationBarTokens.ContainerHeight`) em `surface-container`, sem sombra.
- `EqualWeight`: os destinos dividem a largura por igual (`distribute: "fill"`), sem espaço entre eles. `Centered`: os destinos ficam agrupados no meio, com margens iguais nos dois lados.
- Ícone acima: item de 64 com 6 de recuo (`topIconItemVerticalPadding`), indicador de 56 × 32 em `corner-full`, ícone de 24 no centro dele, 4 de espaço e o rótulo em `label-medium` (12 / 16, peso 500, 0,5): o conteúdo mede 6 + 32 + 4 + 16 + 6 = 64.
- Ícone ao lado: pílula de 40 de altura (24 do ícone mais 8 em cima e em baixo) em `corner-full`, com 16 de respiro nos lados e 4 entre ícone e rótulo, centrada na altura. O rótulo usa `label-medium` também aqui (`NavigationBarTokens.LabelTextFont`).
- Cores: indicador `secondary-container` (só no selecionado), ícone `on-secondary-container` selecionado e `on-surface-variant` nos demais, rótulo `secondary` selecionado e `on-surface-variant` nos demais.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered`, `focused` e `pressed`: o `NavigationBarTokens.kt` e o `NavigationItem.kt` **não nomeiam** estados do item; a camada é o ripple do indicador (`StateTokens.kt`). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do indicador, por cima dele e com o raio `corner-full` — o de 56 × 32 do ícone acima do rótulo, ou a pílula de 40 do ícone ao lado —, na cor do ripple sem cor própria, o `contentColor` da barra, `on-surface`. A opacidade vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10).
- **Item do estado:** vale para o item selecionado (decisão 6 da etapa); com nenhum item selecionado nada muda. O Compose desenha o estado no item que o mouse, o foco ou o toque alcança; escolher "o primeiro" pediria o índice do item no `repeat` (#897), e um campo de índice do item fica fora.

**O que ainda difere do Compose**

- A margem do `Centered` é fixa em 10% de cada lado (o caso de 5 itens). O Compose usa 20% com 3 itens, 15% com 4, 10% com 5 e 5% com 6 (`calculateCenteredContentHorizontalPadding`), e deixa um item crescer até `largura / itens` quando o rótulo é mais largo. O formato não conta as linhas de uma `table` em expressão.
- O `interaction` é um quadro parado: sem o ripple animado, sem a animação do indicador (o desenho é o estado final), sem o anel de foco por fora da forma (#896) e sem `enabled`.
- A altura mínima de 48 de toque do item e `windowInsets` não aparecem no desenho; `ShortNavigationBarItemColors` próprio não é campo do tipo.
