# Card

Cartão que agrupa conteúdo relacionado. Filled e elevated destacam pelo fundo e pela sombra; outlined, pelo contorno.

Tipo de anotação: `card` (camada Componentes).

## Campos

| Chave            | Rótulo        | Tipo   | Obrigatório | Opções                                             | Padrão   | Descrição                                                                                                                                                                                                                                                          |
| ---------------- | ------------- | ------ | ----------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`          | Título        | string | sim         |                                                    |          | Título do cartão.                                                                                                                                                                                                                                                  |
| `subtitle`       | Subtítulo     | string | não         |                                                    |          | Linha de apoio abaixo do título.                                                                                                                                                                                                                                   |
| `supportingText` | Texto         | string | não         |                                                    |          | Parágrafo de apoio do cartão.                                                                                                                                                                                                                                      |
| `media`          | Imagem (URL)  | string | não         |                                                    |          | Endereço https:// da imagem no topo do cartão. Vazio = sem imagem.                                                                                                                                                                                                 |
| `style`          | Estilo        | enum   | não         | `filled`, `elevated`, `outlined`                   | `filled` | filled (Card), elevated ou outlined.                                                                                                                                                                                                                               |
| `interaction`    | Interação     | enum   | não         | `none`, `hovered`, `focused`, `pressed`, `dragged` | `none`   | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused), pressionado (pressed) ou arrastado (dragged); none = sem camada de estado. Só muda o desenho, não entra no código. Este tipo não tem enabled, então não há desabilitado que vença. |
| `width`          | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                            | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                                                              |
| `height`         | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                            | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                                                                |
| `weight`         | Peso (weight) | number | não         |                                                    |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                                                  |

## Compose

- Símbolo: `androidx.compose.material3.Card`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Card.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo        |
| --------------- | -------------- |
| `filled` (base) | `Card`         |
| `elevated`      | `ElevatedCard` |
| `outlined`      | `OutlinedCard` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Card(    // style elevated: ElevatedCard, outlined: OutlinedCard
    modifier = Modifier.fillMaxWidth(),
) {
    Column {
        AsyncImage(    // media remota: carregador do app
            model = "https://example.com/praia.jpg",
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth(),
        )
        Text("Praia do Rosa")                  // title
        Text("12 a 18 de outubro")             // subtitle
        Text("Fim de semana de sol.")          // supportingText
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> O conteúdo vai em `content` (uma Column): `media` no topo, depois `title`, `subtitle` e `supportingText` em `Text`. A `media` remota usa o carregador de imagens do app (por exemplo Coil `AsyncImage(model = <media>, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth())`), fora do androidx. Cartão clicável usa a sobrecarga com `onClick`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Cartão simples**: title=Resumo da semana, subtitle=12 a 18 de outubro, supportingText=Você concluiu 8 de 10 tarefas., style=filled, width=fill
- **Com imagem**: title=Praia do Rosa, supportingText=Fim de semana de sol., media=https://example.com/praia.jpg, style=elevated, width=fill
- **Contornado**: title=Plano gratuito, style=outlined, width=fill
- **Mouse sobre**: title=Resumo da semana, subtitle=12 a 18 de outubro, style=elevated, width=fill, interaction=hovered
- **Com foco**: title=Plano gratuito, style=outlined, width=fill, interaction=focused
- **Pressionado**: title=Resumo da semana, subtitle=12 a 18 de outubro, style=filled, width=fill, interaction=pressed
- **Arrastado**: title=Praia do Rosa, supportingText=Fim de semana de sol., style=elevated, width=fill, interaction=dragged

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Cores, raio e tipografia vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledCardTokens.kt` (linhas 24 a 26: `ContainerColor = SurfaceContainerHighest`, `ContainerElevation = Level0`, `ContainerShape = CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevatedCardTokens.kt` (linhas 24 a 26: `SurfaceContainerLow`, `ContainerElevation = Level1`, `CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedCardTokens.kt` (linhas 24 a 26: `Surface`, `Level0`, `CornerMedium`; linhas 38 e 39: `OutlineColor = OutlineVariant`, `OutlineWidth = 1.0.dp`; as elevações e os contornos por estado do campo `interaction`, linhas 30 a 41).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Card.kt` (linhas 80 a 98: `Card` é um `Surface` com `shape`, `color`, `contentColor`, `shadowElevation` e `border` sobre uma `Column`; linhas 370 a 379: `CardDefaults.shape`, `elevatedShape`, `outlinedShape`; linhas 486 a 517, 531 a 565 e 580 a 610: `contentColor = contentColorFor(containerColor)`; linhas 614 a 624: `outlinedCardBorder`).

**Como o desenho segue o Compose**

- O raio é `corner-medium` (12) nos três estilos.
- `filled` usa `surface-container-highest`, sem sombra e sem contorno; `elevated` usa `surface-container-low` com as duas sombras do nível 1 (ponto: `y` 1, `blur` 2; ambiente: `y` 1, `blur` 3, `spread` 1; tokens `elevation-1-point-*` e `elevation-1-ambient-*`); `outlined` usa `surface` com contorno de 1 em `outline-variant`, por dentro. Os valores mudam com o modo (claro e escuro).
- A cor do conteúdo é a `contentColorFor` do fundo, `on-surface`: o título a usa. O subtítulo e o texto de apoio usam `on-surface-variant`, como o `bodyMedium` de um cartão do Material.
- O título é `title-medium` (16/24, peso 500) e o subtítulo e o apoio são `body-medium` (14/20, peso 400), com o espaçamento entre letras dos tokens. Sem `family`: a fonte é a `font-sans` do tema.
- O `Surface` recorta o conteúdo na forma; a raiz do desenho também recorta, então a mídia do topo fica com os cantos arredondados do cartão.
- A mídia remota (`image` do formato) fica sobre `surface-container-highest` enquanto não carrega; é o carregador de imagens do app (`AsyncImage`) que a busca, fora do androidx.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `*CardTokens.kt` do commit definem para o cartão: `hovered`, `focused`, `pressed` e `dragged`. **Este tipo não tem `enabled`**, então não existe um desabilitado que vença: o estado sempre desenha.

- **Camada de estado:** o nó `estado` é um `rect` da forma do cartão (`corner-medium`), por cima do corpo (mídia e texto), como o indicador do Compose, com a cor do conteúdo do cartão, `on-surface` (`contentColorFor` do fundo; os `*CardTokens.kt` não nomeiam outra) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10), `state-pressed` (0,10) e `state-dragged` (0,16), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25). Para isso o corpo (a coluna de mídia e texto) passou a ser o nó `corpo`, filho da raiz, que agora empilha camadas (`layout: none`); o tamanho do cartão não muda.
- **Elevação por estado** (`FilledCardTokens.kt`, `ElevatedCardTokens.kt` e `OutlinedCardTokens.kt`, linhas `*ContainerElevation`): o filled e o outlined vão de 0 para o nível 1 com o mouse (`HoverContainerElevation`, linha 33 no filled e 34 no outlined), ficam em 0 no foco e pressionado (linhas 31 e 36 no filled, 32 e 40 no outlined) e vão ao nível 3 arrastados (`DraggedContainerElevation`, linha 30 nos dois); o elevated vai de 1 (linha 25) para o nível 2 com o mouse (linha 33), fica em 1 no foco e pressionado (linhas 31 e 36) e vai ao nível 4 arrastado (linha 30). Níveis em `ElevationTokens.kt` (`Level1` 1 dp, `Level2` 3 dp, `Level3` 6 dp e `Level4` 8 dp). O `y` e o `blur` da sombra aceitam `$token`, mas não expressão (o nível não troca com o estado no mesmo nó): o nível 1 é a sombra da raiz (y 1, blur 2) e os outros são nós à parte, `sombra nível 2` (y 2, blur 6), `sombra nível 3` (y 3, blur 12) e `sombra nível 4` (y 4, blur 16, os valores de `elevation-2-*`, `elevation-3-*` e `elevation-4-*`), cada um com o fundo (e o contorno, no outlined) do cartão, visíveis só no estado que pede o nível.
- **Cor do contorno** (outlined, `OutlinedCardTokens.kt`): `OutlineColor` (`outline-variant`, linha 38) parado, com o mouse (`HoverOutlineColor`, linha 35), pressionado (linha 41) e arrastado (`DraggedOutlineColor`, linha 31); no foco, `on-surface` (`FocusOutlineColor`, linha 33). O filled e o elevated não têm contorno.

**O que ainda difere do Compose**

- As sombras leem os tokens de elevação (`$token` em `shadow`): `elevation-1-point-*` e `elevation-1-ambient-*` na raiz e `elevation-N-point-*` e `elevation-N-ambient-*` nos nós `sombra nível N`; trocar o token na especialização chega ao desenho.
- As duas sombras (ponto e ambiente) vêm dos tokens `elevation-1-point-*` e `elevation-1-ambient-*` (`$token` em `shadow`, lista de duas sombras com `spread`); a tonal da elevação não é desenhada. Valores da elevação do Material 3 para a web: `elevation/internal/_elevation.scss` do `material-components/material-web` (versão 2.5.0, commit `37aa14b843dcaeb3a46f898679fa6fcd109b1905`), fonte de fora do Compose, que no Android entrega a elevação à plataforma e não traz os números: sombra de ponto em preto a 30% e sombra ambiente em preto a 15%, com `y`, `blur` e `spread` por nível (tokens `elevation-1-point-*` e `elevation-1-ambient-*`).
- O espaçamento de 16 entre as bordas e o texto e o vão de 4 entre as linhas são do desenho: o `Card` do Compose não tem padding, quem escreve a `Column` decide. A mídia tem altura fixa de 140.
- Sem desabilitado (o tipo não tem `enabled`) nem `onClick`. Os estados de interação são quadros parados: sem ripple animado e sem transição, e o anel de foco só vale no filled e no elevated (`FilledCardTokens.kt` e `ElevatedCardTokens.kt`, linha 32: `FocusIndicatorColor`; o `OutlinedCardTokens.kt` não o define): com `focused` desenha o anel de 3 em `secondary`, afastado 2 da forma (`stroke.offset`), por fora da caixa (a largura e o afastamento são os da decisão da etapa; o `*Tokens.kt` só traz a cor).
- O `Card.kt` não lê todos os tokens de estado do cartão: o `outlinedCardElevation` (linhas 452 a 458) usa a elevação padrão (0) no mouse, no foco e pressionado, e o `outlinedCardBorder` (linhas 614 a 623) só distingue habilitado e desabilitado, sem a cor do foco. O desenho segue os `OutlinedCardTokens.kt`, como a etapa pede, então o outlined sobe ao nível 1 com o mouse e ganha o contorno `on-surface` no foco.
