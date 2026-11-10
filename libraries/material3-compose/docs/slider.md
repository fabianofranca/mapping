# Slider

Escolhe um valor (single) ou um intervalo (range) deslizando a alça por um trilho, com valores de 0 a 1.

Tipo de anotação: `slider` (camada Componentes).

## Campos

| Chave         | Rótulo              | Tipo   | Obrigatório | Opções                                  | Padrão   | Descrição                                                                                                                                                                                                                                                                                                                                |
| ------------- | ------------------- | ------ | ----------- | --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`        | Tipo                | enum   | não         | `single`, `range`                       | `single` | single (Slider) escolhe um valor; range (RangeSlider) escolhe um intervalo com duas alças.                                                                                                                                                                                                                                               |
| `value`       | Valor               | number | não         |                                         | `0.5`    | Posição da alça no tipo single, de 0 a 1 (valueRange 0f..1f); com steps, a alça vai ao passo mais próximo. Ignorado no range.                                                                                                                                                                                                            |
| `valueStart`  | Início do intervalo | number | não         |                                         | `0.2`    | Início do intervalo no tipo range, de 0 a 1; com steps, vai ao passo mais próximo. Ignorado no single.                                                                                                                                                                                                                                   |
| `valueEnd`    | Fim do intervalo    | number | não         |                                         | `0.8`    | Fim do intervalo no tipo range, de 0 a 1, maior ou igual ao início; com steps, vai ao passo mais próximo. Ignorado no single.                                                                                                                                                                                                            |
| `steps`       | Passos              | number | não         |                                         |          | Número de pontos intermediários entre as pontas (Slider.steps). Vazio, 0 ou menor que 1 = contínuo. Com steps, o valor vai ao passo mais próximo e o desenho mostra exatamente steps marcas, mais as duas pontas.                                                                                                                        |
| `enabled`     | Habilitado          | enum   | não         | `true`, `false`                         | `true`   | false desabilita o slider.                                                                                                                                                                                                                                                                                                               |
| `interaction` | Interação           | enum   | não         | `none`, `hovered`, `focused`, `pressed` | `none`   | Aparência parada do estado de interação: foco (focused) ou pressionado (pressed) estreitam a alça de 4 para 2; mouse sobre (hovered) mantém a largura de 4 e não muda o desenho; none = sem estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). No range vale para a alça do fim. |
| `width`       | Largura             | enum   | não         | `wrap`, `fill`, `fixed`                 | `fill`   | fill ocupa toda a largura disponível, wrap usa a largura mínima do Compose e fixed usa a largura da marcação (dp).                                                                                                                                                                                                                       |
| `weight`      | Peso (weight)       | number | não         |                                         |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                                                                                                                        |

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
- **Encaixe no passo**: type=single, value=0.37, steps=4
- **Intervalo**: type=range, valueStart=0.2, valueEnd=0.8
- **Mouse sobre**: type=single, value=0.5, interaction=hovered
- **Com foco**: type=single, value=0.4, steps=4, interaction=focused
- **Pressionado**: type=range, valueStart=0.2, valueEnd=0.8, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio de forma fica literal no componente (a exceção são os raios assimétricos da trilha, abaixo).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Slider.kt` (linha 298: `state.value = value`; linhas 779 a 872: o `Layout` do `Slider`, com o trilho deslocado de metade da alça, a alça em `trilho * valor` e, com `steps`, em `(trilho - 2 * canto) * valor + canto`; 1026 a 1081: o mesmo no `RangeSlider`; 2740 a 2759: o `value` do `SliderState` (`coerceIn` e `snapValueToTick`); 2952 a 2979: `activeRangeStart` e `activeRangeEnd` do `RangeSliderState`, que fazem o mesmo; 1163 a 1193: `defaultSliderColors`; 1207 a 1240: a `Thumb` de 4 por 44 na forma `HandleShape`; 1430 a 1447: o indicador de parada na cor da trilha ativa e a marca com `TickSize`; 1576 a 1660: `TrackImpl`; 1858 a 2112: `drawTrack` (vão da alça, cantos, marcas puladas no vão; 2080 a 2111: a fileira de marcas e a cor de cada uma); 2114 a 2152: `drawTrackPath`; 2154 a 2162: `drawStopIndicator` e `TickSize`; 2167 a 2177: `snapValueToTick`; 2192 a 2194: `stepsToTickFractions`; 2652 a 2658: `TrackHeight`, `ThumbWidth`, `ThumbHeight`, `ThumbTrackGapSize` 6 e `TrackInsideCornerSize` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SliderTokens.kt` (linhas 25 a 30: alça de 4 por 44 e vão de 6; 32 e 56: trilhas de 16; 31 e 55: cores ativa `primary` e inativa `secondary-container`; 35 a 41: desabilitado, com `on-surface` a 0,38 na alça e no trecho ativo e a 0,12 no inativo; 69: `StopIndicatorSize` 4).

**Como o desenho segue o Compose**

- A trilha mede a largura menos 4 (metade da alça de cada lado), tem 16 de altura e fica centrada nos 44. O trecho ativo é `primary` e vai de 0 até `valor * trilha - 8`; o inativo é `secondary-container` e vai de `valor * trilha + 8` até o fim. O 8 é metade da alça (2) mais o vão `ThumbTrackGapSize` (6), como em `drawTrack`.
- A alça é um retângulo de 4 por 44 na forma `corner-full`, em `primary`, com o centro em `valor * trilha`. `value` (single) e `valueStart` e `valueEnd` (range) são números de 0 a 1 em qualquer fração, presos a esse intervalo (`coerceIn` em `Slider.kt` 2752, 2954 e 2969); o valor vazio usa o padrão do campo (0,5, 0,2 e 0,8). O trilho acompanha a largura da instância (`$size`). Com o valor encaixado em 0 o trecho ativo não aparece e em 1 o inativo não aparece (o trecho que não existe sai com largura 0).
- Cantos da trilha: o externo é a metade da altura (8) e o interno, junto da alça, vale `TrackInsideCornerSize` (2). No range, o trecho ativo tem os quatro cantos de 2 e cada trecho de fora tem o canto externo de 8.
- O indicador de parada é um círculo de 4 a 8 do fim do trilho (e, no range, também a 8 do começo), na cor da trilha ativa (`primary`), como no `drawStopIndicator` padrão. Sem o trecho inativo ele não aparece.
- **`steps` encaixa o valor.** Com `steps` maior ou igual a 1 o valor vai ao passo mais próximo, como o `SliderState`: `round(valor × (steps + 1)) / (steps + 1)` (o `snapValueToTick` escolhe, entre as frações `k / (steps + 1)` de `stepsToTickFractions`, a de menor distância, `Slider.kt` 2167 a 2177 e 2192 a 2194, depois do `coerceIn` de 2751 a 2759; o `RangeSlider` faz o mesmo em `valueStart` e `valueEnd`, 2952 a 2979). Com 0,37 e `steps` 4 a alça fica em 0,4. Sem `steps` (vazio, 0 ou menor que 1) o desenho é contínuo, sem encaixe; um `steps` com parte fracionária vale o inteiro de baixo. O valor encaixado vale para tudo: a alça, o recuo e os dois trechos.
- **As marcas são exatamente as de `steps`**, para qualquer `steps` (antes: 1 a 9, e de 10 em diante desenhava como 9). A marca k, de 0 a `steps + 1`, fica em `8 + (largura - 20) × k / (steps + 1)` (as `steps + 2` frações de `stepsToTickFractions`, `Slider.kt` 2192 a 2194; as duas pontas e `steps` intermediárias) e, com a alça no passo `p`, a marca `p` cai sob a alça e não é desenhada. A marca sobre o trecho ativo é `secondary-container` e a sobre o inativo, `primary` (`activeTickColor` e `inactiveTickColor`, `Slider.kt` 2109): no single as marcas até a alça são do trecho ativo e as depois dela do inativo; no range, as entre as alças são do ativo e as de fora, do inativo. A fileira é um `repeat` por contagem (`steps + 2`, com `{ "$field": "$index" }` e o espaço entre as marcas calculado da largura) e cada posição tem duas elipses, uma de cada cor, cada uma visível só no trecho dela.
- **O recuo de 8** nas pontas fica como o `Slider.kt` 779 a 872 e 1026 a 1081: com `steps`, a alça do single fora das pontas (valor encaixado maior que 0 e menor que 1) e as duas do range ficam em `8 + (trilho - 16) × fração`; nas pontas, em `trilho × fração`. Como o valor já vem encaixado, 0,03 com `steps` 4 (que vale 0) deixa o recuo, e 0,2 o mantém.
- **Sem `steps`** não há marcas de passo: só o indicador de parada do fim (e, no range, o do começo), cada um só com trecho inativo do lado dele da alça, como o `drawStopIndicator` padrão.
- Desabilitado (`SliderTokens`): alça e trecho ativo em `on-surface` a `state-disabled-content` (0,38) e trecho inativo a `state-disabled-container` (0,12). As marcas e o indicador seguem `disabledActiveTickColor` (0,12 sobre o ativo) e `disabledInactiveTickColor` (0,38 sobre o inativo).

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `SliderTokens.kt` do commit define para a alça e as trilhas: `hovered`, `focused` e `pressed` (não há `Dragged*`, então não há `dragged`).

- **Alça por estado** (nó `alça`; no range, a do fim, a mesma do single): `HoverHandleWidth` 4 (linha 52, a largura de sempre, então o mouse sobre desenha igual ao `none`), `FocusHandleWidth` 2 (linha 44) e `PressedHandleWidth` 2 (linha 62). A alça estreita fica centrada na mesma posição (o mesmo nó `alça`, com largura 2 no lugar de 4). A altura continua 44.
- **Cores:** `HoverHandleColor`, `PressedHandleColor` e `HandleColor` (linhas 51, 61 e 47) são `Primary`; as trilhas por estado (`FocusActiveTrackColor`, `FocusInactiveTrackColor`, `PressedActiveTrackColor`, `PressedInactiveTrackColor`, linhas 43, 45, 60 e 63) repetem `Primary` e `SecondaryContainer` do padrão; os indicadores de parada `HoverStopColor`, `FocusStopColor` e `PressedStopColor` (linhas 53, 46 e 64) são `Primary`, a cor que o desenho já usa. Nada de cor muda por estado.
- **Camada de estado:** não há, porque o commit não a define (acima); por isso o `state-hover`, o `state-focus` e o `state-pressed` não entram no slider.
- **Desabilitado vence:** com `enabled` `false` a alça fica em 4 (`DisabledHandleWidth` 4, linha 39), qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Os raios assimétricos da trilha são `$token` por item da lista de `cornerRadius`: `corner-track-outer` (8, metade da altura da trilha de 16) e `corner-track-inside` (2, `TrackInsideCornerSize`), tokens da biblioteca (a alça e as demais formas usam `corner-full`).
- Num empate exato entre dois passos (por exemplo, 0,1 com `steps` 4, que cai a meio caminho entre 0 e 0,2) o desenho arredonda para cima, como o `Math.round`; o `minByOrNull` do `snapValueToTick` (`Slider.kt` 2175) fica com o primeiro, o menor, e as frações em `Float` do Compose podem desempatar de outro jeito.
- No range, com `steps`, a alça do começo em 0 e a do fim em 1 ficam em `8 + (trilho - 16) × fração`, não na ponta como no Compose (só o single trata as pontas). O `RangeSliderState` também prende o fim no começo (`Slider.kt` 2969); aqui um fim menor que o começo é desenhado como está.
- No desabilitado a alça é `on-surface` a 0,38 sobre o que estiver atrás; o Compose compõe essa cor sobre `surface` e a entrega opaca.
- Marcas ao lado da alça: o Compose pula as marcas a menos de 8 da alça (`Slider.kt` 2090 a 2097); o desenho só deixa de desenhar a que está sob ela. Com a alça numa ponta e `steps` ligado, a marca ao lado dela (a 8 da borda) não é desenhada, como no Compose, que a pula por estar a 8 do centro da alça (antes aparecia pela metade no vão). Sem `steps`, a marca do fim aparece sempre que há trecho inativo depois da alça (valor menor que 1); o desenho de antes a cortava com o recorte quando a alça passava de 97,5% da faixa. No range sem `steps` com as duas alças no fim, essa marca (que ficava antes da alça do início) também não é desenhada.
- Um range com início maior que o fim, ou valores iguais, é desenhado sem tratamento especial (o trecho ativo some ou fica de largura 0).
- Com `steps` a partir de cerca de 1000 o desenho passa do limite de 1000 linhas do `repeat` por contagem (aviso `repeat limitado a 1000 linhas: marcas`) e perde as últimas marcas; `steps` assim não existe na prática.
- O `Slider` do Compose mede 48 de altura (`minimumInteractiveComponentSize`, `Slider.kt` linhas 789 e 1023, no `Slider` e no `RangeSlider`) com a alça de 44 (`SliderTokens.HandleHeight`) centrada, e o `size` e o `sizing` são 328 × 48: a faixa de 44 fica centrada, com 2 de sobra em cima e embaixo.
- Sem ripple animado e sem transição entre estados (o desenho é um quadro parado); sem o rótulo de valor (`ValueIndicator`) e sem o `valueRange` livre: o tipo só tem valores de 0 a 1.
- Sem camada de estado em volta da alça: nem o `SliderTokens.kt` nem a `Thumb` do `Slider.kt` do commit têm uma (não há `StateLayerSize` no slider). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- O vão entre a alça e as trilhas fica em 8 mesmo com a alça de 2: o Compose o recalcula como metade da largura medida da alça mais 6 (7 com a alça estreita) e a trilha ganha 1 de cada lado (`Slider.kt`, linhas 1913 a 1919).
