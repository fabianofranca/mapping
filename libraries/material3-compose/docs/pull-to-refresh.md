# PullToRefreshBox

Área que atualiza o conteúdo ao puxar para baixo, com o indicador circular no topo. As marcações filhas são o conteúdo, que precisa rolar.

Tipo de anotação: `pull-to-refresh` (camada Componentes).

## Campos

| Chave              | Rótulo                  | Tipo   | Obrigatório | Opções                                                                                                              | Padrão     | Descrição                                                                                                           |
| ------------------ | ----------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `isRefreshing`     | Atualizando             | enum   | não         | `true`, `false`                                                                                                     | `false`    | true mostra o spinner (atualização em curso, isRefreshing = true); false mostra o indicador em arrasto, com a seta. |
| `contentAlignment` | Alinhamento do conteúdo | enum   | não         | `TopStart`, `TopCenter`, `TopEnd`, `CenterStart`, `Center`, `CenterEnd`, `BottomStart`, `BottomCenter`, `BottomEnd` | `TopStart` | Onde o conteúdo fica dentro do Box (Alignment).                                                                     |
| `width`            | Largura                 | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).               |
| `height`           | Altura                  | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                 |
| `weight`           | Peso (weight)           | number | não         |                                                                                                                     |            | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                   |

## Compose

- Símbolo: `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/pulltorefresh/PullToRefresh.kt`
- Estável no commit fixado, sem opt-in.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
var isRefreshing by remember { mutableStateOf(false) }    // isRefreshing

PullToRefreshBox(
    isRefreshing = isRefreshing,
    onRefresh = { /* inicia a atualização e põe isRefreshing em true; ao terminar, volta a false */ },
    contentAlignment = Alignment.TopStart,                // contentAlignment
    modifier = Modifier.fillMaxSize(),
) {
    LazyColumn(Modifier.fillMaxSize()) {    // o conteúdo precisa rolar: as marcações filhas
        items(lista) { /* item */ }
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. `isRefreshing` liga a um estado da tela (`var isRefreshing by remember { mutableStateOf(false) }`) e `onRefresh = { /* inicia a atualização e põe isRefreshing em true; ao terminar, volta a false */ }`. As marcações filhas formam o `content` (um `BoxScope`) e precisam rolar (`LazyColumn` ou `Modifier.verticalScroll`), porque o gesto vem da rolagem aninhada. O `indicator` e o `state` (`rememberPullToRefreshState()`) ficam nos padrões: o indicador circular de 40 dp no topo. `contentAlignment` é o do próprio Box. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Desenho

O indicador é o padrão do Material 3: círculo de 40 em surface container high com sombra e um anel de 16 em on surface variant, a 40 do topo (o limiar de 80 menos o tamanho do indicador) nos dois estados. Com `isRefreshing` verdadeiro mostra o spinner; com falso, o quadro do limiar com o arco e a seta, que no Compose só existe enquanto a pessoa puxa (em repouso o indicador fica escondido). O arco e a seta do arrasto são desenhados na orientação canônica e girados por `rotation`, com os ângulos do Compose escritos como conta no componente; o spinner de "atualizando" é um quadro congelado, sem giro.

## Exemplos

- **Atualizando**: isRefreshing=true, width=fill, height=fill
- **Em repouso**: isRefreshing=false, width=fill, height=fill

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade de cor fica literal no componente e nenhum nó de texto declara `family` (todos herdam `font-sans`). O indicador é o `Indicator` padrão do `PullToRefreshBox`; a seta, o spinner e o círculo não usam ícone do conjunto (são desenhos do próprio Compose).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/pulltorefresh/PullToRefresh.kt` (linhas 120 a 142: `PullToRefreshBox`, o `Box` com o conteúdo e o indicador em `Alignment.TopCenter`; 393 a 430: `PullToRefreshDefaults`, `indicatorShape` `CircleShape`, `indicatorContainerColor` `surfaceContainerHigh`, `indicatorColor` `onSurfaceVariant`, `PositionalThreshold` 80 e `Elevation` `Level2`; 448 a 496: `IndicatorBox`, o `size(SpinnerContainerSize)`, a `translationY = distanceFraction * maxDistance - size.height` (481 a 484) e a sombra só quando `distanceFraction > 0` ou `isRefreshing`; 509 a 541: `Indicator`, o `CircularProgressIndicator` de `StrokeWidth` e `SpinnerSize` enquanto atualiza e o `CircularArrowProgressIndicator` ao puxar; 632 a 661: a seta e o arco; 663 a 681: `drawCircularIndicator`; 690 a 708: `ArrowValues`; 710 a 732: `drawArrow`; 734 a 746: `MaxProgressArc` 0,8, `StrokeWidth` 2,5, `ArcRadius` 5,5, `SpinnerSize` 16, `SpinnerContainerSize` 40, `ArrowWidth` 10, `ArrowHeight` 5, `MinAlpha` 0,3 e `MaxAlpha` 1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt` (o `CircularProgressIndicator` indeterminado, com `StrokeCap.Round` e a faixa de 0,1 a 0,87 de volta; ver `docs/progress-indicator.md`), `tokens/ElevationTokens.kt` (`Level2` 3 dp) e `tokens/ShapeTokens.kt` (`CornerFull`, `CircleShape`).

**Como o desenho segue o Compose**

- Indicador de 40 em `corner-full` (`CircleShape`), em `surface-container-high` com a sombra do nível 2 (`elevation-shadow`, deslocamento 2 e desfoque 6), centrado no topo. O Compose o põe em `distanceFraction * 80 - 40`, então com a fração em 1 (o limiar, que é também o ponto onde ele fica enquanto atualiza) o topo está a 40: é onde o desenho o põe nos dois estados.
- Atualizando (`isRefreshing` verdadeiro): spinner de 16 (`SpinnerSize`) com traço de 2,5 de ponta redonda em `on-surface-variant`; raio do centro do traço 6,75 e o quadro congelado do indeterminado, um arco das 12h até (0,1 + 0,87) / 2 de volta, como no `progress-indicator`.
- Puxando (`isRefreshing` falso): o quadro de `progress` = 1, o instante em que se atinge o limiar (`targetAlpha` 1). `ArrowValues(1)` (`PullToRefresh.kt` 690 a 708) dá `adjustedPercent` 1, `endTrim` 0,8 (`MaxProgressArc`, 734), `rotation` = (−0,25 + 0,4 × 1 + 0) × 0,5 = 0,075 (702), `startAngle` = `rotation` × 360 = 27° (703) e `endAngle` = (`rotation` + `endTrim`) × 360 = 315° (704). As duas peças são `path` na orientação canônica, em 24 de caixa com o círculo de 16 no meio, e o ângulo sai de `rotation` por expressão (em graus, no sentido horário, em volta do centro da caixa, que é o centro do indicador), sem coordenadas giradas à mão:
  - O arco (`drawCircularIndicator`, 663 a 681; `drawArc` de `startAngle` com varredura `endAngle − startAngle`, ponta reta `StrokeCap.Butt`): o `d` é o arco de 288° que parte do 3 horas (o 0° do `drawArc`) no raio 6,75, e o nó leva `rotation` = `startAngle` + `rotation` de `ArrowValues` (o `rotate(degrees = values.rotation)` de 654) = 27,075°, escrito como `(rotation × 360) + rotation` com `rotation` = `(−0,25 + 0,4) × 0,5`.
  - A seta aberta de 10 por 5 (`ArrowWidth`, `ArrowHeight`, 741 e 742) com traço de 2,5 e canto em ponta (`Stroke` padrão; `drawArrow`, 710 a 732): o `d` é o desenho do `moveTo(0, 0)`, `lineTo(5, 5)`, `lineTo(10, 0)` (719 a 722) levado a (raio + centro − `inset`, centro − `strokeWidth`) (724 a 728), isto é, `M13.75 9.5L18.75 14.5L23.75 9.5`, e o nó leva `rotation` = `endAngle − strokeWidth` (729) mais a `rotation` de `ArrowValues` (654) = 312,575°, escrito como `((rotation + 0,8) × 360) − 2,5 + rotation`.
- Fundo da área em `surface`; as marcações filhas formam o conteúdo (o `slot`).

**O que ainda difere do Compose**

- O estado de arrasto é um quadro só (`progress` = 1): o Compose escala a seta (`scale`) e muda a opacidade de 0,3 a 1 conforme o dedo desce, e o indicador sobe e desce com a fração. Antes o desenho mostrava o indicador a 8 do topo com uma seta pequena; agora o quadro é o do limiar, a 40.
- Em `ArrowValues` o `rotation` (0,075 volta) é passado como graus ao `rotate(degrees = values.rotation)` (654); o desenho faz o mesmo e soma esse 0,075° aos dois ângulos (a diferença para o 27° e o 312,5° de antes é de 0,01 px).
- O spinner de "atualizando" não leva `rotation`: o `d` dele já parte das 12h e o arco canônico (do 3 horas, com `rotation` de −90°) teria o mesmo número de coordenadas, sem tirar conta nenhuma.
- O spinner é o quadro congelado da animação (não gira), e o arco não leva o ajuste que o Compose faz nas pontas redondas do indeterminado.
- O recorte do `IndicatorBox` acima do topo (`clipRect(top = 0)`) e a sombra que só aparece com a fração maior que 0 não existem no desenho estático.
- `contentAlignment` e o `weight` não mudam o desenho (o conteúdo é um `slot`), e o `state`, o `indicator` e o `onRefresh` são do código.
