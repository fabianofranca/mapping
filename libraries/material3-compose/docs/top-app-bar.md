# Top app bar

Barra do topo da tela com título, ícone de navegação e ações. Small é a padrão; Center centraliza o título; Medium e Large têm título grande que colapsa ao rolar.

Tipo de anotação: `top-app-bar` (camada Componentes).

## Campos

| Chave            | Rótulo             | Tipo   | Obrigatório | Opções                                                         | Padrão  | Descrição                                                                            |
| ---------------- | ------------------ | ------ | ----------- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `title`          | Título             | string | sim         |                                                                |         | Título da tela.                                                                      |
| `style`          | Estilo             | enum   | não         | `small`, `center`, `medium`, `large`                           | `small` | small, center (título centralizado), medium ou large (título grande em duas linhas). |
| `navigationIcon` | Ícone de navegação | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone à esquerda (Menu ou ArrowBack, por exemplo). Vazio = sem ícone.                |
| `actionIcon1`    | Ação 1             | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Primeiro ícone de ação à direita. Vazio = sem ação.                                  |
| `actionIcon2`    | Ação 2             | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Segundo ícone de ação à direita. Vazio = sem ação.                                   |

## Compose

- Símbolo: `androidx.compose.material3.TopAppBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo                  |
| -------------- | ------------------------ |
| `small` (base) | `TopAppBar`              |
| `center`       | `CenterAlignedTopAppBar` |
| `medium`       | `MediumTopAppBar`        |
| `large`        | `LargeTopAppBar`         |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)   // só se usar scrollBehavior
@Composable
fun Barra() {
    TopAppBar(    // style center: CenterAlignedTopAppBar, medium: MediumTopAppBar, large: LargeTopAppBar
        title = { Text("Início") },
        navigationIcon = {
            IconButton(onClick = { /* lógica da tela */ }) {
                Icon(Icons.Filled.Menu, contentDescription = "Menu")
            }
        },
        actions = {
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.Search, contentDescription = "Buscar") }
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.MoreVert, contentDescription = "Mais") }
        },
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `title = { Text(<title>) }`; com `navigationIcon` preenchido, `navigationIcon = { IconButton(onClick = …) { Icon(Icons.Filled.<navigationIcon>, contentDescription = …) } }`, e cada `actionIcon1`/`actionIcon2` preenchido vira um `IconButton` dentro de `actions = { … }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`. Nenhuma das quatro variantes exige opt-in; só o `scrollBehavior` (`TopAppBarDefaults.pinnedScrollBehavior()` e parentes) exige `@OptIn(ExperimentalMaterial3Api::class)`.

## Exemplos

- **Padrão**: title=Início, style=small, navigationIcon=Menu, actionIcon1=Search, actionIcon2=MoreVert
- **Centralizada**: title=Perfil, style=center, navigationIcon=ArrowBack
- **Grande**: title=Configurações, style=large, navigationIcon=ArrowBack

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, nenhum nó de texto declara `family` (todos herdam `font-sans`) e os ícones são o nó `icon` do conjunto da biblioteca, escolhido pelo `$switch` do campo (nenhum caminho SVG no componente).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt` (linhas 160 a 440: `TopAppBar` e `CenterAlignedTopAppBar`, `titleHorizontalAlignment` `Start` ou `CenterHorizontally`; 508 a 560 e 753 a 800: `MediumTopAppBar` e `LargeTopAppBar`, com `titleBottomPadding` e as fontes dos tokens; 1509 a 1520: `defaultTopAppBarColors`; 1812 a 1832: as alturas 64, 112 e 152; 2509 a 2600: a barra de uma linha; 2731 a 2840: as duas linhas, com o título pequeno em alfa 0 quando expandida; 2976 a 3254: `TopAppBarLayout` e `TopAppBarMeasurePolicy`, o `Box` de cada lado com `TopAppBarHorizontalPadding`, o título entre a navegação e as ações, o `start = max(TopAppBarTitleInset, navigationIcon.width)`, o centro em relação à barra inteira e a base do título nas duas linhas; 3510 a 3516: `MediumTitleBottomPadding` 24, `LargeTitleBottomPadding` 28, `TopAppBarHorizontalPadding` 4 e `TopAppBarTitleInset` 12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/AppBarSmallTokens.kt` (`ContainerHeight` 64, `TitleFont` `TitleLarge`), `AppBarMediumTokens.kt` (112, `HeadlineSmall`), `AppBarLargeTokens.kt` (152, `HeadlineMedium`) e `AppBarTokens.kt` (`ContainerColor` `Surface`, `LeadingIconColor` e `TitleColor` `OnSurface`, `TrailingIconColor` `OnSurfaceVariant`, `IconSize` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypographyTokens.kt` (linhas 269 e 270: `LineHeightStyle` com `Alignment.Center` e `Trim.None` em toda a tipografia).
- `compose/material3/material3/samples/src/main/java/androidx/compose/material3/samples/AppBarSamples.kt` (linhas 82, 251, 407 e 475: o título dos exemplos oficiais de cada estilo leva `maxLines = 1` e `overflow = TextOverflow.Ellipsis`).

**Como o desenho segue o Compose**

- Barra de 64 (`AppBarSmallTokens.ContainerHeight`) em `surface`. Medium e large têm a mesma linha de cima de 64 (navegação e ações); o título grande fica na linha de baixo, que o `Column` do `TwoRowsTopAppBar` põe sob ela. A altura total é a do retângulo da marcação: 64, 112 ou 152. O `sizing.height` é a expressão pelo `style` (`$switch`: small e center 64, medium 112, large 152, e 64 sem `style`, o padrão small), então a barra nova, o **Arrumar** e o `fit_marking` levam a marcação à altura do estilo; o `size` (412 × 152, o da large) só vale como tamanho de partida da instância com retângulo.
- Navegação: `IconButton` de 48 com o ícone de 24 em `on-surface`, a 4 da borda (o `padding(start = TopAppBarHorizontalPadding)` do `Box`). Ações: áreas de 48 coladas à direita, com 4 de margem (o `padding(end = 4)` do `Box`), ícones de 24 em `on-surface-variant`. A linha é uma `row` de padding 4 sem `gap`, como o `Row` das ações do Compose.
- Título pequeno: `title-large` (22/28, peso 400, espaçamento 0) em `on-surface`, centrado na altura da barra pela maiúscula (`cap-middle`, o nó ocupa os 64; a caixa de linha de 28 ficaria a `(64 - 28) / 2` = 18). Começa a 56 com navegação (4 + 48 + 4 do `Box` do título) e a 16 sem ela (`TopAppBarTitleInset` 12 + 4), e termina a 8 do que vem antes das ações (4 do `Box` do título e 4 da margem das ações). Uma linha só, com `…` no fim (`font.wrap: "none"`, `ellipsis`, `maxLines: 1`), como o `Text(maxLines = 1, overflow = Ellipsis)` dos exemplos oficiais.
- Centralizada: o mesmo título, com `font.align: "center"`, centrado na largura da barra inteira e não só no vão entre a navegação e as ações, como o `titleHorizontalAlignment = CenterHorizontally`: as margens dos dois lados são iguais e valem o maior entre o início (52 com navegação, 12 sem) e o fim (4 mais 48 por ação) mais os 4 do `Box` do título. O espaço fica reservado por uma expressão no `padding` do quadro do título.
- Medium e large: título em `headline-small` (24/32) e `headline-medium` (28/36), a 16 da borda, com `…` no fim como o pequeno. O Compose põe a última linha de base do título a `titleBottomPadding` do fundo da barra, `MediumTitleBottomPadding` 24 e `LargeTitleBottomPadding` 28 (`AppBar.kt` linhas 3510 e 3511, passados nas linhas 524 e 768 e usados nas linhas 3213 a 3231: `titleY = layoutHeight - titlePlaceable.height - (titleBottomPadding - (altura - linha de base))`). O nó `título grande` leva `baselinePadding.bottom` 24 (medium) e 28 (large) e a âncora de fundo 0, então a linha de base fica a esses valores do fundo em qualquer fonte, e não só no Roboto (a conta anterior, uma caixa de texto a 16 e a 20 do fundo, valia para a descida do Roboto 14/20).
- O título pequeno e o centralizado ocupam a altura da barra (`height: "fill"`) e centram pela altura da maiúscula (`font.verticalAlign: "cap-middle"`); o título grande (medium e large) segue como está. O `Text` do Compose centra pela caixa de linha da fonte; com Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- O `size` é 412 × 152, a `ContainerHeight` da large (`AppBarLargeTokens.kt` linha 25; a medium é 112, linha 25 de `AppBarMediumTokens.kt`, e a small, 64, linha 25 de `AppBarSmallTokens.kt`), o tamanho de partida; a altura que a ação de ajustar dá vem do `sizing` pelo `style`. O efeito da #863 (a barra small e a centralizada com 64 no topo e a sobra de 88 embaixo, só com o fundo `surface`) sobra apenas numa marcação que já existe com 152 e cujo `style` muda: o ajuste (Arrumar, `fit_marking`) leva a altura ao estilo, mas editar o `style` não mexe no retângulo.
- Sem o recuo e o colapso ao rolar (`scrollBehavior`), a cor `surface-container` de quando o conteúdo passa por baixo e o título pequeno que aparece ao colapsar: o desenho é a barra expandida.
- O título tem `maxLines = 1` e `…` como nos exemplos oficiais; o `code` do tipo (`Text(<title>)`) não os passa, e sem eles o `Text` do Compose quebra em várias linhas.
- Um título tão comprido que ocupa todo o vão ganha no Compose um deslocamento de 8 para a esquerda (o `Box` do título, com 12 de início, passa de `largura - fim` e é empurrado); o desenho trunca o texto na margem calculada. Na centralizada, um título maior que o vão simétrico mas que cabe no vão assimétrico é empurrado para um lado no Compose; aqui ele é truncado com `…`.
- Os ícones são só os do conjunto da biblioteca (`icons`); o `IconButton` de 48 do Compose tem o ícone do `Icons.Filled` de mesmo nome, sem os de espelhamento (`AutoMirrored`), e sem estados de pressionado, foco e passar o mouse.
- Sem `windowInsets` (a barra de status), que não é campo do tipo; `expandedHeight`, `collapsedHeight` e `scrolledContainerColor` são campos e código, mas o desenho não os usa. O `subtitle` só é desenhado no estilo `small`.
