# Time picker

Seletor de hora. Picker mostra os campos de hora e minuto com o relógio; input mostra só os campos para digitar. Exige opt-in experimental.

Tipo de anotação: `time-picker` (camada Componentes).

## Campos

| Chave       | Rótulo     | Tipo   | Obrigatório | Opções            | Padrão   | Descrição                                                                                                        |
| ----------- | ---------- | ------ | ----------- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `title`     | Título     | string | não         |                   |          | Título do diálogo (o `title` do TimePickerDialog). Vazio = sem título.                                           |
| `mode`      | Modo       | enum   | não         | `picker`, `input` | `picker` | picker é o relógio (TimePicker); input são só os campos de hora e minuto (TimeInput).                            |
| `hour`      | Hora       | number | não         |                   |          | Hora de 0 a 23 (initialHour), sempre no formato de 24 horas.                                                     |
| `minute`    | Minuto     | number | não         |                   |          | Minuto de 0 a 59 (initialMinute).                                                                                |
| `is24Hour`  | 24 horas   | enum   | não         | `true`, `false`   | `true`   | true usa 24 horas; false usa 12 horas com o seletor AM/PM.                                                       |
| `selection` | Em seleção | enum   | não         | `hour`, `minute`  | `hour`   | Qual parte está sendo escolhida (o relógio mostra as horas ou os minutos). É o estado inicial, não um parâmetro. |

## Compose

- Símbolo: `androidx.compose.material3.TimePicker`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePicker.kt`
- O campo `mode` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `mode`          | Símbolo      |
| --------------- | ------------ |
| `picker` (base) | `TimePicker` |
| `input`         | `TimeInput`  |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Horario(onDismiss: () -> Unit, onConfirm: (Int, Int) -> Unit) {
    val state = rememberTimePickerState(initialHour = 14, initialMinute = 30, is24Hour = true)
    TimePickerDialog(    // estável
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = { onConfirm(state.hour, state.minute) }) { Text("OK") } },
        title = { Text("Selecionar horário") },
    ) {
        TimePicker(state = state)    // mode input: TimeInput(state = state)
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class): `TimePicker`, `TimeInput`, `rememberTimePickerState` e `TimePickerState` são experimentais no commit fixado. Os nomes de `params` são os de `rememberTimePickerState(initialHour = <hour>, initialMinute = <minute>, is24Hour = <is24Hour>)`, que cria o estado; a chamada é `TimePicker(state = state)`. O composable não tem título nem botões: em diálogo use `TimePickerDialog(onDismissRequest = …, confirmButton = { … }, title = { Text(<title>) }) { TimePicker(state = state) }` (o `TimePickerDialog` é estável). O resultado vem de `state.hour` e `state.minute`; `selection` é o `state.selection` inicial (`TimePickerSelectionMode.Hour` ou `Minute`).

Variante `input`: Exige o mesmo @OptIn(ExperimentalMaterial3Api::class). `TimeInput(state = state)` usa o mesmo `state` de `rememberTimePickerState(initialHour = <hour>, initialMinute = <minute>, is24Hour = <is24Hour>)`, mas desenha só os campos de hora e minuto, sem o relógio; `selection` diz qual campo começa em foco. Em diálogo, use o `TimePickerDialog` como na base.

## Exemplos

- **Relógio, horas**: title=Selecionar horário, mode=picker, hour=14, minute=30, is24Hour=true, selection=hour
- **Relógio, minutos em 12 horas**: title=Selecionar horário, mode=picker, hour=9, minute=45, is24Hour=false, selection=minute
- **Campos**: title=Informe o horário, mode=input, hour=8, minute=5, is24Hour=false
