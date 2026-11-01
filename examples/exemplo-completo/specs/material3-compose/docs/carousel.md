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

O componente desenha os itens com largura uniforme (186 no multi-browse, 140 no uncontained, 264 no centered-hero, com o primeiro item recuado 48 para centrar o hero), cantos de 28 e o rótulo sobre um degradê; o excesso é cortado pela caixa da marcação. No Compose a largura varia com a rolagem (grande, média e pequena), e `preferredItemWidth` e `itemWidth` não mudam o desenho (o validador avisa que o desenho não os usa, como `width`, `height` e `weight`).

## Exemplos

- **Multi-browse**: style=multi-browse, preferredItemWidth=186, itemSpacing=8, width=fill, height=fixed
- **Uncontained**: style=uncontained, itemWidth=140, itemSpacing=12, width=fill, height=fixed
- **Hero centrado**: style=centered-hero, itemSpacing=8, width=fill, height=fixed
