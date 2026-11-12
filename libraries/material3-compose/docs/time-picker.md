# Time picker

Seletor de hora. Picker mostra os campos de hora e minuto com o relógio; input mostra só os campos para digitar. Exige opt-in experimental.

Tipo de anotação: `time-picker` (camada Componentes).

## Campos

| Chave         | Rótulo     | Tipo   | Obrigatório | Opções                                  | Padrão   | Descrição                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ---------- | ------ | ----------- | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | Título     | string | não         |                                         |          | Título do diálogo (o `title` do TimePickerDialog). Vazio = sem título.                                                                                                                                                                                                                                                                           |
| `mode`        | Modo       | enum   | não         | `picker`, `input`                       | `picker` | picker é o relógio (TimePicker); input são só os campos de hora e minuto (TimeInput).                                                                                                                                                                                                                                                            |
| `hour`        | Hora       | number | não         |                                         |          | Hora de 0 a 23 (initialHour), sempre no formato de 24 horas.                                                                                                                                                                                                                                                                                     |
| `minute`      | Minuto     | number | não         |                                         |          | Minuto de 0 a 59 (initialMinute).                                                                                                                                                                                                                                                                                                                |
| `is24Hour`    | 24 horas   | enum   | não         | `true`, `false`                         | `true`   | true usa 24 horas; false usa 12 horas com o seletor AM/PM.                                                                                                                                                                                                                                                                                       |
| `selection`   | Em seleção | enum   | não         | `hour`, `minute`                        | `hour`   | Qual parte está sendo escolhida (o relógio mostra as horas ou os minutos). É o estado inicial, não um parâmetro.                                                                                                                                                                                                                                 |
| `interaction` | Interação  | enum   | não         | `none`, `hovered`, `focused`, `pressed` | `none`   | Aparência parada do estado de interação do item escolhido (o seletor da hora ou o do minuto, o que o selection escolhe): mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem estado. Só muda o desenho, não entra no código. O tipo não tem enabled, então não existe um desabilitado que vença: o estado sempre desenha. |

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
- **24 horas, campos**: title=Informe o horário, mode=input, hour=18, minute=5, is24Hour=true
- **10:37 em 24 horas, minutos**: title=Selecionar horário, mode=picker, hour=10, minute=37, is24Hour=true, selection=minute
- **22:05 em 12 horas (PM)**: title=Selecionar horário, mode=picker, hour=22, minute=5, is24Hour=false, selection=hour
- **Mouse sobre**: title=Selecionar horário, mode=picker, hour=14, minute=30, is24Hour=true, selection=hour, interaction=hovered
- **Com foco**: title=Selecionar horário, mode=picker, hour=9, minute=45, is24Hour=false, selection=minute, interaction=focused
- **Pressionado**: title=Informe o horário, mode=input, hour=8, minute=5, is24Hour=false, selection=hour, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePicker.kt` (linhas 349 a 376: `defaultTimePickerColors`, que liga cada papel de cor ao token, com o fundo do período não selecionado transparente; 931 a 947: `selectorPos`, a alça no raio externo ou, só em 24 horas com PM, no interno; 953 a 971: `VerticalTimePicker`, o display, 36 de margem (`ClockDisplayBottomMargin`) e o relógio; 998 a 1130: `TimeInputImpl`; 1154 a 1200: `VerticalClockDisplay` e `ClockDisplayNumbers`, com o `PeriodToggleMargin` de 12; 1249 a 1292 e 1295 a 1377: `VerticalPeriodToggle` e `PeriodToggleImpl`, o contorno de 1 e o divisor; 1380 a 1394: `DisplaySeparator`; 1398 a 1440: `TimeSelector`; 1587 a 1655: `ClockFace` e os dois anéis; 1657 a 1721: `drawSelector`, a alça de 48, o trilho de 2 e o centro de 8; 1723 a 1790: `ClockText` e o `toLocalString()` dos números; 1858 a 1960: `TimePickerTextField` e o rótulo de apoio a `SupportLabelTop`; 2066 a 2085: as constantes `OuterCircleToSizeRatio` (101/256), `InnerCircleToSizeRatio` (69/256), `DisplaySeparatorWidth` 24, `SupportLabelTop` 7, `PeriodToggleMargin` 12 e `Hours`/`ExtraHours`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TimePickerDialog.kt` (linhas 96 a 125: `TimePickerDialogLayout`, o `Surface` do diálogo com `DialogTokens`; 127 a 236: `TimePickerCustomLayout`, o padding de 24 e o conteúdo centrado; 261 a 285 e 295 a 311: `DisplayModeToggle` e `Title`, `labelMedium` com 20 de padding embaixo).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TimePickerTokens.kt` (linhas 24 a 76: `ClockDialColor` `SurfaceContainerHighest`, `ClockDialContainerSize` 256, `ClockDialLabelTextFont` `BodyLarge`, `ClockDialSelectedLabelTextColor` `OnPrimary`, o seletor `Primary` com alça de 48, trilho de 2 e centro de 8, `ClockDialUnselectedLabelTextColor` `OnSurface`, `HeadlineColor` `OnSurfaceVariant`, `HeadlineFont` `LabelMedium`, o período `CornerSmall` de 52 × 80 com contorno `Outline` de 1, `TertiaryContainer` e `OnTertiaryContainer` selecionados, `OnSurfaceVariant` não selecionado, `TimeSelectorContainer` de 96 × 80 na forma `CornerSmall`, `PrimaryContainer` e `OnPrimaryContainer` selecionados, `SurfaceContainerHighest` e `OnSurface` não selecionados, `DisplayLarge`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TimeInputTokens.kt` (linhas 24 a 59: campos de 96 × 72, período de 52 × 72, `DisplayMedium` nos campos, `BodySmall` e `OnSurfaceVariant` no rótulo de apoio, contorno de foco `Primary` de 2) e `TypeScaleTokens.kt` (as escalas `display-large`, `display-medium`, `body-large`, `body-small`, `title-medium` e `label-medium`, que são os tokens de tipografia da especialização).

**Como o desenho segue o Compose**

- Diálogo: `surface-container-high` (`DialogTokens.ContainerColor`), forma `corner-extra-large` (28) e padding de 24; a elevação do diálogo é tonal (nível 3), sem sombra. Título em `label-medium` (12, linha 16, peso 500, espaçamento 0,5) e `on-surface-variant`, numa faixa de 36 (a linha de 16 mais o `padding(bottom = 20)` do `Title`).
- Hora e minuto (96 × 80, forma `corner-small`, texto em `display-large` 57/64): o selecionado em `primary-container` com `on-primary-container`, o outro em `surface-container-highest` com `on-surface`; dois pontos de 24 em `on-surface`. Os números levam sempre dois dígitos (`toLocalString(minDigits = 2)`; em 12 horas a hora de 0 e a de 12 mostram 12): o zero à esquerda sai de um `$if` com `$lt` que junta `"0"` ao número, e o 12 horas de `((hora + 11) mod 12) + 1`. O período PM vale de 12 a 23 (`$gte`). O conjunto centra no conteúdo, e em 12 horas o período entra 12 depois do minuto.
- Período AM/PM (52 × 80 no relógio, 52 × 72 nos campos): forma `corner-small`, contorno de 1 em `outline`, divisor de 1 em `outline` no meio e rótulos em `title-medium`. O período selecionado usa `tertiary-container` com `on-tertiary-container` (é o `PeriodSelectorSelectedContainerColor` do token), o outro fica sem fundo e em `on-surface-variant`. PM vale de 12 a 23.
- Relógio: círculo de 256 em `surface-container-highest` (`corner-full`), a 36 do display. Os números ficam em `body-large` (16/24, espaçamento 0,5) e `on-surface`, no anel externo de raio 101 (os 12 de `Hours`; em 24 horas mostram 0 a 11) e, só em 24 horas com a hora em seleção, no interno de raio 69 (12 a 23). Nos minutos o anel externo mostra 0, 5, 10… 55. Os rótulos saem de `toLocalString()` sem `minDigits`, por isso sem zero à esquerda (o `ClockText` do commit), diferente das versões 1 a 3 do componente, que mostravam `00` e `05`.
- Seletor: a alça de 48 em `primary` (`corner-full`) fica no raio 101 ou, em 24 horas com a hora de 12 a 23, no 69, no ângulo da hora (30° por hora, `hora mod 12`) ou do minuto (6° por minuto) a partir do topo, por `$sin` e `$cos` do ângulo contado do topo no sentido horário, como o Compose: `hourAngle = RadiansPerHour * (hour % 12) - FullCircle / 4` e `minuteAngle = RadiansPerMinute * minute - FullCircle / 4` (`TimePicker.kt`, linhas 740 e 741, o quarto de volta a menos põe o zero no topo) e `selectorPos` (linhas 945 e 946, `length * cos(currentAngle)` e `length * sin(currentAngle)` somados ao centro); aqui o ponto é `centro + raio * sin(θ)` na horizontal e `centro - raio * cos(θ)` na vertical, com θ contado do topo, que dá o mesmo ponto; leva dentro o número selecionado em `body-large` e `on-primary` (o minuto fora da grade de 5 fica sem número, como no Compose). O trilho de 2 em `primary` vai do centro ao centro da alça (um traço de `M128 128` até o mesmo ponto, escrito com `$concat`; o Compose o termina na borda da alça, `drawSelector`, linhas 1657 a 1721, mas a alça o cobre) e o centro de 8 em `primary` fecha o ponteiro. Fica a trigonometria e não a `rotation`: a alça (com o número dentro) e o trilho precisam do ponto final, e é a conta que o `selectorPos` do Compose faz; com `rotation` seria um quadro de 256 girado por ponteiro, com o número da alça girado de volta.
- Campos (`mode` = `input`): campos de 96 × 72 na forma `corner-small` com o número em `display-medium` 45/52; o campo em foco usa `primary-container` com `on-primary-container` e contorno de 2 em `primary`, e o outro `surface-container-highest` com `on-surface` e sem contorno. Rótulos "Hora" e "Minuto" em `body-small` 12/16 e `on-surface-variant`, a 7 (`SupportLabelTop`) abaixo do campo.
- Os dois modos usam a mesma linha de hora, minuto e período: o `mode` troca só a altura (80 ou 72), a fonte (`display-large` ou `display-medium`), o contorno do campo em foco e o rótulo de apoio, o que mantém o arquivo menor que nas versões 1 a 3.
- Os números de hora e minuto, os dois pontos, o AM/PM, os números do relógio e o número da alça centram pela altura da maiúscula (`font.verticalAlign: "cap-middle"`); o título e os rótulos "Hora" e "Minuto" seguem como estão. O `Text` do Compose centra pela caixa de linha da fonte; com Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- Os números do mostrador são um `repeat` por `count` (12, ou 24 em 24 horas escolhendo a hora) de quadros sem tamanho, cada um com o número ancorado por `$sin` e `$cos` do índice (30° por número, raio 101 ou 69 pelo índice), como o `ClockFace` posiciona os `ClockText` por `radiusPx * cos(theta * i - QuarterCircle)` e `sin` (`TimePicker.kt`, linhas 1991 a 2002). O ponteiro e os números seguem o mesmo raio, então mudar o raio do relógio é trocar os dois números no arquivo.
- Número sobreposto à alça: o Compose desenha por cima da alça, em `on-primary`, a parte dos números vizinhos que ela cobre (`drawSelector`, `BlendMode.DstOver`); aqui, sem mistura: a alça é um quadro circular com `clip` e, dentro dele, uma cópia dos números em `on-primary`, deslocada pela posição da alça (as âncoras por expressão de `números sob a alça`). O número coberto pela metade sai meio `on-primary`, meio `on-surface`, e a hora ou o minuto sem número embaixo (10:37) mostra os pedaços de 35 e de 40 que a alça cobre. O PNG do MCP recorta o quadro no retângulo da alça, não no círculo.
- Largura do diálogo: o `size` do componente é 328, o de 12 horas (conteúdo de 280 mais o padding de 24). Em 24 horas o Compose mede 304 no relógio (o mostrador de 256 é o mais largo) e 264 nos campos; aqui a largura fica em 328 e o conteúdo vai centrado. O exemplo "24 horas, campos" mostra o limite; a roadmap #898 (medida pelo conteúdo) o resolve.
- Altura do diálogo: o `size` é 328 × 528 (456 do conteúdo e do padding, mais 24 de `ClockFaceBottomMargin`, `TimePicker.kt` linha 2069, e mais 48 da linha de ações do `TimePickerDialog`, `TimePickerDialog.kt` linhas 189 a 193, com o `TextButton` em `MinimumInteractiveSize` 48, `TimePicker.kt` linha 2075). A linha de ações em si não é desenhada: o botão que alterna entre relógio e campos (`TimePickerDialogDefaults.DisplayModeToggle`, ícones `Keyboard` e `Schedule`), o cancelar e o confirmar ficam de fora, então a margem e a linha reservadas sobram embaixo, só com o fundo (efeito aceito, como na #863). O `TimePicker` em si não tem essa linha, só o `TimePickerDialog`.
- Só o layout vertical do `TimePicker`: o horizontal (`HorizontalTimePicker`, em janela baixa) e os relógios de 238 e 200 (`ClockFaceSizeModifier`) não existem.
- O separador dos campos usa `display-medium`, a fonte do `LocalTextStyle` do `TimeInputImpl`; o token `TimeFieldSeparatorFont` diz `display-large`, mas o `DisplaySeparator` lê o estilo local.
- Estado de interação (campo `interaction`): `none`, `hovered`, `focused` e `pressed`, as opções que o `TimePickerTokens.kt` nomeia para o seletor de hora e minuto e para o período (`TimeSelectorSelectedHoverLabelTextColor`, `...FocusLabelTextColor`, `...PressedLabelTextColor`, linhas 66 a 76, e os `PeriodSelector...` das linhas 50 a 57). Vale para o **seletor escolhido**: o campo da hora ou o do minuto, conforme o `selection`. A camada é o nó `estado`, um retângulo parado do tamanho do campo (96 × 80 no relógio, 96 × 72 nos campos, forma `corner-small`) na cor do texto do campo selecionado (`on-primary-container`, o conteúdo do `TimeSelector`) com a opacidade de `state-hover` (0,08), `state-focus` (0,10) ou `state-pressed` (0,10). No modo input o Compose desenha um campo de texto (sem ripple), mas o desenho usa a mesma camada nos dois modos. O tipo não tem `enabled`, então o estado sempre desenha.
- Sem cursor, animação do relógio nem `Crossfade`; o estado do período AM/PM e do outro campo não é desenhado: o desenho é uma imagem de um estado só (`selection` e os valores dizem qual).
- Os rótulos "Hora" e "Minuto" são texto fixo em português (o Compose os lê de `Strings`).

- O `TimeInputTokens.kt` define `FocusIndicatorColor` (linha 27) para o campo do modo de digitação, e o contorno de 2 em `primary` do campo em foco já é desenhado (como antes); o `interaction` `focused` acrescenta só a camada de estado, não um anel de foco extra.
