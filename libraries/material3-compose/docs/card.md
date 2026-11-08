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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Cores, raio e tipografia vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledCardTokens.kt` (linhas 24 a 26: `ContainerColor = SurfaceContainerHighest`, `ContainerElevation = Level0`, `ContainerShape = CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevatedCardTokens.kt` (linhas 24 a 26: `SurfaceContainerLow`, `ContainerElevation = Level1`, `CornerMedium`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedCardTokens.kt` (linhas 24 a 26: `Surface`, `Level0`, `CornerMedium`; linhas 38 e 39: `OutlineColor = OutlineVariant`, `OutlineWidth = 1.0.dp`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Card.kt` (linhas 80 a 98: `Card` é um `Surface` com `shape`, `color`, `contentColor`, `shadowElevation` e `border` sobre uma `Column`; linhas 370 a 379: `CardDefaults.shape`, `elevatedShape`, `outlinedShape`; linhas 486 a 517, 531 a 565 e 580 a 610: `contentColor = contentColorFor(containerColor)`; linhas 614 a 624: `outlinedCardBorder`).

**Como o desenho segue o Compose**

- O raio é `corner-medium` (12) nos três estilos.
- `filled` usa `surface-container-highest`, sem sombra e sem contorno; `elevated` usa `surface-container-low` com a sombra do nível 1 (`elevation-shadow`, deslocamento 1 e desfoque 2, os valores de `elevation-1-y` e `elevation-1-blur`); `outlined` usa `surface` com contorno de 1 em `outline-variant`, por dentro. Os valores mudam com o modo (claro e escuro).
- A cor do conteúdo é a `contentColorFor` do fundo, `on-surface`: o título a usa. O subtítulo e o texto de apoio usam `on-surface-variant`, como o `bodyMedium` de um cartão do Material.
- O título é `title-medium` (16/24, peso 500) e o subtítulo e o apoio são `body-medium` (14/20, peso 400), com o espaçamento entre letras dos tokens. Sem `family`: a fonte é a `font-sans` do tema.
- O `Surface` recorta o conteúdo na forma; a raiz do desenho também recorta, então a mídia do topo fica com os cantos arredondados do cartão.
- A mídia remota (`image` do formato) fica sobre `surface-container-highest` enquanto não carrega; é o carregador de imagens do app (`AsyncImage`) que a busca, fora do androidx.

**O que ainda difere do Compose**

- O `shadow` do formato só aceita número literal em `x`, `y` e `blur` (não aceita `$token` nem expressão): a sombra do nível 1 está escrita como 1 e 2 no componente, com a cor pelo token `elevation-shadow`. Os tokens `elevation-1-y` e `elevation-1-blur` guardam os mesmos valores, mas o desenho não os lê.
- A sombra é uma só, em preto a 30%; o Compose compõe duas sombras (ambiente e ponto) que o canvas 2D não reproduz.
- O espaçamento de 16 entre as bordas e o texto e o vão de 4 entre as linhas são do desenho: o `Card` do Compose não tem padding, quem escreve a `Column` decide. A mídia tem altura fixa de 140.
- Sem estados (desabilitado, pressionado, focado, arrastado) nem `onClick`; o desenho é estático.
