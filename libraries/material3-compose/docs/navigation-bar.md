# Navigation bar

Barra de navegação inferior com três a cinco destinos. Cada linha de Itens é um destino.

Tipo de anotação: `navigation-bar` (camada Componentes).

## Campos

| Chave             | Rótulo                  | Tipo  | Obrigatório | Opções                                  | Padrão | Descrição                                                                                                                                                                                                                                                                                              |
| ----------------- | ----------------------- | ----- | ----------- | --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`           | Itens                   | table | sim         | ver Colunas abaixo                      |        | Um destino por linha, na ordem em que aparecem na barra (de três a cinco).                                                                                                                                                                                                                             |
| `alwaysShowLabel` | Sempre mostrar o rótulo | enum  | não         | `true`, `false`                         | `true` | false mostra o rótulo só no destino selecionado.                                                                                                                                                                                                                                                       |
| `interaction`     | Interação               | enum  | não         | `none`, `hovered`, `focused`, `pressed` | `none` | Aparência parada do estado de interação do item selecionado: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. O tipo não tem desabilitado (sem enabled): o estado sempre desenha. Sem item selecionado, nada muda. |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.NavigationBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
NavigationBar {
    // uma linha de items vira um NavigationBarItem
    NavigationBarItem(
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        alwaysShowLabel = true,
    )
    NavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Buscar") },
        alwaysShowLabel = true,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Um `NavigationBarItem` por linha de `items`, dentro de `NavigationBar { … }`: `selected`, `onClick`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `alwaysShowLabel = <alwaysShowLabel>` (parâmetro do item, não da barra). Dentro de um Scaffold, a barra vai em `bottomBar`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Sempre com rótulo**: alwaysShowLabel=true
- **Rótulo só no ativo**: alwaysShowLabel=false
- **Mouse sobre**: alwaysShowLabel=true, interaction=hovered
- **Com foco**: alwaysShowLabel=true, interaction=focused
- **Pressionado**: alwaysShowLabel=true, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt` (linhas 138 a 158: `DefaultNavigationBarOverride`, o `Surface` com `Row` de `defaultMinSize(minHeight = NavigationBarHeight)` e `Arrangement.spacedBy(NavigationBarItemHorizontalPadding)`; 196 a 316: `NavigationBarItem`, o `weight(1f)`, o rótulo que só aparece com `alwaysShowLabel` ou selecionado; 321 a 329: `NavigationBarDefaults`, `Elevation` Level0 e `containerColor`; 407 a 411: as cores do item; 680 a 742: `placeLabelAndIcon`, as posições do ícone e do rótulo; 752 a 772: `NavigationBarHeight`, `NavigationBarItemHorizontalPadding` 8, `NavigationBarIndicatorToLabelPadding` 4, `IndicatorHorizontalPadding` e `IndicatorVerticalPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (linhas 24 a 38: `ContainerColor` surface container, `ItemActiveIconColor`, `ItemActiveIndicatorColor`, `ItemActiveIndicatorShape` full, `ItemActiveLabelTextColor` secondary, `ItemInactive*` on surface variant, `NavShape` none, `TallContainerHeight` 80, `LabelTextFont` label medium).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarVerticalItemTokens.kt` (linhas 24 a 27: `ActiveIndicatorHeight` 32, `ActiveIndicatorWidth` 56, `IconSize` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt` (linhas 102 a 115: `contentColor` = `contentColorFor(containerColor)`; 272 a 294: a camada de estado só aparece no indicador, `indicatorRipple` com `ripple()` recortado em `ItemActiveIndicatorShape`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationBarTokens.kt` (linhas 24 a 38: não define cor nem opacidade de estado do item).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Contêiner de 80 (`TallContainerHeight`, o `defaultMinSize` da linha) em `surface-container`, sem canto e sem sombra (a elevação padrão do composable é Level0, não a Level2 do arquivo de tokens).
- Os destinos têm a mesma largura (`weight(1f)`), com 8 entre eles e nenhuma margem nas pontas: o `repeat` com `distribute: "fill"` e `gap` 8.
- Indicador do selecionado de 56 × 32 (`IndicatorHorizontalPadding` 16 e `IndicatorVerticalPadding` 4 em volta do ícone de 24) na forma `corner-full`, em `secondary-container`; o não selecionado não pinta o fundo. O ícone de 24 (nó `icon`) fica no centro do indicador: `on-secondary-container` selecionado, `on-surface-variant` nos demais.
- Com rótulo, o conteúdo é indicador (a 12 do topo), 4 de espaço e o rótulo em `label-medium` (12 / 16, peso 500, 0,5 de espaçamento): `secondary` selecionado, `on-surface-variant` nos demais. Com `alwaysShowLabel` falso o rótulo some nos não selecionados e o ícone desce para o centro da altura (`unselectedIconY = (height - icon) / 2`, 28); a posição do conteúdo muda com o `justify` e o `padding` por expressão.
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo` usa `font.verticalAlign: "cap-middle"` e segue `hug` na altura, porque o pai também mede pelo texto; a caixa do texto é a linha, centrada no pai. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered`, `focused` e `pressed`: o `NavigationBarTokens.kt` **não nomeia** estados do item, mas o `NavigationBarItem` desenha a camada pelo ripple do Material (`StateTokens.kt`), e esses três estados são os que o ripple tem. **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do indicador (56 × 32) e de raio `corner-full`, por cima dele (o ripple do Compose é recortado só no indicador, não no destino inteiro), na cor do ripple sem cor própria, que é o `contentColor` da barra, `on-surface`. A opacidade vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10). Não é um quadro que um token do item defina: é o que o ripple do Compose pinta parado.
- **Item do estado:** vale para o item selecionado (decisão 6 da etapa); com nenhum item selecionado nada muda. O Compose desenha o estado no item que o mouse, o foco ou o toque alcança; escolher "o primeiro" pediria o índice do item no `repeat` (#897), e um campo de índice do item fica fora. Os exemplos de estado trazem os `items` do `preview`: no Catálogo o exemplo desenha os destinos, com a camada de estado no item selecionado.

**O que ainda difere do Compose**

- O indicador do Compose 1.4.0 mede 56 × 32 (`NavigationBarVerticalItemTokens.ActiveIndicatorWidth`), e não os 64 × 32 da primeira versão deste componente nem os do desenho M3 anterior: o desenho segue o `.kt`.
- O `interaction` é um quadro parado: sem o ripple animado, sem a animação de expansão do indicador (o desenho é o estado final) e sem anel de foco (o Compose não define `FocusIndicatorColor` para ele no commit fixado); sem `enabled` (não é campo do tipo).
- `windowInsets`, `tonalElevation`, `containerColor` e `NavigationBarItemColors` próprios não são campos do tipo; o ícone é só o nome do conjunto Material Icons da biblioteca.
- O rótulo do Compose quebra em mais de uma linha quando passa da largura do destino; aqui ele é `hug` e a prova de desenho avisa o que não cabe.
