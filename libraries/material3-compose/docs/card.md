# Card

Cartão que agrupa conteúdo relacionado. Filled e elevated destacam pelo fundo e pela sombra; outlined, pelo contorno.

Tipo de anotação: `card` (camada Componentes).

## Campos

| Chave            | Rótulo        | Tipo   | Obrigatório | Opções                           | Padrão   | Descrição                                                                                             |
| ---------------- | ------------- | ------ | ----------- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `title`          | Título        | string | sim         |                                  |          | Título do cartão.                                                                                     |
| `subtitle`       | Subtítulo     | string | não         |                                  |          | Linha de apoio abaixo do título.                                                                      |
| `supportingText` | Texto         | string | não         |                                  |          | Parágrafo de apoio do cartão.                                                                         |
| `media`          | Imagem (URL)  | string | não         |                                  |          | Endereço https:// da imagem no topo do cartão. Vazio = sem imagem.                                    |
| `style`          | Estilo        | enum   | não         | `filled`, `elevated`, `outlined` | `filled` | filled (Card), elevated ou outlined.                                                                  |
| `width`          | Largura       | enum   | não         | `wrap`, `fill`, `fixed`          | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`         | Altura        | enum   | não         | `wrap`, `fill`, `fixed`          | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`         | Peso (weight) | number | não         |                                  |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

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
