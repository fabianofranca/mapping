# Carousel

Carrossel horizontal de itens com imagem e rótulo. Multi-browse mostra um item grande com vizinhos menores, uncontained mantém itens de largura fixa e centered-hero centra um item grande.

Tipo de anotação: `carousel` (camada Componentes).

## Campos

| Chave                | Rótulo                         | Tipo   | Obrigatório | Opções                                         | Padrão         | Descrição                                                                                                                                           |
| -------------------- | ------------------------------ | ------ | ----------- | ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`              | Itens                          | table  | sim         | ver Colunas abaixo                             |                | Um item do carrossel por linha, na ordem em que aparecem.                                                                                           |
| `style`              | Estilo                         | enum   | não         | `multi-browse`, `uncontained`, `centered-hero` | `multi-browse` | multi-browse (HorizontalMultiBrowseCarousel), uncontained (HorizontalUncontainedCarousel) ou centered-hero (HorizontalCenteredHeroCarousel).        |
| `preferredItemWidth` | Largura preferida do item (dp) | number | não         |                                                |                | Só no multi-browse (obrigatório no Compose): a largura que os itens grandes querem ter; o carrossel a ajusta para caber um número inteiro de itens. |
| `itemWidth`          | Largura do item (dp)           | number | não         |                                                |                | Só no uncontained (obrigatório no Compose): a largura fixa de cada item.                                                                            |
| `itemSpacing`        | Espaço entre itens (dp)        | number | não         |                                                |                | Espaço entre os itens em dp (itemSpacing). Vazio = 0 no código; o desenho usa 8.                                                                    |
| `width`              | Largura                        | enum   | não         | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                               |
| `height`             | Altura                         | enum   | não         | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                 |
| `weight`             | Peso (weight)                  | number | não         |                                                |                | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                   |

Colunas de `items` (uma linha por item):

| Chave   | Rótulo       | Tipo   | Obrigatório | Opções | Padrão |
| ------- | ------------ | ------ | ----------- | ------ | ------ |
| `image` | Imagem (URL) | string | sim         |        |        |
| `label` | Rótulo       | string | não         |        |        |

## Compose

- Símbolo: `androidx.compose.material3.carousel.HorizontalMultiBrowseCarousel`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Carousel.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`               | Símbolo                          |
| --------------------- | -------------------------------- |
| `multi-browse` (base) | `HorizontalMultiBrowseCarousel`  |
| `uncontained`         | `HorizontalUncontainedCarousel`  |
| `centered-hero`       | `HorizontalCenteredHeroCarousel` |

Os três exigem `@OptIn(ExperimentalMaterial3Api::class)` no commit fixado (o `CarouselState` e o `CarouselItemScope` também são experimentais).

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Destinos(items: List<Destino>) {
    HorizontalMultiBrowseCarousel(    // style uncontained: HorizontalUncontainedCarousel(itemWidth = …), centered-hero: HorizontalCenteredHeroCarousel
        state = rememberCarouselState { items.size },    // uma entrada por linha de items
        preferredItemWidth = 186.dp,                     // preferredItemWidth
        itemSpacing = 8.dp,                              // itemSpacing
        modifier = Modifier.fillMaxWidth().height(205.dp),
    ) { index ->
        val item = items[index]
        Box {
            AsyncImage(    // imagem remota: carregador do app (Coil), fora do androidx
                model = item.image,                      // coluna image
                contentDescription = item.label,
                contentScale = ContentScale.Crop,
                modifier = Modifier.height(205.dp).maskClip(MaterialTheme.shapes.extraLarge),
            )
            Text(item.label)                             // coluna label, só se preenchida
        }
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class) (os três carrosséis, o `CarouselState` e o `CarouselItemScope` são experimentais no commit fixado). `state = rememberCarouselState { <número de linhas de items> }` (o `itemCount` é a lambda final) e `content = { index -> … }` desenha o item `items[index]`, dentro do `CarouselItemScope`: imagem remota com o carregador do app (por exemplo Coil `AsyncImage(model = <image>, contentDescription = <label>, contentScale = ContentScale.Crop, modifier = Modifier.height(205.dp).maskClip(MaterialTheme.shapes.extraLarge))`, fora do androidx); `maskClip` é do escopo do item e dá o recorte que acompanha a rolagem; um `label` preenchido vira um `Text(<label>)` sobre a imagem, num `Box`. A largura do item é um parâmetro obrigatório conforme o estilo: `preferredItemWidth = <preferredItemWidth>.dp` no multi-browse e `itemWidth = <itemWidth>.dp` no uncontained; o centered-hero não leva largura (o `maxItemWidth` opcional não é mapeado). `itemSpacing` vira `<itemSpacing>.dp`. A altura vem do item (`Modifier.height(…)`), não do carrossel. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Desenho

O componente desenha os itens com largura uniforme (a `preferredItemWidth` no multi-browse, o `itemWidth` no uncontained e 232 no centered-hero, com o primeiro item recuado 64 para centrar o hero), cantos de 28 e o rótulo sobre um véu de scrim; o excesso é cortado pela caixa da marcação. No Compose a largura varia com a rolagem (grande, média e pequena). A seção Fidelidade diz o que cada valor segue.

## Exemplos

- **Multi-browse**: style=multi-browse, preferredItemWidth=186, itemSpacing=8, width=fill, height=fixed
- **Uncontained**: style=uncontained, itemWidth=140, itemSpacing=12, width=fill, height=fixed
- **Hero centrado**: style=centered-hero, itemSpacing=8, width=fill, height=fixed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade de cor fica literal no componente e nenhum nó de texto declara `family` (todos herdam `font-sans`). O raio dos itens é a forma `corner-extra-large`, o `MaterialTheme.shapes.extraLarge` que o exemplo do `code` passa a `maskClip`. O `Carousel.kt` não define cor, forma nem tipografia: o item (imagem e rótulo) é do app, e o desenho usa os tokens do Material para ilustrá-lo.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Carousel.kt` (linhas 109 a 150: `HorizontalMultiBrowseCarousel`, `preferredItemWidth` e `itemSpacing`; 209 a 245: `HorizontalUncontainedCarousel`, `itemWidth` como tamanho exato do item; 293 a 335: `HorizontalCenteredHeroCarousel`, com dois itens pequenos e um grande; 363 a 475: `Carousel`, o pager com `pageSpacing = itemSpacing`; 568 a 700: `carouselItem`, o item que recebe `mainAxisSize` da estratégia e o recorte (`clipShape`) do `maskClip`; 857 a 862: `MinSmallItemSize` 40, `MaxSmallItemSize` 56 e `AnchorSize` 10).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Keylines.kt` (linhas 161 a 200: `uncontainedKeylineList`, itens do tamanho pedido alinhados ao início; 215 a 289: `heroKeylineList`, `targetSmallSize` = 1/3 do grande preso entre 40 e 56 e o item grande com o que sobra do espaço; 291 a 322: `createLeftAlignedKeylineList` (itens a partir da borda) e `createCenterAlignedKeylineList` (pequeno, grande, pequeno)) e `carousel/CarouselItemScope.kt` (linhas 51 a 95: `maskClip` com a forma passada).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt` (linha 29: `CornerExtraLarge` 28), `tokens/ScrimTokens.kt` (linhas 22 e 23: `Scrim` e `ContainerOpacity` 0,32) e `tokens/TypeScaleTokens.kt` (`LabelLarge` 14/20/500/0,1).

**Como o desenho segue o Compose**

- Itens com `corner-extra-large` (28) recortados (`clip`), com o reservado da imagem em `surface-container-highest` (a cor de fundo enquanto a imagem não carrega ou quando a URL é vazia).
- Uncontained: itens do tamanho do `itemWidth` (padrão 140), a partir da borda, com `itemSpacing` entre eles (`uncontainedKeylineList`). Multi-browse: o item grande tem a `preferredItemWidth` (padrão 186); no Compose o carrossel a ajusta para caber um número inteiro de itens, e o desenho usa o valor pedido. A largura e o espaço agora saem dos campos (antes o desenho não os lia).
- Centered-hero: o item grande ocupa o que sobra entre dois itens pequenos de 56 (`targetSmallSize` do terço de 360, preso a `MaxSmallItemSize`) e dois espaços de 8: 360 - 2 x 56 - 2 x 8 = 232. O primeiro item começa depois do espaço do pequeno que falta (56 + 8 = 64), que é onde o `createCenterAlignedKeylineList` o põe.
- Rótulo opcional sobre o item, em `label-large` numa linha com `…` (`maxLines` 1 e `ellipsis`), a 16 das bordas e 14 do fundo, em `secondary-fixed` (cor igual nos dois modos, porque o rótulo fica sobre uma imagem); sob ele um véu de 48: degradê de cima para baixo, de `scrim` com `alpha` 0 a `scrim` com `alpha` 0,32 (`ScrimTokens.ContainerOpacity`).

**O que ainda difere do Compose**

- Os itens têm largura uniforme: a repetição não conhece o índice da linha, então não há o item grande, o médio e o pequeno que o Compose mostra na mesma tela (multi-browse: 40 a 56 nos pequenos e um médio) nem a variação do tamanho com a rolagem.
- Centered-hero: o 232 e o recuo de 64 valem para uma marcação de 360 de largura e `itemSpacing` 8, porque o formato não faz conta com a largura da caixa nem com o espaço (`anchors` não aceita expressão e a largura de um nó em porcentagem não subtrai os itens pequenos). Com menos de 3 itens o Compose alinha ao início (`shouldCenter`), e o desenho sempre recua.
- `preferredItemWidth` do multi-browse: o Compose o trata como alvo e escolhe o tamanho dos grandes pelo `Arrangement` (`findLowestCostArrangement`); o desenho usa o valor como está.
- O véu é um degradê de transparente (`scrim` com `alpha` 0) a escuro (`scrim` com `alpha` 0,32). A cor do rótulo, o véu e o limite de uma linha são do app no Compose (`Text` sobre a imagem); o desenho os escolhe para ilustrar.
- Sem `contentPadding`, `maxItemWidth` e `minSmallItemWidth`/`maxSmallItemWidth` (usa os 40 e 56 do padrão), sem rolagem nem fling, e sem a imagem remota: o desenho mostra o reservado até o carregador do app (Coil) entregar a imagem, como o nó `image`.
