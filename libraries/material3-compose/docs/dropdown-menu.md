# Dropdown menu

Menu suspenso com uma lista de ações ou de opções. Menu abre sobre um elemento âncora (um botão de ícone, por exemplo); exposed fica preso a um campo de texto e escolhe um valor entre as opções.

Tipo de anotação: `dropdown-menu` (camada Componentes).

## Campos

| Chave         | Rótulo          | Tipo   | Obrigatório | Opções                       | Padrão | Descrição                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | --------------- | ------ | ----------- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `style`       | Estilo          | enum   | não         | `menu`, `exposed`            | `menu` | menu (DropdownMenu, popup ancorado a um elemento) ou exposed (ExposedDropdownMenuBox, campo de texto com o menu preso a ele; exige opt-in).                                                                                                                                                                                                                        |
| `items`       | Itens           | table  | sim         | ver Colunas abaixo           |        | Um item por linha, na ordem em que aparecem no menu.                                                                                                                                                                                                                                                                                                               |
| `expanded`    | Aberto          | enum   | não         | `true`, `false`              | `true` | true mostra o menu; false o esconde (no exposed sobra só o campo). No código é o estado `expanded` da tela.                                                                                                                                                                                                                                                        |
| `label`       | Rótulo do campo | string | não         |                              |        | Rótulo do campo de texto do exposed. Vazio = sem rótulo. Só vale em exposed.                                                                                                                                                                                                                                                                                       |
| `value`       | Valor do campo  | string | não         |                              |        | Opção escolhida, mostrada no campo de texto do exposed. Só vale em exposed.                                                                                                                                                                                                                                                                                        |
| `interaction` | Interação       | enum   | não         | `none`, `hovered`, `focused` | `none` | Aparência parada do estado de interação, no campo exposto (mouse sobre ou foco: indicador de 2 em primary e rótulo em primary) e no item selecionado do menu aberto (camada de estado); none = sem destaque. Só muda o desenho, não entra no código. O menu não tem enabled no tipo (sem enabled): o campo sempre desenha; o item desabilitado não ganha a camada. |

Colunas de `items` (uma linha por item):

| Chave          | Rótulo           | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| -------------- | ---------------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `text`         | Texto            | string | sim         |                                                                |         |
| `leadingIcon`  | Ícone à esquerda | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `trailingIcon` | Ícone à direita  | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `enabled`      | Habilitado       | enum   | não         | `true`, `false`                                                | `true`  |
| `selected`     | Selecionado      | enum   | não         | `true`, `false`                                                | `false` | true marca o item (fundo secondary-container). É o item que recebe o estado de interação do menu. |

## Compose

- Símbolo: `androidx.compose.material3.DropdownMenu`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Menu.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`       | Símbolo                  |
| ------------- | ------------------------ |
| `menu` (base) | `DropdownMenu`           |
| `exposed`     | `ExposedDropdownMenuBox` |

O caso `exposed` também troca o arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ExposedDropdownMenu.kt`.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style menu: DropdownMenu ancorado a um IconButton
Box {
    IconButton(onClick = { expanded = true }) {
        Icon(Icons.Filled.MoreVert, contentDescription = "Mais opções")
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        // uma linha de items vira um DropdownMenuItem
        DropdownMenuItem(
            text = { Text("Editar") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
        )
        DropdownMenuItem(
            text = { Text("Excluir") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
            enabled = false,
        )
    }
}

// style exposed: ExposedDropdownMenuBox (@OptIn(ExperimentalMaterial3Api::class))
ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    TextField(
        value = "Português",
        onValueChange = {},
        readOnly = true,
        label = { Text("Idioma") },
        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text("Português") },
            onClick = { expanded = false },
            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
        )
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. O menu é um popup ancorado ao composable onde é declarado: ponha-o num `Box` junto do elemento âncora (o `IconButton` que o abre) e ligue `expanded` a um estado da tela (`var expanded by remember { mutableStateOf(<expanded>) }`), com `onDismissRequest = { expanded = false }`. Dentro, um `DropdownMenuItem` por linha de `items`: `text = { Text(<text>) }`, `onClick = { expanded = false; … }`, `leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }` e `trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }` só quando preenchidos, e `enabled = <enabled>`. A largura vai de 112 a 280 dp pelo conteúdo. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`.

Variante `exposed`: Exige @OptIn(ExperimentalMaterial3Api::class) (o `ExposedDropdownMenuBox` e o `ExposedDropdownMenu` são experimentais no commit fixado). `ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) { … }`, com `expanded` ligado a um estado da tela (`var expanded by remember { mutableStateOf(<expanded>) }`). Dentro vão um `TextField` (ou `OutlinedTextField`, como no tipo text-field) com `value = <value>`, `onValueChange = {}`, `readOnly = true`, `label = { Text(<label>) }`, `trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }` e `Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)` (o `menuAnchor()` sem argumentos está `@Deprecated`), e depois `ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) { … }`, extensão do `ExposedDropdownMenuBoxScope`, com um `DropdownMenuItem` por linha de `items` (`onClick` guarda a escolha, atualiza `<value>` e fecha com `expanded = false`; `contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding`). O menu tem a largura do campo (`matchAnchorWidth = true`, o padrão).

## Exemplos

- **Menu aberto**: style=menu, expanded=true
- **Campo exposto fechado**: style=exposed, expanded=false, label=País, value=Brasil
- **Campo exposto aberto**: style=exposed, expanded=true, label=Idioma, value=Português
- **Mouse sobre**: style=exposed, expanded=false, label=País, value=Brasil, interaction=hovered
- **Com foco**: style=exposed, expanded=true, label=Idioma, value=Português, interaction=focused

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, nenhum nó de texto declara `family` (todos herdam `font-sans`) e os ícones são o nó `icon` do conjunto da biblioteca (os do item pelo `$switch` do campo, a seta do campo pelo estado `expanded`), sem caminho SVG no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Menu.kt` (linhas 181 a 258: `MenuDefaults`, `ShadowElevation` = `MenuTokens.ContainerElevation`, a forma, a cor do contêiner e `itemColors()` pelos `ListTokens`, `DropdownMenuItemContentPadding` de 12 na horizontal; 359 a 417: `DropdownMenuContent`, o `Surface` e o `Column` com `padding(vertical = DropdownMenuVerticalPadding)` e `width(IntrinsicSize.Max)`; 419 a 505: `DropdownMenuItemContent`, a `Row` com `sizeIn(minWidth = 112, maxWidth = 280, minHeight = 48)`, `padding(contentPadding)`, `ProvideTextStyle(labelLarge)` na linha 450, o ícone inicial e o final em `Box` de largura mínima 24 e o texto com 12 de cada lado que tem ícone; 523 a 528: as constantes 48, 12, 8, 112 e 280).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MenuTokens.kt` (`ContainerColor` `SurfaceContainer`, `ContainerElevation` `Level2` = 3, `ContainerShape` `CornerExtraSmall`) e `tokens/ListTokens.kt` (`ListItemLabelTextColor` `OnSurface`, `ListItemLeadingIconColor` e `ListItemTrailingIconColor` `OnSurfaceVariant`, as cores do desabilitado `OnSurface` com opacidade 0,38, ícones de 24) e `tokens/ElevationTokens.kt` (`Level2` 3 dp).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ExposedDropdownMenu.kt` (linhas 137 a 150: `ExposedDropdownMenuBox`; 310 a 365: o `ExposedDropdownMenu` com `matchAnchorWidth = true` e `exposedDropdownSize`; 512 a 514: `TrailingIcon`, o `Icons.Filled.ArrowDropDown` girado 180 graus quando aberto; 844 e 845: `ItemContentPadding`; 1536: `ExposedDropdownMenuItemHorizontalPadding` 16) e `tokens/FilledAutocompleteTokens.kt` (campo `SurfaceContainerHighest` com forma `CornerExtraSmallTop`, indicador de 1 em `OnSurfaceVariant`, rótulo e texto `BodyLarge`, ícone final de 24 em `OnSurfaceVariant`, menu `SurfaceContainer`, `Level2` e `CornerExtraSmall`). O campo segue o `TextField` filled descrito em `text-field.md`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MenuTokens.kt` (linhas 24 a 29: `FocusIndicatorColor` e os papéis `ListItemSelected*`: `ListItemSelectedContainerColor` `SecondaryContainer`, `ListItemSelectedLabelTextColor` e `ListItemSelectedLeadingTrailingIconColor` `OnSecondaryContainer`), `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (linhas 45 a 73, o campo exposto é um `TextField` filled) e `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ListTokens.kt`.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Menu: `surface-container`, forma `corner-extra-small` (4), sombra do nível 2 (`elevation-shadow`, deslocamento 2 e desfoque 6, os valores de `elevation-2-y` e `elevation-2-blur`), padding de 8 em cima e embaixo e itens a partir do topo. A largura vai de 112 a 280 (`minWidth` e `maxWidth` do quadro), como o `sizeIn` dos itens; fechado (`expanded: false`) o menu não se desenha.
- Item: altura mínima de 48 (`minHeight`), que cresce com o texto quando ele quebra; padding horizontal de 12 no menu e de 16 no exposed (`ItemContentPadding`). Texto em `label-large` (14/20, peso 500, espaçamento 0,1, o `labelLarge` do `ProvideTextStyle`) em `on-surface`; ícone à esquerda e à direita de 24 em `on-surface-variant`, com 12 entre o ícone e o texto (o `padding` do `Box` do texto). Desabilitado: texto e ícones em `on-surface` a 0,38 (`state-disabled-content`).
- Exposed: o campo de 56 é o filled do `TextField`: fundo `surface-container-highest` com o raio superior de `corner-extra-small`, indicador de 1 só embaixo (`stroke.sides: ["bottom"]`) em `on-surface-variant`, rótulo em `body-large` quando não há valor e em `body-small` sobre o valor quando há, valor em `body-large` numa linha, seta de 24 em `on-surface-variant` a 12 da borda (`arrow_drop_down` fechado e `arrow_drop_up` aberto, o `ArrowDropDown` girado 180 graus). O menu vem logo abaixo, com a largura do campo (`matchAnchorWidth`).

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered` e `focused`: o campo exposto é um `TextField` filled, que define `Hover*` e `Focus*` (sem `Pressed*` nem `Dragged*`), e os tokens do menu (`MenuTokens.kt`) não definem estado de pressionado nem de arrastado. O estado vale para **dois lugares** (decisão 6 da etapa):

- **Campo exposto** (estilo `exposed`): o mesmo desenho do `text-field` filled. Com foco, o indicador passa a 2 de espessura em `primary` e o rótulo vai a `primary` (`FilledTextFieldTokens.FocusActiveIndicatorColor`, `FocusActiveIndicatorHeight` e `FocusLabelColor`, linhas 63, 64 e 66); com o mouse, o indicador vai a `on-surface` (`HoverActiveIndicatorColor`, linha 70) e o rótulo fica `on-surface-variant`. O campo do menu não tem erro nem desabilitado, então não há as cores `Error*`.
- **Item selecionado do menu aberto:** a coluna `selected` da tabela `items` marca o item. Ele leva o fundo `secondary-container`, o texto e os ícones em `on-secondary-container` (`ListItemSelectedContainerColor`, `ListItemSelectedLabelTextColor` e `ListItemSelectedLeadingTrailingIconColor`, linhas 26 a 28) e, com `hovered` ou `focused`, o nó `estado`: um `rect` do tamanho do item, na cor do rótulo selecionado, `on-secondary-container`, com `opacity` pelos tokens `state-hover` (0,08) e `state-focus` (0,10). Os tokens do menu **não nomeiam** a camada: é a convenção do `card`, a cor do conteúdo.
- **Sem item selecionado** o menu não desenha camada (como o `segmented-button`, sem segmento selecionado). A decisão 6 manda usar o primeiro item nesse caso, mas isso pede o índice no `repeat`, que o formato 4 não tem (#897).
- **Item desabilitado** (`enabled` `false` na linha) não recebe a camada: o desabilitado vence, mesmo selecionado.

**O que ainda difere do Compose**

- O menu do estilo `menu` tem a largura da caixa da marcação (entre 112 e 280); o Compose usa a maior largura intrínseca dos itens (`IntrinsicSize.Max`) dentro do mesmo intervalo.
- O menu aparece no desenho logo abaixo do campo (exposed) ou sozinho (menu): o popup do Compose é posicionado pela âncora, pela janela e pelo `offset`, e a animação de escala e alfa da abertura não existe.
- O `interaction` é um quadro parado: sem ripple animado, cursor e seleção por teclado. O anel de foco por fora da forma não é desenhado (#896). O `FocusIndicatorColor` (`secondary`, linha 25) é esse anel. A coluna `selected` e o fundo `secondary-container` do item selecionado são desenho do M3 por `MenuTokens.ListItemSelected*`; o `DropdownMenuItem` do Compose 1.4.0 não tem `selected`, e a coluna não entra no `code`.
- A sombra é uma só, em preto a 30%; o Compose compõe duas (ambiente e ponto) e a tonal da elevação. O `y` (2) e o `blur` (6) são números no componente: o `shadow` do formato só aceita `$token` na cor, não em `y` nem em `blur`, então trocar `elevation-2-y` ou `elevation-2-blur` na especialização não chega ao desenho.
- O raio superior do campo do exposed vem de um retângulo com raio 4 (por token) mais alto que o contêiner, que o recorta: a lista de 4 raios (`cornerRadius`) não aceita `$token`.
- O valor do campo do exposed fica numa linha (recortado), como o `singleLine`; o `TextField` do Compose sem `singleLine` quebra e cresce. Sem rolagem do menu (`verticalScroll`) quando os itens passam da altura disponível.
- Sem `leadingIcon` e `trailingIcon` livres (`composable`), `contentPadding` próprio, `DropdownMenuItem` com `colors` próprio, `onDismissRequest`, e `ExposedDropdownMenuBox` com `OutlinedTextField` ou editável (`menuAnchor` de entrada).
