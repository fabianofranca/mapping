# Progress indicator

Indicador de progresso. Circular gira no lugar; linear é uma barra. Com valor entre 0 e 1 é determinado; sem valor é indeterminado.

Tipo de anotação: `progress-indicator` (camada Componentes).

## Campos

| Chave      | Rótulo    | Tipo   | Obrigatório | Opções               | Padrão     | Descrição                                                                                                                           |
| ---------- | --------- | ------ | ----------- | -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shape`    | Forma     | enum   | não         | `circular`, `linear` | `circular` | circular (CircularProgressIndicator) ou linear (LinearProgressIndicator).                                                           |
| `progress` | Progresso | number | não         |                      |            | Progresso de 0 a 1. Vazio = indeterminado (o desenho mostra um arco ou uma barra parcial; o desenho aproxima o valor ao centésimo). |

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

> Estável, sem opt-in. Com `progress` preenchido, passe-o como lambda: `progress = { <progress>f }` (ou ligado ao estado da tela, por exemplo `progress = { uploadProgress }`); o overload com `progress: Float` está `@Deprecated`. Com `progress` vazio, chame sem o parâmetro (indeterminado). O tamanho vem do `Modifier` (`Modifier.size(<largura da marcação>.dp)` no circular, que tem 48 dp por padrão; `Modifier.fillMaxWidth()` no linear).

Variante `linear`: Estável, sem opt-in. Com `progress` preenchido, `progress = { <progress>f }`; vazio é indeterminado (sem o parâmetro). A barra ocupa a largura da marcação: `Modifier.fillMaxWidth()` ou `Modifier.width(<largura da marcação>.dp)`.

## Exemplos

- **Circular indeterminado**: shape=circular
- **Circular a 60%**: shape=circular, progress=0.6
- **Linear a 30%**: shape=linear, progress=0.3

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ProgressIndicator.kt` (linhas 139 a 185: `LinearProgressIndicator` determinado, trilho depois do gap, indicador e parada; 249 a 345: o indeterminado de duas linhas; 399 a 441: `drawLinearIndicator` e as pontas redondas; 519 a 560: `CircularProgressIndicator` determinado (começa às 12h, `gapSizeSweep`); 624 a 690: o indeterminado; 749 a 768: `drawCircularIndicator`; 811 a 863: cores, `CircularStrokeWidth`, `StrokeCap.Round` e os gaps; 886 a 925: `drawStopIndicator`; 1032 a 1042: `LinearIndicatorWidth` 240, `LinearIndicatorHeight` e `CircularIndicatorDiameter`; 1047 a 1068: tempos e `CircularIndeterminateMinProgress` 0,1 e `MaxProgress` 0,87).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ProgressIndicatorTokens.kt` (linhas 21 a 28: `ActiveIndicatorColor` `Primary` e `TrackColor` `SecondaryContainer`), `CircularProgressIndicatorTokens.kt` (`Size` 40, `TrackThickness` 4, `TrackActiveSpace` 4) e `LinearProgressIndicatorTokens.kt` (`Height` 4, `StopSize` 4, `TrackActiveSpace` 4).

**Como o desenho segue o Compose**

- Circular de **40** por 40 (`CircularIndicatorDiameter`), traço de 4 com ponta redonda, desenhado no centro do traço (raio 18). Determinado: o indicador `primary` é um arco que parte das 12h e cobre `progresso x 360°`; o trilho `secondary-container` é o arco que começa depois do gap (`gapSizeSweep` = (4 + 4) / (π x 40) x 360 ≈ 22,9°, no máximo o próprio arco) e termina antes do início do indicador. Quando falta pouco (menos de ~12,7%) a conta do Compose dá um arco negativo, que o desenho repete. Em 0 só o trilho inteiro; em 1 só o anel do indicador.
- Linear com 4 de altura e a largura da marcação (o Compose usa 240 se não se diz outra). O indicador `primary` vai de 0 a `progresso x largura` mais o meio traço da ponta redonda (+2); o trilho `secondary-container` começa 4 depois da ponta (o gap entre as pontas redondas) e vai até o fim; a parada é um círculo de 4 em `primary` encostado no fim do trilho (`StopIndicatorTrailingSpace` não corta nada com a parada do tamanho do traço). Em 0 não há barra e o trilho ocupa tudo; em 1 só a barra cheia.
- Indeterminado (sem `progress`): quadro congelado da animação. Circular: arco `primary` sem trilho (`circularIndeterminateTrackColor` é transparente) das 12h até o meio do curso do arco animado ((0,1 + 0,87) / 2 de volta). Linear: uma barra entre 30% e 70%, com o trilho dos dois lados e o gap de 4 (a primeira linha da animação de duas linhas).
- O progresso é lido ao centésimo: cada valor de 0 a 1 tem o seu arco e a sua largura (tabelas no componente). Valor sem caso na tabela (por exemplo 0,655) desenha o quadro do indeterminado no circular e a barra de 40% no linear, sem aviso.

**O que ainda difere do Compose**

- Sem a animação (o indeterminado é um quadro) nem a transição do progresso.
- O progresso aproxima ao centésimo: o formato não tem conta nem arredondamento, então o arco do circular e a largura do linear vêm de tabelas de 101 casos. Valor fora de 0 a 1 não é limitado (`coerceIn`) e cai no mesmo quadro de valor sem caso.
- Em 0 o linear não desenha barra (o guard `abs(endFraction - startFraction) > 0`) e o circular também não: o Compose chama `drawArc` com varredura 0 e o desenho assume que isso não deixa marca (não foi conferido num dispositivo).
- No circular em 1 o trilho de varredura negativa não é desenhado: fica por baixo do anel do indicador, que cobre tudo.
- A barra de 100% passa 2 do fim (ponta redonda) e a raiz recorta. Com o indicador de menos de 8 de comprimento (progresso abaixo de ~3,3% em 240) o Compose encurta o gap (`min(progresso, gap)`); o desenho mantém os 4.
- `color`, `trackColor`, `strokeCap`, `gapSize`, `strokeWidth` e `drawStopIndicator` próprios não são campos do tipo; o circular de 40 é o padrão (o `Modifier.size` pode mudar o diâmetro).
