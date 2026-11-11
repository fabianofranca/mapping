# Tooltip

Dica que aparece ao lado de um elemento (a âncora) ao tocar, pressionar ou passar o ponteiro. Plain traz só um texto curto; rich traz título, texto e uma ação.

Tipo de anotação: `tooltip` (camada Componentes).

## Campos

| Chave    | Rótulo | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                                                  |
| -------- | ------ | ------ | ----------- | --------------- | ------- | -------------------------------------------------------------------------- |
| `style`  | Estilo | enum   | não         | `plain`, `rich` | `plain` | plain (PlainTooltip, só texto) ou rich (RichTooltip, com título e ação).   |
| `text`   | Texto  | string | sim         |                 |         | Texto do tooltip.                                                          |
| `title`  | Título | string | não         |                 |         | Título do tooltip rich. Vazio = sem título. Só vale em rich.               |
| `action` | Ação   | string | não         |                 |         | Texto do botão de ação do tooltip rich. Vazio = sem ação. Só vale em rich. |

## Compose

- Símbolo: `androidx.compose.material3.PlainTooltip`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tooltip.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo        |
| -------------- | -------------- |
| `plain` (base) | `PlainTooltip` |
| `rich`         | `RichTooltip`  |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
TooltipBox(    // style rich: tooltip = { RichTooltip(title = { Text("Modo avião") }, action = { … }) { Text("…") } }
    positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
    tooltip = { PlainTooltip { Text("Adicionar aos favoritos") } },
    state = rememberTooltipState(),
) {
    IconButton(onClick = { /* ... */ }) {
        Icon(Icons.Filled.Favorite, contentDescription = "Adicionar aos favoritos")
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class) (TooltipBox, PlainTooltip e RichTooltip são experimentais no commit fixado). O tooltip não existe sozinho: envolve o elemento âncora em `TooltipBox(positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above), tooltip = { PlainTooltip { Text(<text>) } }, state = rememberTooltipState()) { <âncora> }`; o overload `rememberTooltipPositionProvider()` sem argumento está `@Deprecated` no commit fixado, por isso o argumento de posição (`Above`, `Below`, `Start`, `End`, `Left`, `Right`). O `PlainTooltip` e o `RichTooltip` são extensões do `TooltipScope` recebido pela lambda `tooltip`. A âncora é a marcação sob o tooltip; o texto vai na lambda `content` do `PlainTooltip`.

Variante `rich`: Exige @OptIn(ExperimentalMaterial3Api::class). Mesmo `TooltipBox`, com `tooltip = { RichTooltip(title = { Text(<title>) }, action = { TextButton(onClick = { /* ... */ }) { Text(<action>) } }) { Text(<text>) } }`, `state = rememberTooltipState(isPersistent = true)` quando há `action` (para o tooltip não sumir antes do toque) e `TooltipBox(hasAction = true, …)`. `title` e `action` só entram quando preenchidos; o `text` vai na lambda final (parâmetro `text`).

## Exemplos

- **Plain**: style=plain, text=Adicionar aos favoritos
- **Rich com título**: style=rich, title=Modo avião, text=Desliga o Wi-Fi, o Bluetooth e os dados móveis.
- **Rich com ação**: style=rich, title=Sincronização, text=Suas fotos são copiadas para a nuvem quando há Wi-Fi., action=Saiba mais

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade de cor fica literal no componente e nenhum nó de texto declara `family` (todos herdam `font-sans`).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tooltip.kt` (linhas 421 a 481: `PlainTooltip`, o `Surface` (456) com `sizeIn(minWidth = TooltipMinWidth, maxWidth, minHeight = TooltipMinHeight)` e `padding(PlainTooltipContentPadding)` (464 a 470) e o estilo `PlainTooltipTokens.SupportingTextFont` (472); 530 a 616: `RichTooltip`, o `Surface` (568) com o mesmo `sizeIn` (570 a 574), a `Column` com `padding(horizontal = RichTooltipHorizontalPadding)` (584), o título com `paddingFromBaseline(top = HeightToSubheadFirstLine)` (586), o texto com `textVerticalPadding` (594) e a ação com `requiredHeightIn(min = ActionLabelMinHeight)` e `padding(bottom = ActionLabelBottomPadding)` (604 e 605); 620 a 644: `TooltipDefaults`, as formas e o `plainTooltipMaxWidth` 200 (641) e o `richTooltipMaxWidth` 320 (644); 681 a 690: as cores do rich; 1251 a 1258: `textVerticalPadding`; 1641 a 1653: `TooltipMinHeight` 24, `TooltipMinWidth` 40, `PlainTooltipVerticalPadding` 4, `PlainTooltipHorizontalPadding` 8, `RichTooltipHorizontalPadding` 16, `HeightToSubheadFirstLine` 28, `HeightFromSubheadToTextFirstLine` 24, `TextBottomPadding` 16, `ActionLabelMinHeight` 36 e `ActionLabelBottomPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/PlainTooltipTokens.kt` (linhas 20 a 23: contêiner `InverseSurface`, forma `CornerExtraSmall`, texto `InverseOnSurface` em `BodySmall`) e `tokens/RichTooltipTokens.kt` (linhas 24 a 33: ação em `Primary` e `LabelLarge`, contêiner `SurfaceContainer`, `ContainerElevation` `Level2`, forma `CornerMedium`, título `OnSurfaceVariant` em `TitleSmall`, texto `OnSurfaceVariant` em `BodyMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevationTokens.kt` (`Level2` 3 dp), `tokens/ShapeTokens.kt` (`CornerExtraSmall` 4 e `CornerMedium` 12) e `tokens/TypeScaleTokens.kt` (`BodySmall` 12/16/400/0,4, `BodyMedium` 14/20/400/0,2, `TitleSmall` 14/20/500/0,1 e `LabelLarge` 14/20/500/0,1).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (linhas 479 a 543: `TextButtonContentPadding` 12 e `MinHeight` 40), a ação do rich é um `TextButton`.

**Como o desenho segue o Compose**

- Plain: pílula em `inverse-surface` com `corner-extra-small` (4) e texto em `body-small` (12/16) em `inverse-on-surface`; os dois papéis `inverse-*` trocam de modo, então no dark o fundo é claro e o texto escuro. Padding de 8 dos lados e 4 em cima e embaixo (`PlainTooltipContentPadding`), o que dá 24 com uma linha. Largura entre 40 (`TooltipMinWidth`, `minWidth`) e 200 (`plainTooltipMaxWidth`, `maxWidth`), contando o padding como o `sizeIn` do Compose; o texto leva o `maxWidth` de 184 e quebra em linhas de 16 sem `maxLines`, porque o `PlainTooltip` não corta o texto.
- Rich: cartão em `surface-container` com `corner-medium` (12) e as duas sombras do nível 2 (ponto: `y` 1, `blur` 2; ambiente: `y` 2, `blur` 6, `spread` 2; tokens `elevation-2-point-*` e `elevation-2-ambient-*`), de 40 a 320 de largura (`minWidth`, `maxWidth`) e 24 de altura mínima. Respiro horizontal de 16 (`RichTooltipHorizontalPadding`); título em `title-small` e texto em `body-medium`, os dois em `on-surface-variant`; ação em `label-large` em `primary`, dentro de um `TextButton` de 40 com 12 de cada lado.
- Verticais pelo `paddingFromBaseline` e `textVerticalPadding` do Compose, com `baselinePadding` (a linha de base de quem desenha, em qualquer fonte): o título tem a primeira linha de base a 28 do topo (`HeightToSubheadFirstLine`, `Tooltip.kt` linhas 586 e 1649); o texto, a 24 do **fim da caixa do título** (`HeightFromSubheadToTextFirstLine`, linhas 1255 e 1650) e 16 até o fim (`TextBottomPadding`, linhas 1256 e 1651); sem título e com ação, a base do texto fica a 24 do topo; sem título e sem ação, 4 em cima e embaixo (`PlainTooltipVerticalPadding`, linha 1253), só com padding. A ação vem 16 abaixo do fim do texto e 8 antes do fim (`ActionLabelBottomPadding`, linha 605). Os 24 contam do fim da caixa do título, e não da base dele: o teste do androidx confere `subheadBound.bottom + 24.dp - textBaseLine` (`TooltipTest.kt` linha 260 em `compose/material3/material3/src/androidInstrumentedTest/kotlin/androidx/compose/material3/`), então a base do texto fica 29 abaixo da base do título, e não 24.
- Alturas de uma linha de texto: plain 24; rich só com texto 28; com título 78; com título e ação 126; com ação e sem título 93. Um título ou um texto de várias linhas soma 20 por linha.
- Rótulos centrados pela maiúscula (`cap-middle`): o `rótulo da ação` do tooltip rico usa `font.verticalAlign: "cap-middle"` e ocupa a altura do botão de 40 (`height: "fill"`); o `texto` do tooltip simples usa o mesmo valor e segue `hug`, porque o pai mede pelo texto. O texto e o título do tooltip rico, que são parágrafos, ficam como estão. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- Três números do desenho não são constantes do Compose: o `bottom` 6 do título, o `top` 23 do texto com título e o `bottom` 21 do texto. Eles escrevem o mesmo posicionamento de modo que a altura saia inteira com a linha de base do Roboto 14/20 (14,83 no medidor aproximado, 15 no Compose): a caixa do título do Compose mede 28 + 5 e o texto fica 24 abaixo dela; o desenho põe 28 + 6 e 23, e as duas bases ficam nos mesmos 28 e 57 (29 de distância); o 21 são os 16 do `TextBottomPadding` mais os 5 da linha de base ao fim da linha. O `baselinePadding` nunca fica abaixo da distância da fonte, então com uma fonte de linha de base mais afastada do fim da linha o espaço cresce, como no Compose.
- Altura da ação: o `Box` com `requiredHeightIn(min = 36)` envolve o `TextButton` que a tela passa, que mede 40 (`MinHeight`); o desenho assume o `TextButton` padrão, como o `code` do tipo. Uma ação de outro tamanho não é desenhada.
- O rótulo da ação fica a 12 da borda do texto (o `TextButtonContentPadding`): o Compose também o recua, e o rótulo não alinha com o texto do corpo.
- Sem a seta (`caretShape`) nem o posicionamento em relação à âncora (`TooltipBox`, `TooltipAnchorPosition`, `spacingBetweenTooltipAndAnchor` 4): o tooltip é desenhado sozinho no canto da marcação.
- As duas sombras (ponto e ambiente) vêm dos tokens `elevation-2-point-*` e `elevation-2-ambient-*` (`$token` em `shadow`, lista de duas sombras com `spread`); a tonal da elevação não é desenhada. Valores da elevação do Material 3 para a web: `elevation/internal/_elevation.scss` do `material-components/material-web` (versão 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), fonte de fora do Compose, que no Android entrega a elevação à plataforma e não traz os números: sombra de ponto em preto a 30% e sombra ambiente em preto a 15%, com `y`, `blur` e `spread` por nível (tokens `elevation-2-point-*` e `elevation-2-ambient-*`). O plain não tem sombra (`shadowElevation` 0).
- O `RichTooltip` com `maxWidth` maior que a largura da marcação é limitado pela marcação (`fill`); o rich sem retângulo (medido) fica em 320 no máximo.
- Sem a animação de entrada e saída, os estados de foco e pressionado, nem o `contentDescription` do `TooltipBox`.
