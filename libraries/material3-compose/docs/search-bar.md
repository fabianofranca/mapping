# Search bar

Barra de busca. Bar é a barra que se expande para a tela inteira; docked abre os resultados logo abaixo do campo (telas largas).

Tipo de anotação: `search-bar` (camada Componentes).

## Campos

| Chave          | Rótulo        | Tipo   | Obrigatório | Opções                                                         | Padrão  | Descrição                                                                                                                                                                                                                                          |
| -------------- | ------------- | ------ | ----------- | -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`        | Consulta      | string | não         |                                                                |         | Texto digitado na busca. Vazio = mostra a dica (placeholder).                                                                                                                                                                                      |
| `placeholder`  | Dica          | string | não         |                                                                |         | Texto de dica quando a consulta está vazia.                                                                                                                                                                                                        |
| `leadingIcon`  | Ícone inicial | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone antes do texto (costuma ser Search). Vazio = sem ícone.                                                                                                                                                                                      |
| `trailingIcon` | Ícone final   | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone depois do texto (por exemplo Close para limpar). Vazio = sem ícone.                                                                                                                                                                          |
| `expanded`     | Expandida     | enum   | não         | `true`, `false`                                                | `false` | true abre a busca: o container ganha o divisor dos resultados (as marcações filhas são os resultados).                                                                                                                                             |
| `style`        | Estilo        | enum   | não         | `bar`, `docked`                                                | `bar`   | bar (SearchBar) ou docked (DockedSearchBar).                                                                                                                                                                                                       |
| `width`        | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                                              |
| `height`       | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                                                |
| `weight`       | Peso (weight) | number | não         |                                                                |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                                  |
| `interaction`  | Interação     | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`  | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. A barra não tem desabilitado (sem enabled): o estado sempre desenha. |

## Compose

- Símbolo: `androidx.compose.material3.SearchBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`      | Símbolo           |
| ------------ | ----------------- |
| `bar` (base) | `SearchBar`       |
| `docked`     | `DockedSearchBar` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Busca(query: String, onQueryChange: (String) -> Unit, expanded: Boolean, onExpandedChange: (Boolean) -> Unit) {
    SearchBar(    // style docked: DockedSearchBar
        inputField = {
            SearchBarDefaults.InputField(
                query = query,
                onQueryChange = onQueryChange,
                onSearch = { /* lógica da tela */ },
                expanded = expanded,
                onExpandedChange = onExpandedChange,
                placeholder = { Text("Pesquisar músicas") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
            )
        },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        /* resultados: as marcações filhas */
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class): toda a família SearchBar é experimental no commit fixado. Use a sobrecarga `SearchBar(inputField, expanded, onExpandedChange, …, content)`; as sobrecargas com `query` e `active` estão `@Deprecated`. O campo vai em `inputField = { SearchBarDefaults.InputField(query = <query>, onQueryChange = …, onSearch = …, expanded = <expanded>, onExpandedChange = …, placeholder = { Text(<placeholder>) }, leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }, trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }) }`, com `query` e `expanded` ligados a estados da tela; `placeholder`, `leadingIcon` e `trailingIcon` só entram quando preenchidos. As marcações filhas (resultados e sugestões) vão em `content = { … }` (uma Column), que só aparece com `expanded = true`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

Variante `docked`: Exige o mesmo @OptIn(ExperimentalMaterial3Api::class). `DockedSearchBar(inputField, expanded, onExpandedChange, …, content)` recebe o mesmo `inputField` (`SearchBarDefaults.InputField(query = <query>, …, expanded = <expanded>, …)`) e o mesmo `content`, mas os resultados abrem num painel logo abaixo do campo, com cantos de 28, em vez de ocupar a tela: serve para telas largas (tablet e desktop). `placeholder`, `leadingIcon` e `trailingIcon` seguem como na base.

## Exemplos

- **Barra com dica**: placeholder=Pesquisar músicas, leadingIcon=Search, style=bar
- **Com consulta**: query=jazz, placeholder=Pesquisar músicas, leadingIcon=Search, trailingIcon=Close, style=bar
- **Docked expandida**: query=jaz, placeholder=Pesquisar, leadingIcon=Search, trailingIcon=Close, expanded=true, style=docked
- **Mouse sobre**: placeholder=Pesquisar, leadingIcon=Search, interaction=hovered
- **Com foco**: query=café, leadingIcon=Search, interaction=focused
- **Pressionado**: placeholder=Pesquisar, leadingIcon=Search, trailingIcon=Mic, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, e nenhum nó de texto declara `family` (todos herdam `font-sans`).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt` (linhas 1023 a 1048: `TonalElevation` e `ShadowElevation` no nível 0, `InputFieldHeight`, `inputFieldShape` e `dockedShape`; 1178 a 1240: `inputFieldColors`; 1340 a 1410: o campo com `sizeIn(minHeight = 56)`, `TextFieldLineLimits.SingleLine`, `contentPaddingWithoutLabel` e os ícones deslocados de `SearchBarIconOffsetX`; 2118 a 2150: a `bar` expandida com o `HorizontalDivider`; 2199 a 2290: o `SearchBarLayout`, com 8 de respiro em cima e embaixo do campo; 2315 a 2350: o `DockedSearchBarLayout`, com o divisor logo abaixo do campo; 2711 a 2716: `SearchBarMinWidth` 360, `SearchBarMaxWidth` 720, `SearchBarVerticalPadding` 8 e `SearchBarIconOffsetX` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SearchBarTokens.kt` (`ContainerColor` `SurfaceContainerHigh`, `ContainerHeight` 56, `ContainerShape` `CornerFull`, `InputTextColor`, `LeadingIconColor`, `TrailingIconColor`, `SupportingTextColor`, fontes `BodyLarge`) e `tokens/SearchViewTokens.kt` (`DividerColor` `Outline`, `DockedContainerShape` `CornerExtraLarge`, `FullScreenHeaderContainerHeight` 72).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SearchBarTokens.kt` (linhas 28 a 35: `ContainerShape`, `FocusIndicatorColor`, `HoverSupportingTextColor` e `PressedSupportingTextColor`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Contêiner de 56 de altura (`minHeight` da linha do campo) na forma `corner-full`, cor `surface-container-high`, sem sombra (`ShadowElevation` é o nível 0) e sem contorno.
- Ícone inicial `on-surface` e ícone final `on-surface-variant`, de 24 pelo nó `icon`, a 16 das bordas; o texto começa a 52 (área de 48 do ícone mais 4 de `SearchBarIconOffsetX`), com 12 entre o ícone e o texto.
- Consulta em `body-large` (16/24, 0,5), `on-surface`, numa linha só (`font.wrap: "none"`, `maxLines: 1`), recortada na largura, sem reticências; dica em `body-large`, `on-surface-variant`.
- Expandida `docked`: raio `corner-extra-large` e divisor de 1 em `outline` logo abaixo do campo, em y = 56 (`HorizontalDivider` do `DockedSearchBarLayout`).
- Expandida `bar` (tela cheia): raio `corner-none`, campo a 8 do topo e divisor em y = 72 (8 + 56 + 8, o cabeçalho de 72 de `FullScreenHeaderContainerHeight`).
- A dica e a consulta (uma linha) centram pela altura da maiúscula (`font.verticalAlign: "cap-middle"`). O `Text` do Compose centra pela caixa de linha da fonte; com Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `SearchBarTokens.kt` nomeia: `hovered` (`HoverSupportingTextColor`, linha 31), `focused` (`FocusIndicatorColor`, linha 30) e `pressed` (`PressedSupportingTextColor`, linha 35). **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` do tamanho da barra (56) e do raio do componente, atrás do conteúdo, na cor do texto digitado, `on-surface` (`InputTextColor`, linha 32), com `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10). Os tokens da barra **não nomeiam** cor nem opacidade de camada: é a convenção do `card` (a cor do conteúdo) e o desenho do M3, não um quadro que o `SearchBar` do Compose 1.4.0 desenhe.
- **Cores do conteúdo:** `HoverSupportingTextColor` e `PressedSupportingTextColor` repetem `on-surface-variant`, o papel de sempre; nada mais muda no texto nem nos ícones.
- **Expandida:** a camada cobre só a linha de entrada (56), não a lista abaixo.

**O que ainda difere do Compose**

- O `interaction` é um quadro parado: sem cursor e sem animação de expandir. Em `focused` o campo ganha, além da camada de estado, o anel de foco (`FocusIndicatorColor`, `secondary`, `SearchBarTokens.kt` linha 30): o anel de 3 em `secondary`, afastado 2 da forma (`stroke.offset`), por fora da caixa (a largura e o afastamento são os da decisão da etapa; o `*Tokens.kt` só traz a cor), em volta da linha de 56. Na barra expandida do estilo `docked` a camada leva o raio do componente, não só os cantos de cima.
- A `bar` expandida do Compose ocupa a tela e soma os `WindowInsets` ao respiro de cima; aqui o tamanho é o da marcação e o respiro é só o 8 fixo.
- Os limites de largura (360 a 720; `docked` fixa em 360) valem pelo `minSize`: a raiz sempre tem o tamanho da marcação, então `minWidth` e `maxWidth` na raiz não agiriam, e o teto de 720 e os 360 fixos do docked não são impostos.
- O tamanho inicial de 56 não comporta a barra expandida: o divisor fica logo abaixo da caixa (docked) e a marcação tem de crescer para os resultados.
- A dica quebra por palavra (o `Text` do placeholder não limita linhas); o Compose também a deixa crescer o campo.
- Sem o desabilitado (`enabled`), o `onSearch` e o avatar do `SearchBar`: não são campos do tipo.
