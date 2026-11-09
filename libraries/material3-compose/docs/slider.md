# Slider

Escolhe um valor (single) ou um intervalo (range) deslizando a alça por um trilho, com valores de 0 a 1.

Tipo de anotação: `slider` (camada Componentes).

## Campos

| Chave        | Rótulo              | Tipo   | Obrigatório | Opções                                                                  | Padrão   | Descrição                                                                                                                                                   |
| ------------ | ------------------- | ------ | ----------- | ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | Tipo                | enum   | não         | `single`, `range`                                                       | `single` | single (Slider) escolhe um valor; range (RangeSlider) escolhe um intervalo com duas alças.                                                                  |
| `value`      | Valor               | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.5`    | Posição da alça no tipo single, de 0 a 1 em décimos (valueRange 0f..1f). Ignorado no range.                                                                 |
| `valueStart` | Início do intervalo | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.2`    | Início do intervalo no tipo range, de 0 a 1 em décimos. Ignorado no single.                                                                                 |
| `valueEnd`   | Fim do intervalo    | enum   | não         | `0`, `0.1`, `0.2`, `0.3`, `0.4`, `0.5`, `0.6`, `0.7`, `0.8`, `0.9`, `1` | `0.8`    | Fim do intervalo no tipo range, de 0 a 1 em décimos, maior ou igual ao início. Ignorado no single.                                                          |
| `steps`      | Passos              | number | não         |                                                                         |          | Número de pontos intermediários entre as pontas (Slider.steps). Vazio ou 0 = contínuo. O desenho mostra as marcas de 1 a 9; de 10 em diante desenha como 9. |
| `enabled`    | Habilitado          | enum   | não         | `true`, `false`                                                         | `true`   | false desabilita o slider.                                                                                                                                  |
| `width`      | Largura             | enum   | não         | `wrap`, `fill`, `fixed`                                                 | `fill`   | fill ocupa toda a largura disponível, wrap usa a largura mínima do Compose e fixed usa a largura da marcação (dp).                                          |
| `weight`     | Peso (weight)       | number | não         |                                                                         |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                           |

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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio de forma fica literal no componente (a exceção são os raios assimétricos da trilha, abaixo).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Slider.kt` (linhas 779 a 872: o `Layout` do `Slider`, com o trilho deslocado de metade da alça, a alça em `trilho * valor` e, com `steps`, em `(trilho - 2 * canto) * valor + canto`; 1026 a 1081: o mesmo no `RangeSlider`; 1163 a 1193: `defaultSliderColors`; 1207 a 1240: a `Thumb` de 4 por 44 na forma `HandleShape`; 1430 a 1447: o indicador de parada na cor da trilha ativa e a marca com `TickSize`; 1576 a 1660: `TrackImpl`; 1858 a 2112: `drawTrack` (vão da alça, cantos, marcas puladas no vão); 2114 a 2152: `drawTrackPath`; 2154 a 2162: `drawStopIndicator` e `TickSize`; 2652 a 2658: `TrackHeight`, `ThumbWidth`, `ThumbHeight`, `ThumbTrackGapSize` 6 e `TrackInsideCornerSize` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SliderTokens.kt` (linhas 25 a 30: alça de 4 por 44 e vão de 6; 32 e 56: trilhas de 16; 31 e 55: cores ativa `primary` e inativa `secondary-container`; 35 a 41: desabilitado, com `on-surface` a 0,38 na alça e no trecho ativo e a 0,12 no inativo; 69: `StopIndicatorSize` 4).

**Como o desenho segue o Compose**

- A trilha mede a largura menos 4 (metade da alça de cada lado), tem 16 de altura e fica centrada nos 44. O trecho ativo é `primary` e vai de 0 até `valor * trilha - 8`; o inativo é `secondary-container` e vai de `valor * trilha + 8` até o fim. O 8 é metade da alça (2) mais o vão `ThumbTrackGapSize` (6), como em `drawTrack`.
- A alça é um retângulo de 4 por 44 na forma `corner-full`, em `primary`, com o centro em `valor * trilha`. Os valores de 0 a 1 em décimos escolhem a fração; 0 não desenha o trecho ativo e 1 não desenha o inativo.
- Cantos da trilha: o externo é a metade da altura (8) e o interno, junto da alça, vale `TrackInsideCornerSize` (2). No range, o trecho ativo tem os quatro cantos de 2 e cada trecho de fora tem o canto externo de 8.
- O indicador de parada é um círculo de 4 a 8 do fim do trilho (e, no range, também a 8 do começo), na cor da trilha ativa (`primary`), como no `drawStopIndicator` padrão. Sem o trecho inativo ele não aparece.
- Com `steps`, as marcas ficam em `8 + (trilho - 16) * k / (passos + 1)` e a alça, em `(trilho - 16) * valor + 8` (nas pontas, 0 e 1, continua em `trilho * valor`). A marca sobre o trecho ativo é `secondary-container` e a sobre o inativo, `primary` (`activeTickColor` e `inactiveTickColor`). As posições vêm de uma fileira de círculos com `justify: space-between`; as cores por trecho vêm de recortes (a fileira de `primary` é recortada nos trechos de fora, a de `secondary-container` fica por baixo), e o número de marcas, da condição de visibilidade de cada círculo sobre `steps` (1 a 9).
- Desabilitado (`SliderTokens`): alça e trecho ativo em `on-surface` a `state-disabled-content` (0,38) e trecho inativo a `state-disabled-container` (0,12). As marcas e o indicador seguem `disabledActiveTickColor` (0,12 sobre o ativo) e `disabledInactiveTickColor` (0,38 sobre o inativo).

**O que ainda difere do Compose**

- Os raios assimétricos da trilha (8 e 2) são números dentro da lista de `cornerRadius`: o formato não aceita `$token` nos itens dela (a alça e as demais formas usam `corner-full`).
- O Compose encaixa o valor no passo mais próximo; o desenho só leva a alça ao valor escolhido (as posições com `steps` são as do Compose, mas o valor de um décimo não é arredondado para a marca). `steps` de 10 ou mais desenha como 9; um valor de `steps` não inteiro não é tratado.
- No range, com `steps`, a alça do começo em 0 e a do fim em 1 ficam em `(trilho - 16) * valor + 8`, não na ponta como no Compose (só o single trata as pontas).
- No desabilitado a alça é `on-surface` a 0,38 sobre o que estiver atrás; o Compose compõe essa cor sobre `surface` e a entrega opaca. As marcas também empilham a transparência (a fileira de baixo e a de cima se somam nos trechos de fora).
- Marcas ao lado da alça: o Compose pula as marcas a menos de 8 da alça; o desenho só cobre a que está sob ela (a alça tem a largura da marca). Com a alça numa ponta e `steps` ligado, a primeira marca (a 8 da borda) aparece no vão.
- Um range com início maior que o fim, ou valores iguais, é desenhado sem tratamento especial (o trecho ativo some ou fica de largura 0).
- O `Slider` do Compose mede 48 de altura (`minimumInteractiveComponentSize`) com a alça de 44 centrada; o componente mantém os 44 do tipo.
- Sem estados de pressionado, foco e passar o mouse (a alça de 2 de largura ao pressionar), sem o rótulo de valor (`ValueIndicator`) e sem o `valueRange` livre: o tipo só tem valores de 0 a 1 em décimos.
