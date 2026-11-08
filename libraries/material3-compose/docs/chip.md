# Chip

Chip compacto. Assist sugere uma ação, filter filtra conteúdo, input representa um valor digitado e suggestion propõe uma resposta. Cada estilo tem a versão elevated.

Tipo de anotação: `chip` (camada Componentes).

## Campos

| Chave          | Rótulo        | Tipo   | Obrigatório | Opções                                                                                                 | Padrão   | Descrição                                                               |
| -------------- | ------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `label`        | Rótulo        | string | sim         |                                                                                                        |          | Texto do chip.                                                          |
| `style`        | Estilo        | enum   | não         | `assist`, `assist-elevated`, `filter`, `filter-elevated`, `input`, `suggestion`, `suggestion-elevated` | `assist` | assist, filter, input ou suggestion, cada um também na versão elevated. |
| `selected`     | Selecionado   | enum   | não         | `true`, `false`                                                                                        | `false`  | true marca o chip. Só vale nos estilos filter e input.                  |
| `enabled`      | Habilitado    | enum   | não         | `true`, `false`                                                                                        | `true`   | false desabilita o chip.                                                |
| `leadingIcon`  | Ícone inicial | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone antes do texto. Vazio = sem ícone.                                |
| `trailingIcon` | Ícone final   | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone depois do texto. Vazio = sem ícone. Não existe em suggestion.     |

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

Variante `input`: `selected` e `onClick` ligam ao estado do valor e `label = { Text(<label>) }`. `trailingIcon` costuma ser `Icons.Filled.Close` para remover o valor; o `avatar` (imagem circular) é opcional e não é campo.

Variante `suggestion`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O SuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

Variante `suggestion-elevated`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O ElevatedSuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

## Exemplos

- **Assist**: label=Adicionar ao calendário, style=assist, leadingIcon=DateRange
- **Filtro selecionado**: label=Aberto agora, style=filter, selected=true
- **Valor digitado**: label=ana@exemplo.com, style=input, trailingIcon=Close

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`: os chips (`AssistChip`, `ElevatedAssistChip`, `FilterChip`, `ElevatedFilterChip`, `InputChip`, `SuggestionChip`, `ElevatedSuggestionChip`, linhas 130 a 1000), os `Defaults` e as cores padrão (linhas 1005 a 1940: `assistChipColors` nas linhas 1051 a 1070, `elevatedAssistChipColors` 1195 a 1218, `filterChipColors` 1319 a 1350, `elevatedFilterChipColors` 1476 a 1510, `inputChipColors` 1616 a 1650, `suggestionChipColors` 2719 a 2737, `elevatedSuggestionChipColors` 1885 a 1905; bordas em 1398, 1692, 1805), o `Chip` e o `SelectableChip` (linhas 1942 a 2037: `Surface` com cor, `shadowElevation` e borda), o `ChipContent` (linhas 2042 a 2100) e a política de medida `ChipLayoutMeasurePolicy` (linhas 2257 a 2300), e os paddings (linhas 2943 a 2964: `inputChipPadding` 4 ou 8, `HorizontalElementsPadding = 8.dp`, `AssistChipPadding`, `FilterChipPadding`, `SuggestionChipPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/AssistChipTokens.kt`, `FilterChipTokens.kt`, `InputChipTokens.kt` e `SuggestionChipTokens.kt` (altura 32, `CornerSmall`, `LabelTextFont = LabelLarge`, ícones de 18, cores de contêiner, rótulo e ícone por estado, opacidades 0,38 e 0,12, `FlatOutlineColor = OutlineVariant`, `ElevatedContainerElevation = Level1`) e `ElevationTokens.kt` (`Level1 = 1.dp`).
- `ColorLightTokens.kt`, `ColorDarkTokens.kt` e `ShapeTokens.kt` (`corner-small` 8).

**Como o desenho segue o Compose**

- 32 de altura e `corner-small`. Os chips planos (`assist`, `filter`, `input`, `suggestion`) não têm fundo e têm contorno de 1 em `outline-variant`; selecionado (`filter` e `input`) o fundo é `secondary-container` e o contorno some (`SelectedOutlineWidth = 0`). Os elevated têm fundo `surface-container-low` (o `filter-elevated` selecionado, `secondary-container`), sombra do nível 1 e nenhum contorno.
- O rótulo usa `label-large-*`. Cores: assist `on-surface`; suggestion `on-surface-variant`; filter e input `on-surface-variant`, e `on-secondary-container` quando selecionados. Ícone inicial: assist, suggestion e filter não selecionado em `primary`; filter selecionado em `on-secondary-container`; input em `on-surface-variant` (selecionado, `primary`). Ícone final: assist em `primary`; filter e input em `on-surface-variant` (selecionado, `on-secondary-container`). O suggestion não tem ícone final (o Compose só dá um ícone, o inicial), então `trailingIcon` não desenha nele.
- Medidas do `Chip.kt`: 8 de padding nas bordas, 18 de ícone e 8 de cada lado do rótulo (o texto começa 16 da borda sem ícone e 34 com ícone inicial); o input usa 4 (sem ícone inicial) ou 8 (com ícone inicial) nas bordas, e 4 ou 8 (com ícone final) no fim.
- Filter selecionado sem `leadingIcon` desenha o check (`done`), que é o costume do Compose para o filtro marcado; com `leadingIcon` preenchido, desenha o ícone escolhido, como o Compose (que desenha só o que recebe).
- Desabilitado: rótulo e ícones em `on-surface` com a opacidade `state-disabled-content` (0,38); o contêiner dos elevated e dos selecionados em `on-surface` com `state-disabled-container` (0,12); o contorno dos planos não selecionados em `on-surface` com 0,12; sem sombra.
- Os ícones são nós `icon` do conjunto da biblioteca, com o `$switch` do nome do Compose para o nome do conjunto, cobrindo as sugestões de `leadingIcon` e `trailingIcon`.

**O que ainda difere do Compose**

- O `y` (1) e o `blur` (2) da sombra são números, os mesmos de `elevation-1-y` e `elevation-1-blur`: `shadow.y` e `shadow.blur` não aceitam `$token` no formato 4.
- O avatar do `InputChip` não é campo do tipo; o desenho não o tem.
- A largura é a da marcação: o chip não mede o rótulo para crescer (o `hug` do eixo largura só vale em tela arrumada pelo `layoutScreen`, e este componente não tem slot). O Compose mede o conteúdo.
- O rótulo não corta nem quebra de propósito (o `Text` do Compose também não); um rótulo maior que a caixa avisa `texto maior que a caixa`.
- Sem camadas de estado (hover, foco, pressionado, arrastado) nem movimento (a animação dos ícones do `SelectableChip`).
