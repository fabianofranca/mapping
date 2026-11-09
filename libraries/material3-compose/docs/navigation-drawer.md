# Navigation drawer

Folha de navegação lateral. Modal cobre a tela com um scrim; dismissible empurra o conteúdo e se dispensa; permanent fica sempre à vista. Cada linha de Itens é um destino.

Tipo de anotação: `navigation-drawer` (camada Componentes).

## Campos

| Chave         | Rótulo    | Tipo   | Obrigatório | Opções                                  | Padrão  | Descrição                                                                                                                                                                                                                                                                                              |
| ------------- | --------- | ------ | ----------- | --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `headline`    | Cabeçalho | string | não         |                                         |         | Título opcional no topo da folha, acima dos itens.                                                                                                                                                                                                                                                     |
| `style`       | Estilo    | enum   | não         | `modal`, `dismissible`, `permanent`     | `modal` | modal (ModalNavigationDrawer), dismissible (DismissibleNavigationDrawer) ou permanent (PermanentNavigationDrawer).                                                                                                                                                                                     |
| `items`       | Itens     | table  | sim         | ver Colunas abaixo                      |         | Um destino por linha, na ordem em que aparecem na folha.                                                                                                                                                                                                                                               |
| `interaction` | Interação | enum   | não         | `none`, `hovered`, `focused`, `pressed` | `none`  | Aparência parada do estado de interação do item selecionado: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O tipo não tem desabilitado (sem enabled): o estado sempre desenha. Sem item selecionado, nada muda. |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |
| `badge`    | Selo        | string | não         |                                                                |         |

## Compose

- Símbolo: `androidx.compose.material3.ModalNavigationDrawer`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo                                                        |
| -------------- | -------------------------------------------------------------- |
| `modal` (base) | `ModalNavigationDrawer` (folha `ModalDrawerSheet`)             |
| `dismissible`  | `DismissibleNavigationDrawer` (folha `DismissibleDrawerSheet`) |
| `permanent`    | `PermanentNavigationDrawer` (folha `PermanentDrawerSheet`)     |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style modal: o drawer envolve o Scaffold; a marcação é a folha
ModalNavigationDrawer(
    drawerContent = {
        ModalDrawerSheet {
            Text("Mapping", Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)
            NavigationDrawerItem(    // uma por linha de items
                label = { Text("Caixa de entrada") },
                selected = true,
                onClick = { /* lógica da tela */ },
                icon = { Icon(Icons.Filled.Email, contentDescription = null) },
                badge = { Text("24") },
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
            )
        }
    },
    drawerState = rememberDrawerState(DrawerValue.Closed),
) {
    Scaffold { innerPadding -> /* conteúdo da tela */ }
}

// style dismissible: DismissibleNavigationDrawer + DismissibleDrawerSheet (mesmos itens)
// style permanent: PermanentNavigationDrawer + PermanentDrawerSheet (sem drawerState)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. `ModalNavigationDrawer(drawerContent = { ModalDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <conteúdo da tela> }`; dentro da `ModalDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. A marcação é a folha: o conteúdo da tela vai no último parâmetro (`content`) e o scrim é do composable. Abrir e fechar: `drawerState.open()` e `close()` numa coroutine. O drawer envolve o `Scaffold` (`ModalNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (até 360 dp) é do composable, e `Modifier.width(<largura da marcação>.dp)` ajusta a folha. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `dismissible`: Estável, sem opt-in. `DismissibleNavigationDrawer(drawerContent = { DismissibleDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <conteúdo da tela> }`; dentro da `DismissibleDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. Sem scrim: ao abrir, a folha empurra o conteúdo ao lado dela. Abrir e fechar: `drawerState.open()` e `close()` numa coroutine. O drawer envolve o `Scaffold` (`DismissibleNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (até 360 dp) é do composable. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `permanent`: Estável, sem opt-in. `PermanentNavigationDrawer(drawerContent = { PermanentDrawerSheet { … } }) { <conteúdo da tela> }`, sem `drawerState` (sempre visível, ao lado do conteúdo numa `Row`); dentro da `PermanentDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. O drawer envolve o `Scaffold` (`PermanentNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (de 240 a 360 dp) é do composable, e `PermanentDrawerSheet(Modifier.width(<largura da marcação>.dp))` a ajusta. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Modal com cabeçalho**: style=modal, headline=Mapping
- **Dismissible**: style=dismissible, headline=Pastas
- **Permanente sem cabeçalho**: style=permanent
- **Mouse sobre**: style=modal, headline=Mapping, interaction=hovered
- **Com foco**: style=modal, headline=Mapping, interaction=focused
- **Pressionado**: style=modal, headline=Mapping, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt` (linhas 590 a 612: `ModalDrawerSheet`, forma e cor padrão e elevação Level0; 679 a 700: `DismissibleDrawerSheet`, `RectangleShape`; 764 a 784: `PermanentDrawerSheet`; 786 a 857: `DrawerSheet`, a largura entre 240 e 360 e o `Surface`; 997 a 1035: `DrawerDefaults`, `shape`, `standardContainerColor`, `modalContainerColor` e as elevações; 1068 a 1111: `NavigationDrawerItem`, `heightIn(min = 56)`, `fillMaxWidth()`, `padding(start = 16.dp, end = 24.dp)` e os `Spacer` de 12; 1146 a 1188: as cores do item e o `ItemPadding` de 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationDrawerTokens.kt` (linhas 28 a 58: cores ativa e inativa, `ActiveIndicatorHeight` 56, `ActiveIndicatorShape` full, `ActiveIndicatorWidth` 336, `ContainerShape` CornerLargeEnd, `ContainerWidth` 360, `HeadlineColor` e `HeadlineFont` title small, `LabelTextFont` e `LargeBadgeLabelFont` label large, `ModalContainerColor` surface container low, `StandardContainerColor` surface).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt` (linhas 1076 a 1090: o `Surface` do item recebe `interactionSource` e `color = colors.containerColor(selected)`, de modo que o ripple cobre o item inteiro e leva o `contentColor` da cor do fundo).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationDrawerTokens.kt` (linhas 24 a 51: `Active*`/`Inactive*` `Hover`, `Focus` e `Pressed` do ícone e do rótulo, todos iguais à cor do estado normal; `FocusIndicatorColor` `Secondary`, linha 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Folha de 360 de largura: a modal em `surface-container-low` com os cantos do fim de 16 (`CornerLargeEnd`); a dismissible e a permanent em `surface`, sem cantos. Sem sombra nem tonal (as elevações padrão são Level0).
- Margem de 12 dos lados (`NavigationDrawerItemDefaults.ItemPadding`) e de 12 em cima; itens de 56 de altura mínima e 336 de largura, na forma `corner-full`, sem espaço entre eles. `secondary-container` no selecionado.
- Item: 16 de recuo no começo, ícone de 24, 12 até o rótulo (que ocupa o resto, `weight(1f)`), 12 até o selo e 24 de recuo no fim. Ícone, rótulo e selo usam a mesma cor: `on-secondary-container` no selecionado e `on-surface-variant` nos demais.
- Rótulo e selo em `label-large` (14 / 20, peso 500, 0,1); cabeçalho opcional de 56 de altura com 16 de recuo, em `title-small` e `on-surface-variant` (`HeadlineFont` e `HeadlineColor`).

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none` e os três estados que o `NavigationDrawerTokens.kt` nomeia (`ActiveHover*`, `ActiveFocus*`, `ActivePressed*`): `hovered`, `focused` e `pressed` (não há `Dragged*`). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do item (a pílula de 56, `corner-full`), por cima dele, na cor do conteúdo do item selecionado, `on-secondary-container` (o ripple do `Surface` usa o `contentColor` do fundo `secondary-container`). A opacidade vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10). Os tokens do drawer **não nomeiam** a camada nem a opacidade: é o ripple do `Surface`, parado.
- **Cores do conteúdo:** os `Active*Hover/Focus/Pressed*` repetem `on-secondary-container`: ícone, rótulo e selo não mudam.
- **Item do estado:** vale para o item selecionado (decisão 6 da etapa); com nenhum item selecionado nada muda. O Compose desenha o estado no item que o mouse, o foco ou o toque alcança; escolher "o primeiro" pediria o índice do item no `repeat` (#897), e um campo de índice do item fica fora. Os exemplos de estado guardam só valores simples e a tabela `items` não cabe neles: no Catálogo o exemplo desenha o tipo sem destinos, e o estado aparece na prévia (Playground, com os `items` do `preview`) e na marcação com `items`.

**O que ainda difere do Compose**

- O `NavigationDrawerItem` não aplica estilo de texto: a tipografia vem do `Text` que a tela passa. O desenho usa a do arquivo de tokens (`LabelTextFont`, `LargeBadgeLabelFont`, `HeadlineFont`); o exemplo oficial do cabeçalho usa `titleLarge`. O cabeçalho de 56 e o espaço de 12 em cima são convenção do desenho (do exemplo), não do composable.
- O raio `[0, 16, 16, 0]` da modal é literal: a lista de raios do formato não aceita `$token`, então o 16 de `CornerLargeEnd` não vem do token `corner-large`.
- A largura do Compose fica entre 240 e 360 (`sizeIn`); aqui a folha ocupa a largura da marcação. Scrim, gesto, animação, o selo como composable (aqui é texto) e as variantes `DrawerState` ficam fora do desenho.
- O `interaction` é um quadro parado: sem o ripple animado e sem o anel de foco por fora da forma (`FocusIndicatorColor`, #896).
