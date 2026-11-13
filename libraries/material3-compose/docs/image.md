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

## Fidelidade

Referência: Compose `foundation` do commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (a biblioteca fixa o Compose `material3` 1.4.0 nesse commit). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). O `image` é do Foundation (`Image` e, para URL, o `AsyncImage` do carregador de imagens do app): o Material 3 não tem tokens de imagem, e este desenho não tem valores de tokens do `material3` a seguir.

**Arquivos usados**

- `compose/foundation/foundation/src/commonMain/kotlin/androidx/compose/foundation/Image.kt` (`Image(painter, contentDescription, modifier, alignment, contentScale, alpha, colorFilter)`; o padrão de `contentScale` é `ContentScale.Fit`).
- `compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/layout/ContentScale.kt` (`Crop`, `Fit`, `FillBounds`, `FillWidth`, `FillHeight`, `Inside` e `None`).

**Como o desenho segue o Compose**

- Cada `contentScale` vai ao `fit` do nó `image` do formato 4: `Crop` em `cover`, `Fit` em `contain`, `FillBounds` em `fill`, `FillWidth` em `fill-width`, `FillHeight` em `fill-height`, `Inside` em `scale-down` e `None` em `none` (`ContentScale.kt`). `None` e `scale-down` usam o tamanho natural da imagem baixada.
- A imagem vem de uma URL `https` pelo nó `image` do formato; o fundo atrás dela (e o reservado, antes de carregar) usa o token `surface-variant`, que muda com o modo claro e escuro. Não há cor literal.
- Sem URL, a legenda mostra a descrição e as medidas, em `on-surface-variant`, com o estilo `label-small` dos tokens (sem `family`).

**O que ainda difere do Compose**

- O servidor MCP desenha o reservado da imagem (sem a imagem de verdade), então os `fit` novos só aparecem na app e no visualizador.
- `alpha` é campo e código, mas o desenho não o usa; sem `alignment` nem `colorFilter` (não são campos do tipo).
- A imagem só é pedida à rede com a permissão da origem na app, e o servidor MCP desenha sempre o reservado; o Compose carrega a imagem pelo carregador do app.
- O fundo `surface-variant` é uma escolha de desenho: o `Image` do Compose não tem fundo nem reservado.
