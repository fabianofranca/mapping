# Date picker

Seletor de data em calendário. Single escolhe um dia; range escolhe um intervalo. Em diálogo, envolva com DatePickerDialog.

Tipo de anotação: `date-picker` (camada Componentes).

## Campos

| Chave            | Rótulo        | Tipo   | Obrigatório | Opções            | Padrão   | Descrição                                                                                                                                                                       |
| ---------------- | ------------- | ------ | ----------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | Título        | string | não         |                   |          | Texto pequeno no topo (title). Vazio = o padrão do M3 (Selecionar data / Selecionar datas).                                                                                     |
| `headline`       | Manchete      | string | não         |                   |          | Data escolhida, em destaque no cabeçalho (headline), já formatada, como em qua., 15 de out. Vazio = o padrão do M3.                                                             |
| `displayedMonth` | Mês exibido   | string | não         |                   |          | Nome do mês e do ano mostrados no calendário, como em Outubro de 2025. É o estado inicial, não um parâmetro. A grade desenhada é sempre de 31 dias começando numa quarta-feira. |
| `selection`      | Seleção       | enum   | não         | `single`, `range` | `single` | single escolhe um dia (DatePicker); range escolhe um intervalo (DateRangePicker).                                                                                               |
| `selectedDay`    | Dia escolhido | number | não         |                   |          | Dia do mês (1 a 31) marcado no estilo single. Vazio = nenhum dia.                                                                                                               |
| `rangeStartDay`  | Dia inicial   | number | não         |                   |          | Primeiro dia do intervalo (1 a 31), no estilo range.                                                                                                                            |
| `rangeEndDay`    | Dia final     | number | não         |                   |          | Último dia do intervalo (1 a 31), no estilo range.                                                                                                                              |
| `showModeToggle` | Alternar modo | enum   | não         | `true`, `false`   | `true`   | false esconde o ícone que alterna entre calendário e digitação.                                                                                                                 |

## Compose

- Símbolo: `androidx.compose.material3.DatePicker`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/DatePicker.kt`
- O campo `selection` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `selection`     | Símbolo                                          |
| --------------- | ------------------------------------------------ |
| `single` (base) | `DatePicker`                                     |
| `range`         | `DateRangePicker` (arquivo `DateRangePicker.kt`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
val state = rememberDatePickerState(
    initialSelectedDateMillis = /* dia 15 de outubro de 2025, UTC */ 1760486400000L,
    initialDisplayedMonthMillis = /* 1º de outubro de 2025, UTC */ 1759276800000L,
)
DatePicker(state = state, showModeToggle = true)

// selection range: DateRangePicker
val rangeState = rememberDateRangePickerState(
    initialSelectedStartDateMillis = /* 9 de outubro */ 1759968000000L,
    initialSelectedEndDateMillis = /* 16 de outubro */ 1760572800000L,
)
DateRangePicker(state = rangeState, showModeToggle = true)

// em diálogo
DatePickerDialog(
    onDismissRequest = { /* ... */ },
    confirmButton = { TextButton(onClick = { /* ... */ }) { Text("OK") } },
) {
    DatePicker(state = state)
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Não exige opt-in: `DatePicker`, `DateRangePicker`, `DatePickerDialog` e `rememberDatePickerState` com milissegundos (`Long`) são estáveis; só as sobrecargas com `java.time` pedem @OptIn(ExperimentalMaterial3Api::class). O estado vem de `val state = rememberDatePickerState(initialSelectedDateMillis = <selectedDay no mês de displayedMonth, em milissegundos UTC>, initialDisplayedMonthMillis = <primeiro dia de displayedMonth, em milissegundos UTC>)` e a chamada é `DatePicker(state = state, showModeToggle = <showModeToggle>)`; `title = { Text(<title>) }` e `headline = { Text(<headline>) }` só entram quando preenchidos (sem eles o composable desenha os padrões, e a manchete sai sozinha da data escolhida). `displayedMonth` e `selectedDay` não são parâmetros: são o estado inicial. O resultado vem de `state.selectedDateMillis`. Em diálogo, envolva com `DatePickerDialog(onDismissRequest = …, confirmButton = { TextButton(onClick = …) { Text("OK") } }, dismissButton = { … }) { DatePicker(state = state) }`.

Variante `range`: Não exige opt-in. O estado vem de `val state = rememberDateRangePickerState(initialSelectedStartDateMillis = <rangeStartDay em milissegundos UTC>, initialSelectedEndDateMillis = <rangeEndDay em milissegundos UTC>, initialDisplayedMonthMillis = <primeiro dia de displayedMonth, em milissegundos UTC>)` e a chamada é `DateRangePicker(state = state, showModeToggle = <showModeToggle>)`, com `title` e `headline` como na base. O resultado vem de `state.selectedStartDateMillis` e `state.selectedEndDateMillis`. Em diálogo, envolva com `DatePickerDialog` (arquivo `DatePickerDialog.kt`), como o `DatePicker`.

## Exemplos

- **Um dia**: headline=qua., 15 de out., displayedMonth=Outubro de 2025, selection=single, selectedDay=15
- **Intervalo**: headline=9 out – 16 out, displayedMonth=Outubro de 2025, selection=range, rangeStartDay=9, rangeEndDay=16
- **Sem escolha**: displayedMonth=Outubro de 2025, selection=single, showModeToggle=false
- **Intervalo até o fim do mês**: headline=27 out – 31 out, displayedMonth=Outubro de 2025, selection=range, rangeStartDay=27, rangeEndDay=31

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/DatePicker.kt` (linhas 168 a 224: `DatePicker`, o título e a manchete com o recuo `DatePickerTitlePadding` e `DatePickerHeadlinePadding`, `headlineTextStyle` e `headerMinHeight`; 551 a 606: `defaultDatePickerColors`; 646 a 730: `DatePickerTitle` e `DatePickerHeadline`, com `maxLines = 1` (727); 767 a 771: a forma `DatePickerModalTokens.ContainerShape`; 1343 a 1400: `DateEntryContainer`, `sizeIn(minWidth = ContainerWidth)`, o fundo `containerColor`, a linha da manchete com o botão de modo e o `HorizontalDivider` no fim; 1402 a 1425: `DisplayModeToggleButton`, o ícone `Edit`; 1528 a 1668: `DatePickerContent`; 1671 a 1696: `DatePickerHeader`, a altura mínima só com título; 1783 a 1830: `WeekDays`; 1834 a 1990: `Month`, as seis linhas de 48 (`requiredHeight(RecommendedSizeForAccessibility * MaxCalendarRows)`) e `SpaceEvenly`; 1993 a 2050: `Day`, o círculo `CornerFull` de 40 e a cor do selecionado; 2182 a 2240: `MonthsNavigation`, a linha `MonthYearHeight`; 2243 a 2276: `YearPickerMenuButton` e `IconButtonWithTooltip`; 2293 a 2303: `RecommendedSizeForAccessibility` 48, `MonthYearHeight` 56, `DatePickerHorizontalPadding` 12, `DatePickerModeTogglePadding`, `MaxCalendarRows` 6).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/DateRangePicker.kt` (linhas 100 a 160: `DateRangePicker`, o título e a manchete a 64 da esquerda, `RangeSelectionHeaderHeadlineFont` e a altura mínima de 128 menos `HeaderHeightOffset` 60; 754 a 775: `DateRangePickerContent`, só os dias da semana e a lista vertical, sem a linha de setas; 858 a 870: o subtítulo do mês, `RangeSelectionMonthSubheadFont`; 931: `CalendarMonthSubheadPadding` (24, 20, 8); 1004 a 1080: `drawRangeBackground`, a faixa de 40 do centro da célula inicial ao centro da final; 1110 a 1117: os recuos do intervalo e `HeaderHeightOffset`).
- `compose/material3/material3/src/androidMain/kotlin/androidx/compose/material3/DatePickerDialog.android.kt` (o `Surface` do diálogo: `requiredWidth(ContainerWidth)` e só `tonalElevation`, sem sombra) e `Button.kt` (linhas 497 a 543: `TextButtonContentPadding` de 12 nas laterais, `MinHeight` 40 e `IconSpacing` 8 do botão do ano).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/DatePickerModalTokens.kt` (linhas 9 a 68: `ContainerColor` `SurfaceContainerHigh`, `ContainerShape` `CornerExtraLarge`, `ContainerWidth` 360, `DateContainerWidth` e `DateContainerHeight` 40, `DateContainerShape` `CornerFull`, `DateSelectedContainerColor` `Primary`, `DateSelectedLabelTextColor` `OnPrimary`, `DateUnselectedLabelTextColor` `OnSurface`, `DateLabelTextFont` `BodyLarge`, `HeaderContainerHeight` 120, `HeaderHeadlineColor`, `HeaderSupportingTextColor` e `RangeSelectionMonthSubheadColor` `OnSurfaceVariant`, `HeaderHeadlineFont` `HeadlineLarge`, `HeaderSupportingTextFont` `LabelLarge`, `RangeSelectionHeaderHeadlineFont` `TitleLarge`, `RangeSelectionMonthSubheadFont` `TitleSmall`, `RangeSelectionActiveIndicatorContainerColor` `SecondaryContainer` e `Height` 40, `WeekdaysLabelTextColor` `OnSurface`, `WeekdaysLabelTextFont` `BodyLarge`), `DividerTokens.kt` (`Color` `OutlineVariant`, `Thickness` 1) e `TypographyTokens.kt` (`HeadlineLarge`, `TitleLarge`, `TitleSmall`, `LabelLarge`, `BodyLarge`).

**Como o desenho segue o Compose**

- Contêiner de 360 em `surface-container-high` (`ContainerColor`) com canto `corner-extra-large` (28), sem sombra: o `DatePickerDialog` só aplica `tonalElevation` (`Level0`), e o `ContainerElevation` do token não vira sombra. A raiz leva `minWidth: 360` (o `sizeIn(minWidth = ContainerWidth)`), e a altura é a do conteúdo (`hug`).
- Cabeçalho de 120 (`HeaderContainerHeight`, o `minHeight` do quadro), com o divisor de 1 em `outline-variant` dentro dele, na base. O título fica no topo, a 24 da esquerda e 16 de cima, em `label-large` e `on-surface-variant` (`HeaderSupportingTextColor`). A manchete é `headline-large` (32, linha 40) em `on-surface-variant`, com `maxLines: 1` (o `Text` do `DatePickerHeadline`), a 24 da esquerda e 12 de baixo, centrada na linha de 60 que o botão de modo (48 mais os 12 de baixo do `DatePickerModeTogglePadding`) define. O botão de modo é o ícone `edit` do conjunto, de 24, numa área de 48 colada a 12 da direita. Sem o botão (`showModeToggle` falso) a linha encolhe para os 52 da manchete.
- Single: a linha do mês tem 56 (`MonthYearHeight`) com 12 de cada lado. À esquerda o botão do ano (`TextButton`, 40 de altura, laterais de 12): o mês em `label-large` e `on-surface-variant`, 8 de espaço e o ícone `arrow_drop_down` de 24. À direita as duas setas de 48 (`keyboard_arrow_left` e `keyboard_arrow_right` do conjunto, de 24, em `on-surface-variant`). Sem `displayedMonth` o botão mostra `-`, como o `?: "-"` do Compose.
- Dias da semana: sete células de 48 a partir de 12 da borda (`SpaceEvenly` em 336), em `body-large` e `on-surface` (`WeekdaysLabelTextColor`), com a inicial em português começando no domingo.
- Grade: células de 48 (`RecommendedSizeForAccessibility`) a partir de 12, o número em `body-large` e `on-surface`, num círculo de 40. O mês tem 31 dias e o dia 1 cai na quarta-feira, então são cinco linhas de 48. O dia escolhido (`selectedDay`) é um círculo de 40 (`DateContainerWidth` e `Height`, `corner-full`) em `primary`, com o número em `on-primary` (`DateSelectedContainerColor` e `DateSelectedLabelTextColor`), posto na célula por uma camada acima dos números, e não por uma expressão em cada um dos 31 dias.
- Range (`DateRangePicker`): o cabeçalho recua 64 (`DateRangePickerTitlePadding`), a manchete é `title-large` (22, linha 28) e a altura mínima é 68 (`RangeSelectionHeaderContainerHeight` 128 menos o `HeaderHeightOffset` 60); sem a linha de setas, o mês aparece como subtítulo depois dos dias da semana, em `title-small` e `on-surface-variant`, com recuo 24, 20 em cima e 8 embaixo. As pontas (`rangeStartDay` e `rangeEndDay`) são círculos de 40 em `primary` com número em `on-primary`; a faixa é de 40 em `secondary-container` (`RangeSelectionActiveIndicatorContainerColor`), sem canto, do centro da célula inicial ao centro da final, atravessando a largura toda nas semanas do meio, como o `drawRangeBackground`.
- Os ícones vêm do conjunto da biblioteca (nó `icon`), e as fontes e cores, dos tokens. O arquivo caiu de 120 kB para menos de 80 kB: não há mais caminho SVG, cor literal nem uma expressão de seleção por dia.

**O que ainda difere do Compose**

- A grade reserva 6 linhas no Compose (`RecommendedSizeForAccessibility` 48 × `MaxCalendarRows` 6, `DatePicker.kt` linhas 2293 e 2303), o que dá 512 de altura, e o `size` é 360 × 512. O desenho tem as 5 linhas que o mês de 31 dias começando na quarta ocupa (240) e o conteúdo mede 464 (single) e 417 (range): o fundo preenche a caixa e sobram 48 embaixo do single (efeito aceito, como na #863).
- Sem o dia de hoje: o Compose desenha o contorno de 1 em `primary` e o número em `primary` (`DateTodayContainerOutlineColor`, `DateTodayLabelTextColor`), mas o tipo não tem campo que diga qual é o dia de hoje (os campos não mudaram), então nenhum dia leva o contorno.
- Os dias dentro do intervalo, entre as pontas (o exemplo "Intervalo até o fim do mês" mostra o limite; a roadmap #897 o resolve com comparação e aritmética), ficam com o número em `on-surface`; o Compose usa `on-secondary-container` (`SelectionDateInRangeLabelTextColor`). O formato 4 não compara números nem faz conta numa expressão (só `$eq` e `$switch` sobre o valor exato), então decidir se um dia está entre `rangeStartDay` e `rangeEndDay` pediria uma condição enumerada por dia (centenas de termos). A faixa, que só precisa da posição das pontas, é exata. A diferença de cor é pequena (`on-surface` e `on-secondary-container` quase se confundem em light e em dark).
- A posição do círculo, da faixa e da semana vem de tabelas `$switch` de 31 casos sobre `selectedDay`, `rangeStartDay` e `rangeEndDay`, porque o formato não faz conta (coluna e linha do dia) nem repete uma célula N vezes sem um campo `table`. Um dia fora de 1 a 31 não desenha a faixa e o motor avisa `conteúdo maior que a caixa` no círculo.
- Sem o estado desabilitado dos dias (`SelectableDates`) e do mês (`previousAvailable` e `nextAvailable` das setas), sem o seletor de anos aberto, sem o modo de digitação (`DateInput`), sem as sombras, as camadas de estado e as animações (a troca de mês, o `animateChecked` do dia).
- Sem os botões do diálogo (`DatePickerDialog`: OK e Cancelar, `ContainerHeight` 568 do token) nem o fechar e o salvar da tela cheia do `DateRangePicker`, que o `HeaderHeightOffset` já desconta.
- O `DateRangePicker` mostra uma lista vertical rolável de meses, e o desenho mostra só o mês de `displayedMonth`. A manchete do intervalo no Compose é uma linha de dois textos (`startDatePlaceholder`, o delimitador `-` e `endDatePlaceholder`); aqui é um texto só, o `headline`.
- Os tamanhos em `sp` do Compose são desenhados em px (1 sp = 1 px do componente). O título quebra linha como o `Text` do Compose e faz o cabeçalho crescer; a manchete fica numa linha (`maxLines`), cortada sem reticências (o `overflow` padrão é `Clip`).
