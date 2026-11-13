# Carousel

Carrossel horizontal de itens com imagem e rótulo. Multi-browse mostra um item grande com vizinhos menores, uncontained mantém itens de largura fixa e centered-hero centra um item grande.

Tipo de anotação: `carousel` (camada Componentes).

## Campos

| Chave                | Rótulo                         | Tipo   | Obrigatório | Opções                                         | Padrão         | Descrição                                                                                                                                                                                                             |
| -------------------- | ------------------------------ | ------ | ----------- | ---------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`              | Itens                          | table  | sim         | ver Colunas abaixo                             |                | Um item do carrossel por linha, na ordem em que aparecem.                                                                                                                                                             |
| `style`              | Estilo                         | enum   | não         | `multi-browse`, `uncontained`, `centered-hero` | `multi-browse` | multi-browse (HorizontalMultiBrowseCarousel), uncontained (HorizontalUncontainedCarousel) ou centered-hero (HorizontalCenteredHeroCarousel).                                                                          |
| `preferredItemWidth` | Largura preferida do item (dp) | number | não         |                                                |                | Só no multi-browse (obrigatório no Compose): a largura que os itens grandes querem ter; o carrossel escolhe quantos grandes cabem e ajusta o tamanho deles, do médio e do pequeno (de 40 a 56) à largura da marcação. |
| `itemWidth`          | Largura do item (dp)           | number | não         |                                                |                | Só no uncontained (obrigatório no Compose): a largura fixa de cada item.                                                                                                                                              |
| `itemSpacing`        | Espaço entre itens (dp)        | number | não         |                                                |                | Espaço entre os itens em dp (itemSpacing). Vazio = 0 no código; o desenho usa 8. No centered-hero o recuo e a largura dos itens dependem dele.                                                                        |
| `width`              | Largura                        | enum   | não         | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                 |
| `height`             | Altura                         | enum   | não         | `wrap`, `fill`, `fixed`                        | `wrap`         | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                   |
| `weight`             | Peso (weight)                  | number | não         |                                                |                | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                     |

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

O componente desenha o carrossel como o Compose o mostra no início da rolagem, pela largura da marcação (`$size`), pelo índice e pelo número de itens da tabela (`$rows`), com cantos de 28 e o rótulo sobre um véu de scrim; o excesso é cortado pela caixa. Cada estilo segue a sua estratégia de keylines:

- **multi-browse**: itens grandes, um médio e um pequeno, a partir da borda (`Keylines.kt`, `multiBrowseKeylineList`). Os grandes têm a `preferredItemWidth` quando o arranjo cabe e se ajustam quando não cabe; o pequeno fica entre 40 e 56 e o médio entre 90% e 110% da média de grande e pequeno. Em 360 de largura, com 186 preferidos e espaço 8: grande 186, médio 118 e pequeno 40. Os itens que passam da borda não são desenhados.
- **uncontained**: itens do tamanho do `itemWidth`, a partir da borda, com o `itemSpacing` entre eles. O desenho não deixa nada passar da caixa: o item que cruza a borda direita ganha só a largura que sobra (em 360, o terceiro de 140 mede 56) e o que sobraria com menos de 32 não é desenhado.
- **centered-hero**: um item grande que ocupa o que sobra entre dois itens pequenos (`largura − 2 × pequeno − 2 × itemSpacing`), com o pequeno de 40, o mínimo do Compose (264 em 360 com espaço 8), e o primeiro item depois do espaço do pequeno que falta (`pequeno + itemSpacing`, 48). Os itens têm a largura do grande e o seguinte aparece só na parte que cabe na caixa (40 em 360); os que ficariam além da caixa, ou com menos de 32 de largura visível, não são desenhados. Com menos de 3 itens o Compose alinha ao início, sem recuo, com um só pequeno (`largura − itemSpacing − 40`).

Tudo muda com a largura da marcação: a mesma anotação mostra mais itens grandes numa marcação larga e um só numa estreita. A seção Fidelidade diz o que cada valor segue e o que o desenho aproxima.

## Exemplos

- **Multi-browse**: style=multi-browse, preferredItemWidth=186, itemSpacing=8, width=fill, height=fixed
- **Uncontained**: style=uncontained, itemWidth=140, itemSpacing=12, width=fill, height=fixed
- **Hero centrado**: style=centered-hero, itemSpacing=8, width=fill, height=fixed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte, raio ou opacidade de cor fica literal no componente e nenhum nó de texto declara `family` (todos herdam `font-sans`). O raio dos itens é a forma `corner-extra-large`, o `MaterialTheme.shapes.extraLarge` que o exemplo do `code` passa a `maskClip`. O `Carousel.kt` não define cor, forma nem tipografia: o item (imagem e rótulo) é do app, e o desenho usa os tokens do Material para ilustrá-lo.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Carousel.kt` (linhas 109 a 150: `HorizontalMultiBrowseCarousel`, `preferredItemWidth`, `itemSpacing` e o `itemCount` que chega à estratégia; 209 a 245: `HorizontalUncontainedCarousel`, `itemWidth`; 293 a 335: `HorizontalCenteredHeroCarousel`, com `maxItemWidth` não especificado; 363 a 475: `Carousel`, o pager com `pageSpacing = itemSpacing`; 518 a 535: `calculateMainAxisPageSize`, que monta a `Strategy` com a largura disponível; 568 a 700: `carouselItem`, o item que recebe `mainAxisSize` da estratégia e o recorte (`clipShape`) do `maskClip`; 857 a 863: `MinSmallItemSize` 40, `MaxSmallItemSize` 56, `AnchorSize` 10 e `MediumLargeItemDiffThreshold` 0,85).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Keylines.kt` (linhas 46 a 143: `multiBrowseKeylineList`, com o alvo de grande e de pequeno, as contagens candidatas e a retirada do pequeno quando há menos itens que posições; 161 a 200: `uncontainedKeylineList`; 215 a 289: `heroKeylineList`, `shouldCenter` e o arranjo; 291 a 322: `createLeftAlignedKeylineList` e `createCenterAlignedKeylineList`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/carousel/Arrangement.kt` (linhas 98 a 145: `findLowestCostArrangement`, a ordem de prioridade e o custo; 172 a 253: `fit`, o pequeno ajustado entre o mínimo e o máximo, os grandes com o que sobra e o médio com folga de 10% (`MediumItemFlexPercentage`, linha 71); 265 a 276: `calculateLargeSize`).
- `carousel/Strategy.kt` (linhas 144 a 219: `getKeylineListForScrollOffset`; 318 a 412: `getStartKeylineSteps`, que encosta o item grande ao início quando a rolagem está no começo) e `carousel/CarouselItemScope.kt` (linhas 51 a 95: `maskClip` com a forma passada).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ShapeTokens.kt` (linha 29: `CornerExtraLarge` 28), `tokens/ScrimTokens.kt` (linha 22: `Scrim`) e `tokens/TypeScaleTokens.kt` (`LabelLarge` 14/20/500/0,1).

**Como o desenho segue o Compose**

- Itens com `corner-extra-large` (28) recortados (`clip`), com o reservado da imagem em `surface-container-highest` (a cor de fundo enquanto a imagem não carrega ou quando a URL é vazia).
- Multi-browse (`Keylines.kt`, 46 a 143, e `Arrangement.kt`): o alvo de grande é `min(preferredItemWidth, largura)` (linha 62), o de pequeno é um terço dele preso entre 40 e 56 (linha 67) e o de médio a média dos dois. O Compose testa as contagens de grandes de `ceil(largura / alvo)` até `floor((largura − médio − 56) / alvo)`, com e sem médio, e fica com o arranjo de menor custo, que é `|alvo − grande| × prioridade` (`Arrangement.kt`, linhas 56 a 63 e 98 a 145). Dentro de cada arranjo (`fit`, 172 a 253) o pequeno encolhe ou cresce entre 40 e 56, o grande fica com o que sobra e o médio flexiona até 10% para devolver o grande ao alvo. O desenho faz as mesmas contas: o número de grandes e a presença do médio vêm do resto de `largura / (alvo + itemSpacing)`, o pequeno é `clamp(resto − itemSpacing − médio de partida, 40, 56)`, o médio é a sobra presa a 90% e 110% de `(grande de partida + pequeno) / 2` e os grandes dividem o que restar (`fill`). Por isso o grande tem exatamente o alvo nas faixas de largura em que o Compose o mantém (em 360 com 186 preferidos o primeiro item tem **186**, os mesmos 186 de antes, com o médio de 118 e o pequeno de 40; em 430 a 440, dois grandes de 186) e muda de tamanho só entre elas. O espaço entre os itens vem de `itemSpacing` (padrão 8; vazio = 0 no código).
- Menos itens que posições do arranjo (`Keylines.kt`, 102 a 131): o Compose tira o pequeno e refaz o arranjo; o desenho refaz também (em 600 de largura com os 3 itens do exemplo ficam três itens de 167,31, e não os dois de 190 e o médio de 139 do arranjo completo). Os itens que o arranjo não tem posição para mostrar não são desenhados.
- `preferredItemWidth` maior que a marcação: o alvo é a própria largura (linha 62) e fica um item grande de `largura − itemSpacing − 40` com o pequeno de 40; com um item só, ele ocupa a largura toda.
- Uncontained: itens do tamanho do `itemWidth` (padrão 140), a partir da borda, com `itemSpacing` entre eles (`uncontainedKeylineList`, 161 a 200).
- Centered-hero (`Keylines.kt`, 215 a 289, e `Arrangement.kt`, 198 a 206): sem `maxItemWidth` o alvo do grande é a largura toda (linha 235) e o do pequeno é um terço dela preso entre `MinSmallItemSize` 40 e `MaxSmallItemSize` 56 (`targetSmallSize`, linha 237); como o grande não cabe no alvo, o `fit` encolhe os pequenos até o mínimo de 40, e o grande fica com `largura − 2 × 40 − 2 × itemSpacing` (264 em 360 com espaço 8; 248 com espaço 16; 480 − 80 − 16 = 384 em 480). O primeiro item começa depois do espaço do pequeno que falta (`40 + itemSpacing`, 48 em 360), que é onde o `createCenterAlignedKeylineList` o põe (291 a 322); os itens têm todos a largura do grande. Com menos de 3 itens (`shouldCenter`, linha 230) o arranjo tem um só pequeno e é alinhado ao início: o grande tem `largura − itemSpacing − 40` e não há recuo. Em marcação mais estreita que 130 (90 com menos de 3 itens: `fullscreenThreshold`, `40 × pequenos + 50`, linhas 241 a 244) cabe só o grande.
- Rótulo opcional sobre o item, em `label-large` numa linha com `…` (`maxLines` 1 e `ellipsis`), a 16 das bordas e 14 do fundo, em `secondary-fixed` (cor igual nos dois modos, porque o rótulo fica sobre uma imagem); sob ele um véu de 48: degradê de baixo para cima, de `scrim` com `alpha` 0,55 (sólido nos 36 px de baixo, onde fica a linha do rótulo) a `scrim` com `alpha` 0 no topo. O 0,55 é escolha da biblioteca, não do Compose: garante contraste de pelo menos 4,5:1 do rótulo sobre o reservado da imagem (a app, o Catálogo e o PNG do MCP nunca carregam a imagem remota). Nos itens pequenos o rótulo sai cortado pelo recorte do item, como o `maskClip` corta o conteúdo do app no Compose.
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo`, ancorado a 14 do fundo do item, usa `font.verticalAlign: "cap-middle"` e segue `hug` na altura, porque o pai também mede pelo texto; a caixa do texto é a linha, centrada no pai. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**O que ainda difere do Compose**

- **O limiar entre dois arranjos é aproximado.** O Compose escolhe o arranjo pelo custo de cada candidato; o formato não tem variável para guardar o custo de cada um e compará-los, então o desenho decide o número de grandes e a presença do médio por limiares lineares de `preferredItemWidth` e de `itemSpacing`, ajustados contra o algoritmo. Longe das trocas o desenho coincide com o Compose a menos de 0,5 px; dentro de alguns px (cerca de 3) da largura em que o Compose troca de arranjo (por exemplo, de um grande com o médio para dois grandes), o desenho pode já ter trocado ou ainda não. Numa grade de larguras de 200 a 900, `preferredItemWidth` de 150, 186 e 240, `itemSpacing` de 0, 8 e 16 e 1, 3 ou 12 itens, e sem contar a vizinhança das trocas, o desenho coincide com o Compose a menos de 0,5 px em cerca de 97% dos casos.
- **O arranjo apertado do primeiro período não é reproduzido.** Com a largura pouco acima do alvo (por exemplo 278 a 291 de largura com 186 preferidos) o Compose pode escolher `ceil(largura / alvo)` grandes encolhidos (dois itens de 80, um médio de 53 e um pequeno de 40, porque a prioridade 1 pesa mais que o custo de dois grandes bem maiores); o desenho mantém um só grande (com o pequeno ou com o médio e o pequeno). Faz parte dos 3% da grade acima em que o desenho difere.
- **A rolagem não existe.** O desenho é o estado do início da rolagem, sem o encolher e crescer dos itens (`carouselItem`, 568 a 700) nem o fling. No centered-hero o Compose, na rolagem 0, encosta o item grande ao início da caixa (`Strategy.kt`, 318 a 412) e só centra o grande a partir do primeiro passo; o desenho mostra o estado centrado, com o recuo (o que o `createCenterAlignedKeylineList` descreve), porque é o que dá nome ao estilo.
- Uncontained: o Compose mostra o item que passa da borda como uma máscara de 1,5 vez o que sobra (`calculateMediumChildSize`, `Keylines.kt` 335 a 359); o desenho o mostra com a largura cheia, cortado pela caixa.
- `maxItemWidth` (o hero com mais de um item grande), `contentPadding` (`horizontal` e `vertical`), `minSmallItemWidth` e `maxSmallItemWidth` são campos e código, mas o desenho não os usa (usa os 40 e 56 do padrão); sem a imagem remota: o desenho mostra o reservado até o carregador do app (Coil) entregar a imagem, como o nó `image`.
- O véu é um degradê de escuro (`scrim` com `alpha` 0,55, sólido nos 36 px de baixo) a transparente (`scrim` com `alpha` 0) no topo. A cor do rótulo, o véu e o limite de uma linha são do app no Compose (`Text` sobre a imagem); o desenho os escolhe para ilustrar.
