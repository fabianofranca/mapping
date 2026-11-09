# Tabs

Fileira de abas para trocar entre vistas de um mesmo nível. Primary fica sob a barra do topo; Secondary separa conteúdo dentro de uma área; as roláveis aceitam mais abas do que cabem. Cada linha de Abas é uma aba.

Tipo de anotação: `tabs` (camada Componentes).

## Campos

| Chave          | Rótulo           | Tipo  | Obrigatório | Opções                                                               | Padrão    | Descrição                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------- | ----- | ----------- | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`        | Abas             | table | sim         | ver Colunas abaixo                                                   |           | Uma aba por linha, na ordem em que aparecem; só uma com Selecionada = true.                                                                                                                                                                                                                            |
| `style`        | Estilo           | enum  | não         | `primary`, `secondary`, `primary-scrollable`, `secondary-scrollable` | `primary` | primary (indicador de 3 no tamanho do rótulo), secondary (indicador de 3 na largura da aba) ou a versão rolável de cada um (abas com a largura do conteúdo, no mínimo 90, e recuo inicial de 52).                                                                                                      |
| `iconPosition` | Posição do ícone | enum  | não         | `top`, `leading`                                                     | `top`     | top (Tab) põe o ícone acima do texto, e a fileira passa de 48 para 72; leading (LeadingIconTab) põe o ícone à esquerda do texto, em 48. Só vale para as abas com ícone e texto.                                                                                                                        |
| `interaction`  | Interação        | enum  | não         | `none`, `hovered`, `focused`, `pressed`                              | `none`    | Aparência parada do estado de interação do item selecionado: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O tipo não tem desabilitado (sem enabled): o estado sempre desenha. Sem item selecionado, nada muda. |

Colunas de `items` (uma linha por aba):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionada | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.PrimaryTabRow`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TabRow.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`                | Símbolo                     |
| ---------------------- | --------------------------- |
| `primary` (base)       | `PrimaryTabRow`             |
| `secondary`            | `SecondaryTabRow`           |
| `primary-scrollable`   | `PrimaryScrollableTabRow`   |
| `secondary-scrollable` | `SecondaryScrollableTabRow` |

A aba em si não depende do estilo, e sim de `iconPosition`: `top` (ou aba sem ícone) é `Tab`, e `leading` é `LeadingIconTab`, os dois em `Tab.kt`.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
PrimaryTabRow(selectedTabIndex = 0) {    // style secondary: SecondaryTabRow, primary-scrollable: PrimaryScrollableTabRow…
    // uma linha de items vira uma Tab (iconPosition top)
    Tab(
        selected = true,
        onClick = { /* lógica da tela */ },
        text = { Text("Início") },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
    )
    Tab(
        selected = false,
        onClick = { /* ... */ },
        text = { Text("Buscar") },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
    )
    // iconPosition leading: LeadingIconTab(selected, onClick, text = { … }, icon = { … })
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> A fileira é `PrimaryTabRow(selectedTabIndex = <índice da linha de items com selected = true>) { … }` (`style` escolhe a fileira). Dentro, uma aba por linha de `items`: com `iconPosition = top` (ou sem ícone), `Tab(selected = <selected>, onClick = …, text = { Text(<label>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) })` (omita `icon` quando a coluna estiver vazia); com `iconPosition = leading`, `LeadingIconTab(selected, onClick, text = { Text(<label>) }, icon = { Icon(…) })`, que pede `text` e `icon`. `Tab` e `LeadingIconTab` estão em `Tab.kt`, do mesmo pacote, e vêm de `androidx.compose.material3`. `TabRow` e `ScrollableTabRow` estão `@Deprecated` (substituídos pelas quatro fileiras): não os use. As quatro fileiras e as duas abas são estáveis, sem opt-in. A fileira fixa reparte a largura por igual; as roláveis (`edgePadding` 52, `minTabWidth` 90, `scrollState`) deixam cada aba com a largura do conteúdo. Largura e posição vêm do `Modifier` (a fileira não tem tamanho próprio; costuma ir sob o `TopAppBar` ou acima do conteúdo da página). Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Primárias com ícone acima**: style=primary, iconPosition=top
- **Secundárias com ícone à esquerda**: style=secondary, iconPosition=leading
- **Primárias roláveis**: style=primary-scrollable, iconPosition=leading
- **Mouse sobre**: style=primary, iconPosition=top, interaction=hovered
- **Com foco**: style=primary, iconPosition=top, interaction=focused
- **Pressionado**: style=primary, iconPosition=top, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tab.kt` (linhas 90 a 123: `Tab` com texto e ícone, o estilo `PrimaryNavigationTabTokens.LabelTextFont`; 154 a 196: `LeadingIconTab`, altura `SmallTabHeight`, `padding(horizontal = 16)` e o espaço de 8; 229 a 262: a `Tab` base, que ocupa a largura da fileira; 270 a 293: `TabTransition` e a cor do conteúdo; 301 a 364: `TabBaselineLayout`, a altura 48 ou 72; 367 a 417: `placeTextOrIcon` e `placeTextAndIcon`; 420 a 438: `SmallTabHeight` 48, `LargeTabHeight` 72, `HorizontalTextPadding` 16, `SingleLineTextBaselineWithIcon` 14, `IconDistanceFromBaseline` 20.sp e `TextDistanceFromLeadingIcon` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TabRow.kt` (linhas 150 a 165: `PrimaryTabRow`, indicador com `matchContentSize = true`; 201 a 216: `SecondaryTabRow`, indicador com `matchContentSize = false`; 253 a 282 e 324 a 350: as fileiras roláveis; 392 a 505: `TabRowImpl`, `tabWidth = tabRowWidth / tabCount` (447) e o indicador de no mínimo 24 (459 a 461); 511 a 650: `ScrollableTabRowImpl`, a aba de `maxOf(minTabWidth, largura)` (605) e o indicador centrado na aba (637); 682 a 745: `TabIndicatorOffsetNode`; 976 a 1090: `TabRowDefaults` com `ScrollableTabRowMinTabWidth` 90 (981), `ScrollableTabRowEdgeStartPadding` 52 (987), as cores do contêiner e do conteúdo (998 a 1018), `PrimaryIndicator` (1054) e `SecondaryIndicator` (1078)).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Divider.kt` (linhas 49 a 61: `HorizontalDivider`, uma linha de `DividerDefaults.Thickness`; 113 a 116: `DividerDefaults`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PrimaryNavigationTabTokens.kt` (linhas 25 a 51: indicador de 3 em `Primary`, `RoundedCornerShape(3)`, contêiner `Surface` de 48, ícone de 24, cores ativa `Primary` e inativa `OnSurfaceVariant`, `LabelTextFont` `TitleSmall`) e `SecondaryNavigationTabTokens.kt` (linhas 24 a 42: ativa `OnSurface`, inativa `OnSurfaceVariant`, `ContainerHeight` 48).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DividerTokens.kt` (linhas 23 a 26: `Color` `OutlineVariant`, `Thickness` 1) e `TypographyTokens.kt` (`TitleSmall`: 14, linha 20, peso 500, espaçamento 0,1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PrimaryNavigationTabTokens.kt` e `tokens/SecondaryNavigationTabTokens.kt` (linhas 33 a 50 e 32 a 42: `Active*`/`Inactive*` `Hover`, `Focus` e `Pressed` do ícone e do rótulo; só o `Primary` nomeia `Active*`, e todos repetem a cor do estado normal) e `Tab.kt` (linhas 166 a 169: `ripple(bounded = true, color = selectedContentColor)`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Fileira fixa: as abas dividem a largura por igual (`repeat.distribute: "fill"`, o `tabWidth = tabRowWidth / tabCount` do `TabRowImpl`), sobre o fundo `surface`. A altura é a da marcação: 48 (`SmallTabHeight`) e 72 com ícone e texto empilhados (`LargeTabHeight`); aba só com texto ou só com ícone fica centrada na altura (`placeTextOrIcon`).
- Divisória de 1 em `outline-variant` embaixo (`HorizontalDivider`), um quadro com `stroke.sides: ["bottom"]` desenhado por baixo das abas e dos indicadores. O `HorizontalDivider` padrão usa `DividerTokens.Color` (`OutlineVariant`), e não o `DividerColor` do token da secundária.
- Rótulo em `title-small` pelos tokens (14, linha 20, peso 500, espaçamento 0,1), sem `family`. Ícone do conjunto da biblioteca (nó `icon`) de 24, na mesma cor do rótulo.
- Cores: a aba selecionada em `primary` nas primárias e em `on-surface` nas secundárias (`ActiveLabelTextColor` e `ActiveIconColor` de cada token); as outras em `on-surface-variant` (`InactiveLabelTextColor`). Light e dark seguem os mesmos tokens.
- Ícone acima do texto (`Tab`): o texto fica a 12 do fundo da aba (`tabHeight - baseline - (14 + 3)`, com a linha de base do Roboto 14/20 em 15) e o ícone a 5 acima dele, o que põe o ícone a 11 do topo na aba de 72. Ícone à esquerda (`LeadingIconTab`): ícone, 8 e texto, centrados juntos.
- Indicador primário: 3 de altura em `primary`, canto 3 (o `RoundedCornerShape(3)` do token, que numa altura de 3 vira 1,5), do tamanho do conteúdo (`matchContentSize`: o texto, ou o ícone, o espaço e o texto no `LeadingIconTab`) e no mínimo 24 (`minWidth`), centrado na aba. Indicador secundário: 3 de altura (`SecondaryIndicator` usa `ActiveIndicatorHeight`, e não 2) em `primary`, na largura toda da aba, sem canto, desenhado por `stroke.sides: ["bottom"]` de 3. Só a aba selecionada leva indicador.
- Roláveis: recuo inicial de 52 (`ScrollableTabRowEdgeStartPadding`), abas com a largura do conteúdo mais 2 vezes 16 (`HorizontalTextPadding`) e no mínimo 90 (`minWidth`, no lugar do retângulo sem altura que fazia isso na `formatVersion` 2). Com ícone à esquerda a aba mede 16 + ícone + 8 + texto + 16.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none` e os três estados que os tokens das abas nomeiam: `hovered`, `focused` e `pressed` (não há `Dragged*`). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho da aba (a aba inteira, o `ripple(bounded = true)` do `Tab`), atrás do conteúdo, na cor do ripple: `selectedContentColor`, que no desenho é a cor da aba selecionada (`primary` nas primárias, `on-surface` nas secundárias). A opacidade vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10). Os tokens das abas **não nomeiam** a camada nem a opacidade: é o ripple do `Tab` parado.
- **Cores do conteúdo:** `ActiveHover*`, `ActiveFocus*` e `ActivePressed*` (ícone e rótulo) repetem `primary`, e os `Inactive*` `on-surface`: são as cores de sempre, então ícone e rótulo não mudam.
- **Item do estado:** vale para o item selecionado (decisão 6 da etapa); com nenhum item selecionado nada muda. O Compose desenha o estado no item que o mouse, o foco ou o toque alcança; escolher "o primeiro" pediria o índice do item no `repeat` (#897), e um campo de índice do item fica fora. Os exemplos de estado guardam só valores simples e a tabela `items` não cabe neles: no Catálogo o exemplo desenha o tipo sem destinos, e o estado aparece na prévia (Playground, com os `items` do `preview`) e na marcação com `items`.

**O que ainda difere do Compose**

- Cor das abas não selecionadas: no Compose, sem `selectedContentColor` e `unselectedContentColor`, a `Tab` pinta todas as abas com a cor do conteúdo da fileira (`unselectedContentColor` vale o `selectedContentColor`), e as inativas só ficam em `OnSurfaceVariant` quando a tela passa as cores. O desenho segue os tokens (`InactiveLabelTextColor`) e o `code` do tipo não passa as cores.
- Sem o ripple animado nem o anel de foco por fora da forma (#896), sem a animação do indicador e da cor, sem a rolagem (`scrollState`) nem o deslocamento que centraliza a aba selecionada: nas roláveis, o que passa da largura sai cortado.
- A altura da fileira depende do conteúdo no Compose (72 se alguma aba tem ícone e texto empilhados); aqui é a da marcação. Sem retângulo (tela vinda de um JSON), o `sizing.height` é o literal 48, porque `sizing` não aceita expressão.
- Rótulo longo: o Compose quebra em até duas linhas e sobe o texto (`DoubleLineTextBaselineWithIcon` 6); o desenho mantém uma linha, sem quebra, e o indicador acompanha a largura inteira do texto mesmo quando passa da aba (o Compose limita ao `tabWidth`).
- A posição vertical do texto parte da linha de base do Compose; o motor não alinha por linha de base, então o 15 é uma estimativa do Roboto 14/20 (`ascent` de 0,928 e meia entrelinha extra) e vale para essa fonte e esse tamanho.
- Sem o `badge` sobre o ícone (`Modifier.badgeBounds`) e sem `Tab` de conteúdo livre.
