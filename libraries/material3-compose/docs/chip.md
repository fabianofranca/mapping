# Chip

Chip compacto. Assist sugere uma ação, filter filtra conteúdo, input representa um valor digitado e suggestion propõe uma resposta. Cada estilo tem a versão elevated.

Tipo de anotação: `chip` (camada Componentes).

## Campos

| Chave          | Rótulo        | Tipo   | Obrigatório | Opções                                                                                                 | Padrão   | Descrição                                                                                                                                                                                                                                                     |
| -------------- | ------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`        | Rótulo        | string | sim         |                                                                                                        |          | Texto do chip.                                                                                                                                                                                                                                                |
| `style`        | Estilo        | enum   | não         | `assist`, `assist-elevated`, `filter`, `filter-elevated`, `input`, `suggestion`, `suggestion-elevated` | `assist` | assist, filter, input ou suggestion, cada um também na versão elevated.                                                                                                                                                                                       |
| `selected`     | Selecionado   | enum   | não         | `true`, `false`                                                                                        | `false`  | true marca o chip. Só vale nos estilos filter e input.                                                                                                                                                                                                        |
| `enabled`      | Habilitado    | enum   | não         | `true`, `false`                                                                                        | `true`   | false desabilita o chip.                                                                                                                                                                                                                                      |
| `interaction`  | Interação     | enum   | não         | `none`, `hovered`, `focused`, `pressed`, `dragged`                                                     | `none`   | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused), pressionado (pressed) ou arrastado (dragged); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |
| `leadingIcon`  | Ícone inicial | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone antes do texto. Vazio = sem ícone.                                                                                                                                                                                                                      |
| `avatar`       | Avatar        | string | não         |                                                                                                        |          | Endereço https:// da imagem do avatar, no estilo input: imagem circular de 24 no início do chip, no lugar do ícone inicial (InputChip avatar). Vazio = sem avatar.                                                                                            |
| `trailingIcon` | Ícone final   | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone depois do texto. Vazio = sem ícone. Não existe em suggestion.                                                                                                                                                                                           |

## Compose

- Símbolo: `androidx.compose.material3.AssistChip`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`               | Símbolo                  |
| --------------------- | ------------------------ |
| `assist` (base)       | `AssistChip`             |
| `assist-elevated`     | `ElevatedAssistChip`     |
| `filter`              | `FilterChip`             |
| `filter-elevated`     | `ElevatedFilterChip`     |
| `input`               | `InputChip`              |
| `suggestion`          | `SuggestionChip`         |
| `suggestion-elevated` | `ElevatedSuggestionChip` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
AssistChip(    // style assist-elevated: ElevatedAssistChip
    onClick = { /* lógica da tela */ },
    label = { Text("Adicionar ao calendário") },
    leadingIcon = {
        Icon(Icons.Filled.DateRange, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize))
    },
)

FilterChip(    // style filter; filter-elevated: ElevatedFilterChip
    selected = true,
    onClick = { /* ... */ },
    label = { Text("Aberto agora") },
    leadingIcon = {
        Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize))
    },
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e `label = { Text(<label>) }`. `leadingIcon` e `trailingIcon` preenchidos viram `{ Icon(Icons.Filled.<nome>, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize)) }`. Nenhum estilo exige opt-in.

Variante `filter`: `selected` e `onClick` ligam ao estado do filtro e `label = { Text(<label>) }`. Com `selected = true` é costume `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; `trailingIcon` preenchido vira um `Icon` do mesmo tamanho.

Variante `filter-elevated`: `selected` e `onClick` ligam ao estado do filtro e `label = { Text(<label>) }`. Com `selected = true` é costume `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; `trailingIcon` preenchido vira um `Icon` do mesmo tamanho.

Variante `input`: `selected` e `onClick` ligam ao estado do valor e `label = { Text(<label>) }`. `trailingIcon` costuma ser `Icons.Filled.Close` para remover o valor; o campo `avatar`, preenchido, vira `avatar = { AsyncImage(model = <avatar>, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(InputChipDefaults.AvatarSize)) }` (o carregador de imagens do app, fora do androidx): o InputChip recorta o avatar no círculo (`InputChipTokens.AvatarShape`) e, com ele, não mostra o `leadingIcon`.

Variante `suggestion`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O SuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

Variante `suggestion-elevated`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O ElevatedSuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

## Exemplos

- **Assist**: label=Adicionar ao calendário, style=assist, leadingIcon=DateRange
- **Filtro selecionado**: label=Aberto agora, style=filter, selected=true
- **Valor digitado**: label=ana@exemplo.com, style=input, trailingIcon=Close
- **Mouse sobre**: label=Aberto agora, style=filter-elevated, interaction=hovered
- **Com foco**: label=Adicionar ao calendário, style=assist, leadingIcon=DateRange, interaction=focused
- **Pressionado**: label=Aberto agora, style=filter, selected=true, interaction=pressed
- **Arrastado**: label=ana@exemplo.com, style=input, trailingIcon=Close, interaction=dragged
- **Com avatar**: label=Ana Souza, style=input, avatar=https://example.com/ana.png, trailingIcon=Close
- **Rótulo longo**: label=Adicionar reunião ao calendário compartilhado, style=assist, leadingIcon=DateRange

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`: os chips (`AssistChip`, `ElevatedAssistChip`, `FilterChip`, `ElevatedFilterChip`, `InputChip`, `SuggestionChip`, `ElevatedSuggestionChip`, linhas 130 a 1000), os `Defaults` e as cores padrão (linhas 1005 a 1940: `assistChipColors` nas linhas 1051 a 1070, `elevatedAssistChipColors` 1195 a 1218, `filterChipColors` 1319 a 1350, `elevatedFilterChipColors` 1476 a 1510, `inputChipColors` 1616 a 1650, `suggestionChipColors` 2719 a 2737, `elevatedSuggestionChipColors` 1885 a 1905; bordas em 1398, 1692, 1805), o `Chip` e o `SelectableChip` (linhas 1942 a 2037: `Surface` com cor, `shadowElevation` e borda), o `ChipContent` (linhas 2042 a 2100) e a política de medida `ChipLayoutMeasurePolicy` (linhas 2257 a 2300), e os paddings (linhas 2943 a 2964: `inputChipPadding` 4 ou 8, `HorizontalElementsPadding = 8.dp`, `AssistChipPadding`, `FilterChipPadding`, `SuggestionChipPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/AssistChipTokens.kt`, `FilterChipTokens.kt`, `InputChipTokens.kt` e `SuggestionChipTokens.kt` (altura 32, `CornerSmall`, `LabelTextFont = LabelLarge`, ícones de 18, cores de contêiner, rótulo e ícone por estado, opacidades 0,38 e 0,12, `FlatOutlineColor = OutlineVariant`, `ElevatedContainerElevation = Level1`, as elevações e o contorno por estado do campo `interaction`) e `ElevationTokens.kt` (`Level1 = 1.dp`, `Level2 = 3.dp`, `Level4 = 8.dp`) e `StateTokens.kt` (as opacidades da camada de estado).
- `ColorLightTokens.kt`, `ColorDarkTokens.kt` e `ShapeTokens.kt` (`corner-small` 8).

**Como o desenho segue o Compose**

- Altura mínima de 32 e `corner-small`. Os chips planos (`assist`, `filter`, `input`, `suggestion`) não têm fundo e têm contorno de 1 em `outline-variant`; selecionado (`filter` e `input`) o fundo é `secondary-container` e o contorno some (`SelectedOutlineWidth = 0`). Os elevated têm fundo `surface-container-low` (o `filter-elevated` selecionado, `secondary-container`), sombra do nível 1 e nenhum contorno.
- O rótulo usa `label-large-*`. Cores: assist `on-surface`; suggestion `on-surface-variant`; filter e input `on-surface-variant`, e `on-secondary-container` quando selecionados. Ícone inicial: assist, suggestion e filter não selecionado em `primary`; filter selecionado em `on-secondary-container`; input em `on-surface-variant` (selecionado, `primary`). Ícone final: assist em `primary`; filter e input em `on-surface-variant` (selecionado, `on-secondary-container`). O suggestion não tem ícone final (o Compose só dá um ícone, o inicial), então `trailingIcon` não desenha nele.
- **Altura pelas linhas do rótulo:** `sizing.height` é `hug` e a raiz leva o mínimo de 32 (`minHeight`). O quadro `conteúdo` e o nó `rótulo` abraçam a altura e o chip não tem padding vertical, como o `Chip.kt`: `Modifier.defaultMinSize(minHeight = minHeight).padding(paddingValues)` (linhas 2059 e 2126), com `paddingValues` só dos lados (linhas 2943 a 2964) e a `Row` do rótulo com `padding(HorizontalElementsPadding, 0.dp)` (linhas 2076 e 2162). Uma linha (20) fica nos 32 do mínimo e duas linhas medem 40.
- **O rótulo quebra no que sobra da largura:** o `maxWidth` do nó `rótulo` é a largura da instância (`$size.width`) menos os paddings dos lados do estilo e, de cada ícone ou avatar visível, a largura dele mais os 8 de espaço (18 + 8 por ícone, 24 + 8 pelo avatar). O Arrumar e o `fit_marking` mantêm a largura da marcação e levam a altura às linhas.
- Medidas do `Chip.kt`: 8 de padding nas bordas, 18 de ícone e 8 de cada lado do rótulo (o texto começa 16 da borda sem ícone e 34 com ícone inicial); o input usa 4 (sem ícone inicial) ou 8 (com ícone inicial) nas bordas, e 4 ou 8 (com ícone final) no fim.
- Filter selecionado sem `leadingIcon` desenha o check (`done`), que é o costume do Compose para o filtro marcado; com `leadingIcon` preenchido, desenha o ícone escolhido, como o Compose (que desenha só o que recebe).
- Desabilitado: rótulo e ícones em `on-surface` com a opacidade `state-disabled-content` (0,38); o contêiner dos elevated e dos selecionados em `on-surface` com `state-disabled-container` (0,12); o contorno dos planos não selecionados em `on-surface` com 0,12; sem sombra.
- Os ícones são nós `icon` do conjunto da biblioteca, com o `$switch` do nome do Compose para o nome do conjunto, cobrindo as sugestões de `leadingIcon` e `trailingIcon`.
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo` usa `font.verticalAlign: "cap-middle"` e abraça a altura da linha (`height: "hug"`), com o quadro `conteúdo` centrado na altura do chip, sem mudar a posição horizontal. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `*ChipTokens.kt` do commit definem para o chip: `hovered`, `focused`, `pressed` e `dragged` (`DraggedContainerElevation` existe nos quatro arquivos). O estado vale para qualquer estilo; `selected` só conta nos estilos `filter` e `input`, como no resto do desenho.

- **Camada de estado:** o nó `estado` é um `rect` da forma do chip (`corner-small`), entre o contorno e o conteúdo, com a cor do rótulo do estilo (as `*ChipTokens.kt` repetem a cor do rótulo em `Hover*`, `Focus*`, `Pressed*` e `Dragged*`): `on-surface` no assist, `on-surface-variant` no suggestion e no filter e input desmarcados, `on-secondary-container` no filter e input selecionados. A `opacity` vem dos tokens `state-hover` (0,08), `state-focus` (0,10), `state-pressed` (0,10) e `state-dragged` (0,16), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `DraggedStateLayerOpacity`, `FocusStateLayerOpacity`, `HoverStateLayerOpacity`, `PressedStateLayerOpacity`).
- **Elevação por estado** (`AssistChipTokens.kt`, `FilterChipTokens.kt`, `InputChipTokens.kt` e `SuggestionChipTokens.kt`): o elevated vai de 1 (`ElevatedContainerElevation`, linha 31 do assist e do suggestion, 29 do filter) para 3 dp, o nível 2, com o mouse (`ElevatedHoverContainerElevation`, linha 36 do assist e do suggestion, 34 do filter) e fica em 1 no foco e pressionado (`ElevatedFocusContainerElevation` e `ElevatedPressedContainerElevation`, linhas 35 e 37, 33 e 35 no filter). O chip plano tem nível 0; só o `filter` selecionado sobe para o nível 1 com o mouse (`FlatSelectedHoverContainerElevation`, `FilterChipTokens.kt` linha 45; o desmarcado fica em 0, linha 50). Arrastado (`DraggedContainerElevation`, `AssistChipTokens.kt` linha 28, `FilterChipTokens.kt` linha 28, `InputChipTokens.kt` linha 33, `SuggestionChipTokens.kt` linha 28), todos os estilos vão ao nível 4 (8 dp, `ElevationTokens.kt` linha 28). O `y` e o `blur` da sombra aceitam `$token`, mas não expressão (o nível não troca com o estado no mesmo nó): o nível 1 é a sombra do quadro (y 1, blur 2, os de `elevation-1-*`) e o 2 e o 4 são os nós à parte `sombra nível 2` (y 2, blur 6, os de `elevation-2-*`) e `sombra nível 4` (y 4, blur 16, os de `elevation-4-*`), cada um com o fundo e o contorno do chip, visíveis só no estado que pede o nível. O input não tem elevação de mouse, foco nem pressionado (`ContainerElevation` é o nível 0, linha 24).
- **Cor do contorno** (chip plano desmarcado): no foco o assist usa `on-surface` (`FlatFocusOutlineColor`, `AssistChipTokens.kt` linha 41) e o suggestion, o filter e o input `on-surface-variant` (`SuggestionChipTokens.kt` linha 41, `FilterChipTokens.kt` linha 49, `InputChipTokens.kt` linha 45); nos outros estados é `outline-variant`, como parado. Selecionado e elevated não têm contorno em estado nenhum.
- **Cor do ícone:** os `*ChipTokens.kt` trocam a cor do ícone em alguns estados do input (por exemplo, o ícone inicial desmarcado vai a `primary` no mouse, no foco e pressionado, e o final selecionado a `primary` arrastado); o desenho mantém a cor parada do ícone em todos os estados.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível e as sombras de estado somem, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- As duas sombras (ponto e ambiente) vêm dos tokens `elevation-<n>-point-*` e `elevation-<n>-ambient-*` (`$token` em `shadow`, lista de duas sombras com `spread`); os tokens `elevation-<n>-y`, `elevation-<n>-blur` e `elevation-shadow` seguem na especialização por compatibilidade, mas nenhum componente os usa.
- O campo `avatar` (URL `https://`) desenha, no estilo `input`, a imagem circular de 24 (`InputChipTokens.AvatarSize` e `AvatarShape` `CornerFull`, `InputChipTokens.kt`) no início do chip, recortada pela forma, a 0,38 no desabilitado (`DisabledAvatarOpacity`, `Chip.kt` linhas 650 a 665). Com ele o ícone inicial (e o check do selecionado) não aparece (`leadingContent`, `Chip.kt` linhas 2204 a 2216: `avatar != null -> avatar`) e o início do chip fica como sem ícone (`inputChipPadding`, linha 2949). A imagem só é pedida à rede com a permissão da origem na app, e o servidor MCP desenha o reservado. Fora do `input` o campo não tem efeito. Sem `contentDescription` do avatar (o Compose o deixa ao `avatar`).
- Numa marcação a largura é a dela (o Arrumar não a muda). Sem retângulo (instância nova, tela arrumada pelo `layoutScreen`) a largura é a do conteúdo (`sizing.width` `hug`), com o `size` de 232 como largura de partida do rótulo: um rótulo mais largo quebra em vez de alargar o chip, onde o Compose, sem limite do pai, não quebra. O exemplo "Rótulo longo" no `size` (232 × 32) mostra as duas linhas passando da caixa de 32; o Arrumar a leva a 40.
- Sem ripple animado, sem transição entre estados nem a animação dos ícones do `SelectableChip` (o desenho é um quadro parado). Em `focused` o chip ganha o anel de foco (`FocusIndicatorColor`: `AssistChipTokens.kt` linha 44, `FilterChipTokens.kt` 54, `InputChipTokens.kt` 34 e `SuggestionChipTokens.kt` 44): o anel de 3 em `secondary`, afastado 2 da forma (`stroke.offset`), por fora da caixa (a largura e o afastamento são os da decisão da etapa; o `*Tokens.kt` só traz a cor).
- Nos chips planos de fundo `none` (assist, suggestion, filter desmarcado e input desmarcado) as duas sombras do nível 1 ou 4 saem do contorno e do conteúdo que o canvas desenha, porque não há fundo para projetá-la: a forma da sombra é aproximada.
- O `Chip.kt` só usa os tokens de estado para a elevação (`ChipElevation`, linhas 2333 a 2340); a cor do contorno no foco e a do ícone nos estados dos `*ChipTokens.kt` não são lidas por ele. O desenho segue os tokens, como a etapa pede. Por outro lado, os valores padrão de `filterChipElevation` (linhas 1365 a 1372) dão o nível 1 no mouse a todo `FilterChip` plano, selecionado ou não; o desenho segue o token (só o selecionado).
