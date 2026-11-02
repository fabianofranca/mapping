# Navigation bar

Barra de navegação inferior com três a cinco destinos. Cada linha de Itens é um destino.

Tipo de anotação: `navigation-bar` (camada Componentes).

## Campos

| Chave             | Rótulo                  | Tipo  | Obrigatório | Opções             | Padrão | Descrição                                                                  |
| ----------------- | ----------------------- | ----- | ----------- | ------------------ | ------ | -------------------------------------------------------------------------- |
| `items`           | Itens                   | table | sim         | ver Colunas abaixo |        | Um destino por linha, na ordem em que aparecem na barra (de três a cinco). |
| `alwaysShowLabel` | Sempre mostrar o rótulo | enum  | não         | `true`, `false`    | `true` | false mostra o rótulo só no destino selecionado.                           |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.NavigationBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationBar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
NavigationBar {
    // uma linha de items vira um NavigationBarItem
    NavigationBarItem(
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        alwaysShowLabel = true,
    )
    NavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Buscar") },
        alwaysShowLabel = true,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Um `NavigationBarItem` por linha de `items`, dentro de `NavigationBar { … }`: `selected`, `onClick`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `alwaysShowLabel = <alwaysShowLabel>` (parâmetro do item, não da barra). Dentro de um Scaffold, a barra vai em `bottomBar`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Sempre com rótulo**: alwaysShowLabel=true
- **Rótulo só no ativo**: alwaysShowLabel=false
