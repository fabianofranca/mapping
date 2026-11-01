# Slider

Escolhe um valor (single) ou um intervalo (range) deslizando a alça por um trilho, com valores de 0 a 1.

Tipo de anotação: `slider` (camada Componentes).

## Campos

| Chave        | Rótulo              | Tipo   | Obrigatório | Opções                                                                  | Padrão   | Descrição                                                                                                                       |
| ------------ | ------------------- | ------ | ----------- | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | Tipo                | enum   | não         | `single`, `range`                                                       | `single` | single (Slider) escolhe um valor; range (RangeSlider) escolhe um intervalo com duas alças.                                      |
| `value`      | Valor               | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.5`    | Posição da alça no tipo single, de 0 a 1 em décimos (valueRange 0f..1f). Ignorado no range.                                     |
| `valueStart` | Início do intervalo | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.2`    | Início do intervalo no tipo range, de 0 a 1 em décimos. Ignorado no single.                                                     |
| `valueEnd`   | Fim do intervalo    | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.8`    | Fim do intervalo no tipo range, de 0 a 1 em décimos, maior ou igual ao início. Ignorado no single.                              |
| `steps`      | Passos              | number | não         |                                                                         |          | Número de pontos intermediários entre as pontas (Slider.steps). Vazio ou 0 = contínuo. O desenho mostra as marcas de 1 a 5 e 9. |
| `enabled`    | Habilitado          | enum   | não         | `true`, `false`                                                         | `true`   | false desabilita o slider.                                                                                                      |
| `width`      | Largura             | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `fill`   | fill ocupa toda a largura disponível, wrap usa a largura mínima do Compose e fixed usa a largura da marcação (dp).              |
| `weight`     | Peso (weight)       | number | não         |                                                                         |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                               |

## Compose

- Símbolo: `androidx.compose.material3.Slider`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Slider.kt`
- O campo `type` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `type`          | Símbolo       |
| --------------- | ------------- |
| `single` (base) | `Slider`      |
| `range`         | `RangeSlider` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
var value by remember { mutableFloatStateOf(0.5f) }
Slider(    // type range: RangeSlider(value = 0.2f..0.8f, onValueChange = { range -> … })
    value = value,
    onValueChange = { value = it },
    valueRange = 0f..1f,
    steps = 4,    // só com steps preenchido
    enabled = true,
    modifier = Modifier.fillMaxWidth(),    // width = fill
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `Slider(value = <value>f, onValueChange = { … })`: `value` e `onValueChange` ligam a um estado da tela, `valueRange` fica no padrão `0f..1f` e `steps` só entra quando preenchido e maior que 0; `onValueChangeFinished` é opcional. Use a sobrecarga estável `(value, onValueChange, modifier, enabled, valueRange, steps, onValueChangeFinished, colors, interactionSource)`: as que recebem `SliderState` ou os espaços `thumb` e `track` exigem `@OptIn(ExperimentalMaterial3Api::class)` e não são as indicadas aqui. Tamanho: `fill` vira `Modifier.fillMaxWidth()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

Variante `range`: `RangeSlider(value = <valueStart>f..<valueEnd>f, onValueChange = { range -> … })`: o valor é um `ClosedFloatingPointRange<Float>` (`range.start`, `range.endInclusive`) ligado a um estado da tela, com `valueRange = 0f..1f`. Use a sobrecarga estável `(value, onValueChange, …, steps, onValueChangeFinished, colors)`; a que recebe `RangeSliderState` exige `@OptIn(ExperimentalMaterial3Api::class)` e não é a indicada aqui. Tamanho: `fill` vira `Modifier.fillMaxWidth()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Valor único**: type=single, value=0.5
- **Com passos**: type=single, value=0.4, steps=4
- **Intervalo**: type=range, valueStart=0.2, valueEnd=0.8
