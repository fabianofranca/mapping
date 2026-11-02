# Search bar

Barra de busca. Bar é a barra que se expande para a tela inteira; docked abre os resultados logo abaixo do campo (telas largas).

Tipo de anotação: `search-bar` (camada Componentes).

## Campos

| Chave          | Rótulo        | Tipo   | Obrigatório | Opções                                                         | Padrão  | Descrição                                                                                              |
| -------------- | ------------- | ------ | ----------- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `query`        | Consulta      | string | não         |                                                                |         | Texto digitado na busca. Vazio = mostra a dica (placeholder).                                          |
| `placeholder`  | Dica          | string | não         |                                                                |         | Texto de dica quando a consulta está vazia.                                                            |
| `leadingIcon`  | Ícone inicial | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone antes do texto (costuma ser Search). Vazio = sem ícone.                                          |
| `trailingIcon` | Ícone final   | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone depois do texto (por exemplo Close para limpar). Vazio = sem ícone.                              |
| `expanded`     | Expandida     | enum   | não         | `true`, `false`                                                | `false` | true abre a busca: o container ganha o divisor dos resultados (as marcações filhas são os resultados). |
| `style`        | Estilo        | enum   | não         | `bar`, `docked`                                                | `bar`   | bar (SearchBar) ou docked (DockedSearchBar).                                                           |
| `width`        | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).  |
| `height`       | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`  | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).    |
| `weight`       | Peso (weight) | number | não         |                                                                |         | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                      |

## Compose

- Símbolo: `androidx.compose.material3.SearchBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SearchBar.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`      | Símbolo           |
| ------------ | ----------------- |
| `bar` (base) | `SearchBar`       |
| `docked`     | `DockedSearchBar` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Busca(query: String, onQueryChange: (String) -> Unit, expanded: Boolean, onExpandedChange: (Boolean) -> Unit) {
    SearchBar(    // style docked: DockedSearchBar
        inputField = {
            SearchBarDefaults.InputField(
                query = query,
                onQueryChange = onQueryChange,
                onSearch = { /* lógica da tela */ },
                expanded = expanded,
                onExpandedChange = onExpandedChange,
                placeholder = { Text("Pesquisar músicas") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
            )
        },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        /* resultados: as marcações filhas */
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class): toda a família SearchBar é experimental no commit fixado. Use a sobrecarga `SearchBar(inputField, expanded, onExpandedChange, …, content)`; as sobrecargas com `query` e `active` estão `@Deprecated`. O campo vai em `inputField = { SearchBarDefaults.InputField(query = <query>, onQueryChange = …, onSearch = …, expanded = <expanded>, onExpandedChange = …, placeholder = { Text(<placeholder>) }, leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }, trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }) }`, com `query` e `expanded` ligados a estados da tela; `placeholder`, `leadingIcon` e `trailingIcon` só entram quando preenchidos. As marcações filhas (resultados e sugestões) vão em `content = { … }` (uma Column), que só aparece com `expanded = true`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

Variante `docked`: Exige o mesmo @OptIn(ExperimentalMaterial3Api::class). `DockedSearchBar(inputField, expanded, onExpandedChange, …, content)` recebe o mesmo `inputField` (`SearchBarDefaults.InputField(query = <query>, …, expanded = <expanded>, …)`) e o mesmo `content`, mas os resultados abrem num painel logo abaixo do campo, com cantos de 28, em vez de ocupar a tela: serve para telas largas (tablet e desktop). `placeholder`, `leadingIcon` e `trailingIcon` seguem como na base.

## Exemplos

- **Barra com dica**: placeholder=Pesquisar músicas, leadingIcon=Search, style=bar
- **Com consulta**: query=jazz, placeholder=Pesquisar músicas, leadingIcon=Search, trailingIcon=Close, style=bar
- **Docked expandida**: query=jaz, placeholder=Pesquisar, leadingIcon=Search, trailingIcon=Close, expanded=true, style=docked
