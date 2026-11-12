# Progress indicator

Indicador de progresso. Circular gira no lugar; linear é uma barra. Com valor entre 0 e 1 é determinado; sem valor é indeterminado.

Tipo de anotação: `progress-indicator` (camada Componentes).

## Campos

| Chave        | Rótulo        | Tipo   | Obrigatório | Opções                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Padrão     | Descrição                                                                                                                                                                       |
| ------------ | ------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shape`      | Forma         | enum   | não         | `circular`, `linear`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `circular` | circular (CircularProgressIndicator) ou linear (LinearProgressIndicator).                                                                                                       |
| `progress`   | Progresso     | number | não         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |            | Progresso de 0 a 1, exato (o desenho calcula o arco e a largura; valor fora do intervalo é preso a ele). Vazio = indeterminado (o desenho mostra um arco ou uma barra parcial). |
| `trackColor` | Cor do trilho | enum   | não         | `primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`, `onSecondary`, `secondaryContainer`, `onSecondaryContainer`, `tertiary`, `onTertiary`, `tertiaryContainer`, `onTertiaryContainer`, `error`, `onError`, `errorContainer`, `onErrorContainer`, `background`, `onBackground`, `surface`, `onSurface`, `surfaceVariant`, `onSurfaceVariant`, `surfaceTint`, `inverseSurface`, `inverseOnSurface`, `inversePrimary`, `outline`, `outlineVariant`, `scrim`, `surfaceBright`, `surfaceDim`, `surfaceContainerLowest`, `surfaceContainerLow`, `surfaceContainer`, `surfaceContainerHigh`, `surfaceContainerHighest` |            | Papel de cor do tema usado no trilho (parâmetro trackColor). Vazio = o padrão do Compose: secondary container (o circular indeterminado não leva trilho).                       |
| `strokeCap`  | Ponta         | enum   | não         | `Round`, `Butt`, `Square`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `Round`    | Ponta do traço (parâmetro strokeCap, StrokeCap). O padrão do Compose é Round nos dois formatos.                                                                                 |

## Compose

- Símbolo: `androidx.compose.material3.CircularProgressIndicator`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt`
- O campo `shape` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `shape`           | Símbolo                     |
| ----------------- | --------------------------- |
| `circular` (base) | `CircularProgressIndicator` |
| `linear`          | `LinearProgressIndicator`   |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
CircularProgressIndicator(    // shape linear: LinearProgressIndicator (mesmos parâmetros)
    progress = { 0.6f },    // sem progress na anotação: chame sem este parâmetro (indeterminado)
)

LinearProgressIndicator(
    progress = { uploadProgress },    // estado da tela, de 0f a 1f
    modifier = Modifier.fillMaxWidth(),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Com `progress` preenchido, passe-o como lambda: `progress = { <progress>f }` (ou ligado ao estado da tela, por exemplo `progress = { uploadProgress }`); o overload com `progress: Float` está `@Deprecated`. Com `progress` vazio, chame sem o parâmetro (indeterminado). O tamanho vem do `Modifier` (`Modifier.size(<largura da marcação>.dp)` no circular, que tem 40 dp por padrão; `Modifier.fillMaxWidth()` no linear). Com `trackColor` preenchido, passe `trackColor = <trackColor>`; `strokeCap = <strokeCap>` (`StrokeCap` de `androidx.compose.ui.graphics`) só quando o campo difere de Round, o padrão do Compose.

Variante `linear`: Estável, sem opt-in. Com `progress` preenchido, `progress = { <progress>f }`; vazio é indeterminado (sem o parâmetro). A barra ocupa a largura da marcação: `Modifier.fillMaxWidth()` ou `Modifier.width(<largura da marcação>.dp)`.

## Exemplos

- **Circular indeterminado**: shape=circular
- **Circular a 60%**: shape=circular, progress=0.6
- **Linear a 30%**: shape=linear, progress=0.3
- **Trilho colorido e ponta reta**: shape=linear, progress=0.4, trackColor=errorContainer, strokeCap=Butt

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt` (linhas 139 a 185: `LinearProgressIndicator` determinado, trilho depois do gap, indicador e parada; 249 a 345: o indeterminado de duas linhas; 399 a 441: `drawLinearIndicator` e as pontas redondas; 519 a 560: `CircularProgressIndicator` determinado (começa às 12h, `gapSizeSweep`); 624 a 690: o indeterminado; 749 a 768: `drawCircularIndicator`; 811 a 863: cores, `CircularStrokeWidth`, `StrokeCap.Round` e os gaps; 886 a 925: `drawStopIndicator`; 1032 a 1042: `LinearIndicatorWidth` 240, `LinearIndicatorHeight` e `CircularIndicatorDiameter`; 1047 a 1068: tempos e `CircularIndeterminateMinProgress` 0,1 e `MaxProgress` 0,87).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ProgressIndicatorTokens.kt` (linhas 21 a 28: `ActiveIndicatorColor` `Primary` e `TrackColor` `SecondaryContainer`), `CircularProgressIndicatorTokens.kt` (`Size` 40, `TrackThickness` 4, `TrackActiveSpace` 4) e `LinearProgressIndicatorTokens.kt` (`Height` 4, `StopSize` 4, `TrackActiveSpace` 4).

**Como o desenho segue o Compose**

- Circular de **40** por 40 (`CircularIndicatorDiameter`), traço de 4 com ponta redonda, desenhado no centro do traço (raio 18). O progresso é preso a 0 e 1 como no Compose (`coerceIn`, linha 528) e o desenho calcula o arco **pelo valor exato**, sem tabela: o indicador `primary` é um arco que parte das 12h e cobre `sweep = progresso x 360°` (linha 541), com o ponto final em `(20 + 18 x sen(sweep), 20 - 18 x cos(sweep))` e o flag de arco grande ligado quando o progresso passa de 0,5. O trilho `secondary-container` começa em `startAngle + sweep + min(sweep, gapSizeSweep)` e varre `360 - sweep - min(sweep, gapSizeSweep) x 2` (linhas 551 e 552), com `gapSizeSweep` = (4 + 4) / (π x 40) x 360 ≈ 22,9° (linhas 542 a 548); o `min` encurta o gap quando o arco é menor que ele (progresso abaixo de ~6,4%). No desenho o trilho é o mesmo arco desenhado a partir das 12h e girado (`rotation`) até o seu começo. O trilho tem o arco grande até ~37,3% e varredura negativa a partir de ~87,3%, quando falta pouco: o Compose chama `drawArc` com varredura negativa (linha 552) e o desenho o repete ao contrário (flag de sentido 0). Em 0 só o trilho inteiro (varredura 360, `drawCircularIndicator` das linhas 749 a 768, desenhado como elipse) e em 1 só o anel do indicador.
- Linear com 4 de altura e a largura da marcação (o Compose usa 240 se não se diz outra). O progresso é preso a 0 e 1 (linha 155) e o desenho calcula a largura **pelo valor exato**: o indicador `primary` vai de 0 a `progresso x largura` mais o meio traço da ponta redonda (+2, linhas 411 a 424); o trilho `secondary-container` começa 4 depois da ponta (o gap entre as pontas redondas, `adjustedGapSize` das linhas 167 a 173) e vai até o fim; a parada é um círculo de 4 em `primary` encostado no fim do trilho (`StopIndicatorTrailingSpace` não corta nada com a parada do tamanho do traço). Em 0 não há barra e o trilho ocupa tudo; em 1 só a barra cheia (o trilho não desenha quando `trackStartFraction` passa de 1, linhas 177 a 181).
- Indeterminado (sem `progress`): quadro congelado da animação. Circular: arco `primary` sem trilho (`circularIndeterminateTrackColor` é transparente) das 12h até o meio do curso do arco animado ((0,1 + 0,87) / 2 de volta). Linear: uma barra entre 30% e 70%, com o trilho dos dois lados e o gap de 4 (a primeira linha da animação de duas linhas).
- O progresso não é arredondado: 0,333 e 0,6667 desenham o arco e a largura de 0,333 e 0,6667, em qualquer valor de 0 a 1, e um valor fora do intervalo vale o extremo mais próximo (menor que 0, como 0; maior que 1, como 1).

**O que ainda difere do Compose**

- Sem a animação (o indeterminado é um quadro) nem a transição do progresso.
- Em 0 o linear não desenha barra (o guard `abs(endFraction - startFraction) > 0`) e o circular também não: o Compose chama `drawArc` com varredura 0 e o desenho assume que isso não deixa marca (não foi conferido num dispositivo).
- No circular em 1 o trilho de varredura negativa não é desenhado: fica por baixo do anel do indicador, que cobre tudo.
- Com o trilho restante menor que o gap de 6 (progresso acima de ~97,5% em 240) a faixa do trilho não é desenhada, e com ele menor que 4 (acima de ~98,3%) a parada de 4 também não: o desenho não deixa nada passar do trilho. A barra de 100% passa 2 do fim (ponta redonda) e a raiz recorta. Com o indicador de menos de 8 de comprimento (progresso abaixo de ~3,3% em 240) o Compose encurta o gap (`min(progresso, gap)`); o desenho mantém os 4.
- `color`, `gapSize` e `strokeWidth` são campos e código, mas o desenho não os usa; `drawStopIndicator` próprio não é campo do tipo; o circular de 40 é o padrão (o `Modifier.size` pode mudar o diâmetro).
- O `trackColor` e o `strokeCap` são campos do tipo. O trilho padrão é `secondary-container` (`ProgressIndicatorDefaults.linearTrackColor` e `circularDeterminateTrackColor`, `ProgressIndicator.kt` linhas 820 a 835; `ProgressIndicatorTokens.TrackColor`), e o circular indeterminado não leva trilho (linhas 836 a 838), a menos que o `trackColor` esteja preenchido. O `strokeCap` padrão é `Round` nos três (`LinearStrokeCap`, `CircularDeterminateStrokeCap` e `CircularIndeterminateStrokeCap`, linhas 845 a 851). No linear, `Butt` e `Square` cortam reto (as extremidades da barra e do trilho sem raio) e `Butt` abre o vão de 4 sem somar a espessura (linhas 164 a 170); `Square` abre o mesmo vão do `Round`. No circular o `cap` do traço troca, mas as pontas dos arcos e o vão angular entre o indicador e o trilho seguem a conta da ponta redonda: com `Butt` o vão fica menor que o do Compose.
