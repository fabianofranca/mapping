# Navigation rail

Barra de navegação lateral para telas largas. A rail estreita (rail), a wide (wide) e a wide modal (modal-wide) têm um destino por linha de Itens.

Tipo de anotação: `navigation-rail` (camada Componentes).

## Campos

| Chave             | Rótulo                  | Tipo  | Obrigatório | Opções                                  | Padrão     | Descrição                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------- | ----- | ----------- | --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`           | Itens                   | table | sim         | ver Colunas abaixo                      |            | Um destino por linha, na ordem em que aparecem na rail, de cima para baixo.                                                                                                                                                                                                                            |
| `style`           | Estilo                  | enum  | não         | `rail`, `wide`, `modal-wide`            | `rail`     | rail (NavigationRail, 80 de largura), wide (WideNavigationRail, recolhida ou expandida) ou modal-wide (ModalWideNavigationRail, que expande sobre a tela).                                                                                                                                             |
| `initialValue`    | Estado inicial          | enum  | não         | `Collapsed`, `Expanded`                 | `Expanded` | Só para wide e modal-wide: Expanded mostra o ícone ao lado do rótulo; Collapsed, o ícone acima (rememberWideNavigationRailState).                                                                                                                                                                      |
| `alwaysShowLabel` | Sempre mostrar o rótulo | enum  | não         | `true`, `false`                         | `true`     | Só para rail: false mostra o rótulo só no destino selecionado.                                                                                                                                                                                                                                         |
| `interaction`     | Interação               | enum  | não         | `none`, `hovered`, `focused`, `pressed` | `none`     | Aparência parada do estado de interação do item selecionado: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O tipo não tem desabilitado (sem enabled): o estado sempre desenha. Sem item selecionado, nada muda. |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.NavigationRail`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`       | Símbolo                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `rail` (base) | `NavigationRail` (itens `NavigationRailItem`)                                               |
| `wide`        | `WideNavigationRail` (arquivo `WideNavigationRail.kt`; itens `WideNavigationRailItem`)      |
| `modal-wide`  | `ModalWideNavigationRail` (arquivo `WideNavigationRail.kt`; itens `WideNavigationRailItem`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style rail
NavigationRail {
    NavigationRailItem(    // uma por linha de items
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        alwaysShowLabel = true,
    )
}

// style wide (modal-wide: ModalWideNavigationRail, mesmos parâmetros)
val state = rememberWideNavigationRailState(initialValue = WideNavigationRailValue.Expanded)
WideNavigationRail(state = state) {
    WideNavigationRailItem(    // uma por linha de items
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        railExpanded = state.targetValue == WideNavigationRailValue.Expanded,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Um `NavigationRailItem` por linha de `items`, dentro de `NavigationRail { … }`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `alwaysShowLabel = <alwaysShowLabel>` (parâmetro do item, não da rail). O slot `header = { … }` da rail (um FAB ou o botão de menu) não é um campo. A largura mínima é de 80 dp, vinda do composable; a altura enche a tela (`fillMaxHeight`). O Scaffold não tem slot para a rail: ela vai numa `Row` antes do conteúdo, dentro de `content = { innerPadding -> Row(Modifier.padding(innerPadding)) { rail; Box(Modifier.weight(1f)) { … } } }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `wide`: Estável, sem opt-in. `WideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }` (`initialValue` é parâmetro de `rememberWideNavigationRailState`; o composable lê o mesmo `state`). Um `WideNavigationRailItem` por linha de `items`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (obrigatório e igual em todos os itens; o `iconPosition` do item acompanha: ao lado do rótulo expandida, acima dele recolhida). O `label` é anulável. `alwaysShowLabel` não existe aqui. O slot `header = { … }` não é um campo. A rail recolhida tem 96 dp de largura e a expandida de 220 a 360 dp, vindas do composable. Fora do Scaffold: ela vai numa `Row` antes do conteúdo, dentro de `content = { innerPadding -> … }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `modal-wide`: Estável, sem opt-in. `ModalWideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }`: recolhida, fica no lugar como a wide; expandida, abre numa janela modal sobre a tela, com scrim; quem expande e recolhe é o `state` (`expand()`, `collapse()` e `toggle()`, numa coroutine), e `hideOnCollapse = true` faz a rail sair da tela ao recolher. Um `WideNavigationRailItem` por linha de `items`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (obrigatório e igual em todos os itens; o `iconPosition` do item acompanha: ao lado do rótulo expandida, acima dele recolhida). O `label` é anulável. O slot `header = { … }` não é um campo. Fica ao lado do conteúdo, numa `Row` antes dele, dentro de `content = { innerPadding -> … }` do Scaffold; o `Scaffold` não tem slot para ela. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Rail estreita**: style=rail, alwaysShowLabel=true
- **Wide expandida**: style=wide, initialValue=Expanded
- **Modal expandida**: style=modal-wide, initialValue=Expanded
- **Mouse sobre**: style=rail, alwaysShowLabel=true, interaction=hovered
- **Com foco**: style=rail, alwaysShowLabel=true, interaction=focused
- **Pressionado**: style=rail, alwaysShowLabel=true, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt` (linhas 146 a 168: `DefaultNavigationRailOverride`, o `Surface` com `Column` de `widthIn(min = 80)`, `padding(vertical = 4)` e `spacedBy(4)`; 200 a 316: `NavigationRailItem`, `defaultMinSize(minHeight = 56)` e `widthIn(min = 80)`; 327 a 332: `containerColor`; 693 a 753: `placeLabelAndIcon`; 767 a 797: as constantes de recuo e tamanho).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/WideNavigationRail.kt` (linhas 209 a 415: `WideNavigationRailLayout`; 230 a 252: a largura mínima 96 ou 220, o espaço entre itens 4 ou 0 e a altura mínima do item 64 ou 48; 264: o topo de 44; 317 a 336: a medida dos itens (`fitPrioritizingWidth`) e a largura do rail pelo item mais largo mais 20; 410: a posição dos itens; 788 a 814: `WideNavigationRailDefaults`, as formas; 855 a 860: `containerColor` e `modalContainerColor`; 993 a 1000: o `Surface` do rail modal expandido; 1135 a 1157: `ItemHorizontalPadding` 20, `WNRVerticalPadding` 44, `CollapsedRailWidth`, `ExpandedRailMinWidth` 220, `ExpandedRailMaxWidth` 360, `TopIconItemMinHeight` 64).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationItem.kt` (linhas 895 a 975: `placeLabelAndTopIcon`; 978 a 1075: `placeAnimatedLabelAndIcon`, o item do rail wide: indicador no topo, ícone a 4, rótulo a 36; a pílula do ícone ao lado a 20 da borda, com ícone a 16 do início e 8 até o rótulo).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/`: `NavigationRailCollapsedTokens.kt` (24 a 31: largura 96, 80 estreita, `TopSpace` 44, `ItemVerticalSpace` 4, cor surface), `NavigationRailExpandedTokens.kt` (24 a 32: largura 220 a 360, `ModalContainerShape` CornerLarge, `ModalContainerColor` surface container), `NavigationRailVerticalItemTokens.kt` (24 a 30: indicador 56 × 32, `IconLabelSpace` 4, label medium), `NavigationRailHorizontalItemTokens.kt` (24 a 30: indicador de 56 de altura, `IconLabelSpace` 8, label large), `NavigationRailBaselineItemTokens.kt` (24 a 32: `ContainerHeight` 64, `IconSize` 24) e `NavigationRailColorTokens.kt` (24 a 31: ícone `on-secondary-container`, indicador `secondary-container`, rótulo `secondary` ou `on-surface-variant`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt` (linhas 112 a 123: `contentColor`; 274 a 302: a camada de estado só no indicador, `ripple()` do item da rail estreita) e `NavigationItem.kt` (linhas 1102 a 1108: o mesmo `IndicatorRipple` dos itens da wide).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Rail estreita (`style: rail`): folha de 80 em `surface`, 4 de padding vertical, destinos de 56 com 4 entre eles. No destino, o indicador de 56 × 32 em `corner-full` fica no topo, o ícone de 24 a 4 dele e o rótulo em `label-medium` a 36 (4 de espaço depois do indicador). Com `alwaysShowLabel` falso o rótulo some nos não selecionados e o ícone fica no centro dos 56 (y = 16).
- Wide recolhida: folha de 96 em `surface`, 44 de topo, destinos de 64 com 4 entre eles, o indicador de 56 × 32 a 20 da borda e o conteúdo (indicador, ícone, rótulo em `label-medium`) no topo do item.
- Wide expandida: largura de no mínimo 220 e no máximo 360, que cresce com a pílula mais larga mais 20 (`hug` com `minWidth` e `maxWidth`); itens de 56 sem espaço entre eles; a pílula de 56 de altura em `corner-full` fica a 20 da borda e mede `16 + ícone 24 + 8 + rótulo + 16`, com o rótulo em `label-large` (14 / 20, peso 500, 0,1).
- Modal expandida: `surface-container` com os quatro cantos de 16 (`corner-large`); recolhida, igual à wide recolhida. Cores como no Compose: ícone `on-secondary-container` selecionado e `on-surface-variant` nos demais, rótulo `secondary` selecionado, indicador `secondary-container`.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered`, `focused` e `pressed`: os tokens da rail **não nomeiam** estados do item; a camada é o ripple do indicador (`StateTokens.kt`). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do indicador do estilo (56 × 32 sob o ícone na rail e na wide recolhida, a pílula de 56 de altura na wide expandida e na modal), por cima dele e com o raio `corner-full`, na cor do ripple sem cor própria, o `contentColor` da folha, `on-surface`. A opacidade vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10).
- **Item do estado:** vale para o item selecionado (decisão 6 da etapa); com nenhum item selecionado nada muda. O Compose desenha o estado no item que o mouse, o foco ou o toque alcança; escolher "o primeiro" pediria o índice do item no `repeat` (#897), e um campo de índice do item fica fora.

**O que ainda difere do Compose**

- O scrim, a elevação do rail modal (Level2 nos tokens, sem sombra no composable), a animação de expandir e recolher, o cabeçalho (`header`) e o botão do rail não fazem parte do desenho; o estilo `modal-wide` desenha só a folha.
- A largura do rail estreito é `hug` com mínimo de 80 (o `widthIn(min = 80)` do Compose); a wide recolhida é limitada a 96 mesmo com rótulo mais largo, como o `actualMinWidth` do Compose.
- O `interaction` é um quadro parado: sem o ripple animado nem o anel de foco por fora da forma (#896), sem `enabled` e sem o ícone sozinho (item sem rótulo, de indicador redondo de 56 × 56): o tipo exige o rótulo.
