# Top app bar

Barra do topo da tela com título, ícone de navegação e ações. Small é a padrão; Center centraliza o título; Medium e Large têm título grande que colapsa ao rolar.

Tipo de anotação: `top-app-bar` (camada Componentes).

## Campos

| Chave            | Rótulo             | Tipo   | Obrigatório | Opções                                                         | Padrão  | Descrição                                                                            |
| ---------------- | ------------------ | ------ | ----------- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `title`          | Título             | string | sim         |                                                                |         | Título da tela.                                                                      |
| `style`          | Estilo             | enum   | não         | `small`, `center`, `medium`, `large`                           | `small` | small, center (título centralizado), medium ou large (título grande em duas linhas). |
| `navigationIcon` | Ícone de navegação | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Ícone à esquerda (Menu ou ArrowBack, por exemplo). Vazio = sem ícone.                |
| `actionIcon1`    | Ação 1             | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Primeiro ícone de ação à direita. Vazio = sem ação.                                  |
| `actionIcon2`    | Ação 2             | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         | Segundo ícone de ação à direita. Vazio = sem ação.                                   |

## Compose

- Símbolo: `androidx.compose.material3.TopAppBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo                  |
| -------------- | ------------------------ |
| `small` (base) | `TopAppBar`              |
| `center`       | `CenterAlignedTopAppBar` |
| `medium`       | `MediumTopAppBar`        |
| `large`        | `LargeTopAppBar`         |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
@OptIn(ExperimentalMaterial3Api::class)   // só se usar scrollBehavior
@Composable
fun Barra() {
    TopAppBar(    // style center: CenterAlignedTopAppBar, medium: MediumTopAppBar, large: LargeTopAppBar
        title = { Text("Início") },
        navigationIcon = {
            IconButton(onClick = { /* lógica da tela */ }) {
                Icon(Icons.Filled.Menu, contentDescription = "Menu")
            }
        },
        actions = {
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.Search, contentDescription = "Buscar") }
            IconButton(onClick = { /* ... */ }) { Icon(Icons.Filled.MoreVert, contentDescription = "Mais") }
        },
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `title = { Text(<title>) }`; com `navigationIcon` preenchido, `navigationIcon = { IconButton(onClick = …) { Icon(Icons.Filled.<navigationIcon>, contentDescription = …) } }`, e cada `actionIcon1`/`actionIcon2` preenchido vira um `IconButton` dentro de `actions = { … }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`. Nenhuma das quatro variantes exige opt-in; só o `scrollBehavior` (`TopAppBarDefaults.pinnedScrollBehavior()` e parentes) exige `@OptIn(ExperimentalMaterial3Api::class)`.

## Exemplos

- **Padrão**: title=Início, style=small, navigationIcon=Menu, actionIcon1=Search, actionIcon2=MoreVert
- **Centralizada**: title=Perfil, style=center, navigationIcon=ArrowBack
- **Grande**: title=Configurações, style=large, navigationIcon=ArrowBack
