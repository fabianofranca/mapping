# Snackbar

Aviso rápido e temporário na parte de baixo da tela, com uma mensagem curta, uma ação opcional e, se quiser, o botão de fechar.

Tipo de anotação: `snackbar` (camada Componentes).

## Campos

| Chave             | Rótulo             | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                                                                                                                                          |
| ----------------- | ------------------ | ------ | ----------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message`         | Mensagem           | string | sim         |                 |         | Texto do snackbar.                                                                                                                                                 |
| `actionLabel`     | Ação               | string | não         |                 |         | Texto do botão de ação. Vazio = sem ação.                                                                                                                          |
| `dismissAction`   | Botão de fechar    | enum   | não         | `true`, `false` | `false` | true mostra o botão de fechar (ícone Close) depois da ação.                                                                                                        |
| `actionOnNewLine` | Ação em nova linha | enum   | não         | `true`, `false` | `false` | true põe a ação abaixo da mensagem, para textos longos (com uma linha de texto a altura do retângulo passa de 48 para 92; os 68 são a linha única de duas linhas). |

## Compose

- Símbolo: `androidx.compose.material3.Snackbar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Snackbar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
val snackbarHostState = remember { SnackbarHostState() }
val scope = rememberCoroutineScope()

Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { innerPadding ->
    Button(
        onClick = {
            scope.launch {
                snackbarHostState.showSnackbar(
                    message = "Mensagem arquivada",
                    actionLabel = "Desfazer",
                    withDismissAction = true,
                )
            }
        },
        modifier = Modifier.padding(innerPadding),
    ) { Text("Arquivar") }
}

// Visual próprio, sem o host:
Snackbar(
    action = { TextButton(onClick = { /* desfazer */ }) { Text("Desfazer") } },
    dismissAction = { IconButton(onClick = { /* fechar */ }) { Icon(Icons.Filled.Close, contentDescription = "Fechar") } },
    actionOnNewLine = false,
) { Text("Mensagem arquivada") }
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. O snackbar costuma ser mostrado pelo `SnackbarHost` (arquivo `SnackbarHost.kt`) no slot `snackbarHost` do Scaffold: `snackbarHost = { SnackbarHost(snackbarHostState) }`, com `val snackbarHostState = remember { SnackbarHostState() }`, e aparece com `scope.launch { snackbarHostState.showSnackbar(message = <message>, actionLabel = <actionLabel>, withDismissAction = <dismissAction>) }`; nesse caso a `Snackbar` é a padrão do host e não se chama à mão. Para um visual próprio, use `Snackbar(action = { TextButton(onClick = …) { Text(<actionLabel>) } }, dismissAction = { IconButton(onClick = …) { Icon(Icons.Filled.Close, contentDescription = …) } }, actionOnNewLine = <actionOnNewLine>) { Text(<message>) }`: `action` só entra com `actionLabel` preenchido e `dismissAction` só com `dismissAction = true`.

## Exemplos

- **Só mensagem**: message=Arquivo salvo
- **Com ação**: message=Mensagem arquivada, actionLabel=Desfazer
- **Com ação e fechar**: message=Sem conexão, actionLabel=Tentar de novo, dismissAction=true

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade fica literal no componente, nenhum nó de texto declara `family` (todos herdam `font-sans`) e o ícone de fechar é o nó `icon` do conjunto da biblioteca (`close`), sem caminho SVG no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Snackbar.kt` (linhas 100 a 140: `Snackbar`, o `Surface` com `shadowElevation = SnackbarTokens.ContainerElevation` (117) e a escolha entre `NewLineButtonSnackbar` e `OneRowSnackbar`; 197 a 250: o `Snackbar(snackbarData)`, o `TextButton` da ação, o `IconButton` com `Icons.Filled.Close` e o `padding(12.dp)` de fora (238); 252 a 295: `NewLineButtonSnackbar`, `padding(start = 16, bottom = 2)`, `paddingFromBaseline(30, 12)` no texto e `padding(end = 8)` nas ações; 297 a 409: `OneRowSnackbar`, o texto com `padding(vertical = 6)` (310), a largura do texto sem os botões e sem os 8 de `TextEndExtraSpacing` quando não há fechar (344 a 347), a altura mínima de 48 (366) ou 68 (385) pelo número de linhas e o texto a 30 da linha de base (383) na versão de várias linhas; 411 a 435: `SnackbarDefaults`; 437 a 444: `ContainerMaxWidth` 600, `HeightToFirstLine` 30, `HorizontalSpacing` 16, `HorizontalSpacingButtonSide` 8, `SeparateButtonExtraY` 2, `SnackbarVerticalPadding` 6, `TextEndExtraSpacing` 8 e `LongButtonVerticalOffset` 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SnackbarTokens.kt` (linhas 26 e 27: ação em `InversePrimary` e `LabelLarge`; 29 a 31: contêiner `InverseSurface`, `ContainerElevation` `Level3` e forma `CornerExtraSmall`; 32 e 36: ícone `InverseOnSurface` de 24; 37 e 38: texto em `InverseOnSurface` e `BodyMedium`; 39 e 40: alturas 48 e 68), `ElevationTokens.kt` (`Level3` 6 dp) e `ShapeTokens.kt` (linha 38: `CornerExtraSmall` 4).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (linhas 497 a 510 e 527: `TextButtonContentPadding` de 12 e `MinWidth` 58), `IconButton.kt` (linhas 177 a 179: `minimumInteractiveComponentSize()` e `smallContainerSize()`, o contêiner de 40) e `Surface.kt` (linha 219: a área de toque de 48 do `Surface` clicável).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt` (`BodyMedium` 14/20/400/0,2 e `LabelLarge` 14/20/500/0,1).

**Como o desenho segue o Compose**

- Contêiner `inverse-surface` com `corner-extra-small` (4) e as duas sombras do nível 3 (ponto: `y` 1, `blur` 3; ambiente: `y` 4, `blur` 8, `spread` 3; tokens `elevation-3-point-*` e `elevation-3-ambient-*`), em light e dark: no dark o fundo é claro e o texto escuro, porque os papéis `inverse-*` trocam de modo.
- Mensagem em `body-medium` (14/20) em `inverse-on-surface`, a 16 da borda. Ação (`TextButton`) em `label-large` em `inverse-primary`, com 12 de cada lado, 58 no mínimo e 48 de altura (os 40 do botão mais a área de toque mínima); fechar é um `IconButton` com a área de 48 e o ícone `close` de 24 em `inverse-on-surface`, colado à direita (12 do ícone à borda).
- Uma linha: altura mínima de 48 (`SingleLineContainerHeight`), mensagem centrada na altura. Com ação e sem fechar, a ação termina a 8 da borda (`HorizontalSpacingButtonSide`) e a mensagem a 8 dela (`TextEndExtraSpacing`); sem ação nem fechar, a mensagem tem 16 dos dois lados (8 + 8); com fechar não há folga entre a mensagem e a ação, e o fechar encosta na borda.
- Duas ou mais linhas (`OneRowSnackbar`, `Snackbar.kt` linhas 382 a 394): a primeira linha de base do texto fica a 30 do topo (`HeightToFirstLine`, linhas 383 e 384; o texto leva `baselinePadding.top` 30) e a última a 11 do fundo da caixa do texto (os 6 de `SnackbarVerticalPadding`, linha 310, mais os 5 da linha de base ao fim da linha do Roboto 14/20); a altura é a maior entre 68 (`TwoLinesContainerHeight`, linha 385) e a do texto (linhas 386 e 387): duas linhas medem 68 e três medem 81 (30 + 40 + 11), como o Compose. A ação e o fechar ficam centrados na altura (linhas 388 a 400). Quem escolhe entre os dois desenhos é o `$lines` do texto da `mensagem`: com uma linha aparece o quadro `mensagem` (respiro de 14, texto centrado, altura 48) e com duas ou mais, o quadro `mensagem em várias linhas`, e o `minHeight` da fileira passa de 48 para 68 (o tipo tem `sizing` com altura `hug`, então o Arrumar e o `fit_marking` levam a marcação a 48, 68 ou 81).
- Ação em nova linha (`actionOnNewLine` com ação preenchida; sem ação o Compose cai na linha única, e o desenho também): a primeira linha de base da mensagem a 30 do topo e a última a 12 do fim da caixa (`paddingFromBaseline(30, 12)`, linha 269; `baselinePadding` 30 e 12), as ações numa fileira de 48 à direita e 2 de margem embaixo (linha 266): 30 + 12 + 48 + 2 = 92 para uma linha de texto, e 20 a mais por linha.
- Largura máxima de 600 (`ContainerMaxWidth`, o `maxWidth` da raiz).
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo da ação` (a `mensagem` fica como está) usa `font.verticalAlign: "cap-middle"` e ocupa a altura da caixa (`height: "fill"`), sem mudar a posição horizontal. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- O número de linhas vem do medidor de quem desenha (a app, o PNG do MCP, o medidor aproximado dos testes): a quebra pode diferir do Roboto do Android, e com ela a escolha entre 48, 68 e 81. Os 11 do fim são o piso: com uma fonte cuja linha de base fica a mais de 5 do fim da linha, a distância é a da fonte, como no Compose.
- Com a ação em nova linha a altura é a do código (92 com uma linha de texto); os 68 são o `TwoLinesContainerHeight` da linha única de duas linhas, e a descrição do campo diz isso desde a versão 4 da biblioteca.
- O limite de 600 vale só quando o componente é medido sem retângulo (`hug`), e o `sizing` deste componente é `fill` na largura; com a marcação desenhada a largura é a dela.
- As duas sombras (ponto e ambiente) vêm dos tokens `elevation-3-point-*` e `elevation-3-ambient-*` (`$token` em `shadow`, lista de duas sombras com `spread`); a tonal da elevação não é desenhada. Valores da elevação do Material 3 para a web: `elevation/internal/_elevation.scss` do `material-components/material-web` (versão 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), fonte de fora do Compose, que no Android entrega a elevação à plataforma e não traz os números: sombra de ponto em preto a 30% e sombra ambiente em preto a 15%, com `y`, `blur` e `spread` por nível (tokens `elevation-3-point-*` e `elevation-3-ambient-*`).
- Fora do desenho: o `SnackbarHost` (posição na tela, os 12 de margem do `Snackbar(snackbarData)`, a fila, o tempo de exibição e a animação), o estado de pressionado, foco e passar o mouse, e o `contentDescription` do fechar.
