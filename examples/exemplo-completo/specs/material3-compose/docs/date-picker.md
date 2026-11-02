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
