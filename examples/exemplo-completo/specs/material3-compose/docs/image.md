# Image

Imagem com escala e descrição. Use para fotos, capas e ilustrações, de recurso local ou de uma URL.

Tipo de anotação: `image` (camada Conteúdo).

## Campos

| Chave                | Rótulo        | Tipo   | Obrigatório | Opções                                                                   | Padrão | Descrição                                                                                                           |
| -------------------- | ------------- | ------ | ----------- | ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `url`                | URL da imagem | string | sim         |                                                                          |        | Endereço https:// da imagem. O componente a exibe no canvas; no código ela passa pelo carregador de imagens do app. |
| `contentDescription` | Descrição     | string | não         |                                                                          |        | Texto de acessibilidade da imagem. Vazio = decorativa (null).                                                       |
| `contentScale`       | Escala        | enum   | não         | `Crop`, `Fit`, `FillBounds`, `FillWidth`, `FillHeight`, `Inside`, `None` | `Fit`  | Como a imagem preenche o espaço (ContentScale).                                                                     |
| `width`              | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                                                  | `wrap` | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).               |
| `height`             | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                                                  | `wrap` | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                 |
| `weight`             | Peso (weight) | number | não         |                                                                          |        | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                   |

## Compose

- Símbolo: `androidx.compose.foundation.Image`
- Arquivo (`path`): `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/Image.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// recurso local
Image(
    painter = painterResource(R.drawable.capa),
    contentDescription = "Capa do álbum",
    contentScale = ContentScale.Crop,
    modifier = Modifier.fillMaxWidth().height(180.dp),
)

// url remota: carregador do app (aqui, Coil), fora do androidx
AsyncImage(
    model = "https://example.com/capa.jpg",
    contentDescription = "Capa do álbum",
    contentScale = ContentScale.Crop,
    modifier = Modifier.fillMaxWidth().height(180.dp),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `Image` recebe um `Painter`: imagem local é `Image(painter = painterResource(R.drawable.x), contentDescription, contentScale)`; a `url` remota usa o carregador de imagens do app (por exemplo Coil `AsyncImage(model = <url>, contentDescription, contentScale)`), que fica fora do androidx e desta biblioteca. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Capa recortada**: url=https://example.com/capa.jpg, contentDescription=Capa do álbum, contentScale=Crop, width=fill, height=fixed
- **Ilustração inteira**: url=https://example.com/ilustracao.png, contentScale=Fit, width=fill
