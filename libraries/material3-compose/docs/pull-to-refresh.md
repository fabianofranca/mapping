# PullToRefreshBox

Área que atualiza o conteúdo ao puxar para baixo, com o indicador circular no topo. As marcações filhas são o conteúdo, que precisa rolar.

Tipo de anotação: `pull-to-refresh` (camada Componentes).

## Campos

| Chave              | Rótulo                  | Tipo   | Obrigatório | Opções                                                                                                              | Padrão     | Descrição                                                                                                           |
| ------------------ | ----------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `isRefreshing`     | Atualizando             | enum   | não         | `true`, `false`                                                                                                     | `false`    | true mostra o spinner (atualização em curso, isRefreshing = true); false mostra o indicador em arrasto, com a seta. |
| `contentAlignment` | Alinhamento do conteúdo | enum   | não         | `TopStart`, `TopCenter`, `TopEnd`, `CenterStart`, `Center`, `CenterEnd`, `BottomStart`, `BottomCenter`, `BottomEnd` | `TopStart` | Onde o conteúdo fica dentro do Box (Alignment).                                                                     |
| `width`            | Largura                 | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).               |
| `height`           | Altura                  | enum   | não         | `wrap`, `fill`, `fixed`                                                                                             | `wrap`     | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                 |
| `weight`           | Peso (weight)           | number | não         |                                                                                                                     |            | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                   |

## Compose

- Símbolo: `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/pulltorefresh/PullToRefresh.kt`
- Estável no commit fixado, sem opt-in.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
var isRefreshing by remember { mutableStateOf(false) }    // isRefreshing

PullToRefreshBox(
    isRefreshing = isRefreshing,
    onRefresh = { /* inicia a atualização e põe isRefreshing em true; ao terminar, volta a false */ },
    contentAlignment = Alignment.TopStart,                // contentAlignment
    modifier = Modifier.fillMaxSize(),
) {
    LazyColumn(Modifier.fillMaxSize()) {    // o conteúdo precisa rolar: as marcações filhas
        items(lista) { /* item */ }
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. `isRefreshing` liga a um estado da tela (`var isRefreshing by remember { mutableStateOf(false) }`) e `onRefresh = { /* inicia a atualização e põe isRefreshing em true; ao terminar, volta a false */ }`. As marcações filhas formam o `content` (um `BoxScope`) e precisam rolar (`LazyColumn` ou `Modifier.verticalScroll`), porque o gesto vem da rolagem aninhada. O `indicator` e o `state` (`rememberPullToRefreshState()`) ficam nos padrões: o indicador circular de 40 dp no topo. `contentAlignment` é o do próprio Box. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Desenho

O indicador é o padrão do Material 3: círculo de 40 em surfaceContainerHigh com sombra e um anel de 16 em onSurfaceVariant. Com `isRefreshing` verdadeiro ele fica a 40 do topo (o ponto de repouso, a distância de 80 do limiar menos o tamanho do indicador) com o spinner; com falso, o desenho mostra o indicador logo no topo com a seta, que no Compose só existe enquanto a pessoa puxa (em repouso o indicador fica escondido). O anel é estático.

## Exemplos

- **Atualizando**: isRefreshing=true, width=fill, height=fill
- **Em repouso**: isRefreshing=false, width=fill, height=fill
