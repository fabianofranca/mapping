# Bottom app bar

Barra de baixo da tela com até quatro ações em ícone e, opcional, um botão de ação flutuante (FAB) embutido à direita. No Scaffold vai em bottomBar.

Tipo de anotação: `bottom-app-bar` (camada Componentes).

## Campos

| Chave                  | Rótulo          | Tipo   | Obrigatório | Opções                                                         | Padrão | Descrição                                                                          |
| ---------------------- | --------------- | ------ | ----------- | -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `actionIcon1`          | Ação 1          | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Primeiro ícone de ação, à esquerda. Vazio = sem ação.                              |
| `actionIcon2`          | Ação 2          | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Segundo ícone de ação. Vazio = sem ação.                                           |
| `actionIcon3`          | Ação 3          | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Terceiro ícone de ação. Vazio = sem ação.                                          |
| `actionIcon4`          | Ação 4          | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Quarto ícone de ação. Vazio = sem ação.                                            |
| `floatingActionButton` | Botão flutuante | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Ícone do FAB embutido à direita (parâmetro floatingActionButton). Vazio = sem FAB. |

## Compose

- Símbolo: `androidx.compose.material3.BottomAppBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Scaffold(
    bottomBar = {
        BottomAppBar(
            actions = {
                IconButton(onClick = { /* lógica da tela */ }) {
                    Icon(Icons.Filled.Check, contentDescription = "Concluir")
                }
                IconButton(onClick = { /* ... */ }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Editar")
                }
            },
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { /* ... */ },
                    containerColor = BottomAppBarDefaults.bottomAppBarFabColor,
                    elevation = FloatingActionButtonDefaults.bottomAppBarFabElevation(),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Adicionar")
                }
            },
        )
    },
) { padding -> /* conteúdo */ }
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Overload estável `BottomAppBar(actions = { … }, floatingActionButton = { … })`, sem `scrollBehavior` (o overload com `scrollBehavior` exige `@OptIn(ExperimentalMaterial3Api::class)` e não é usado aqui). Cada `actionIcon1` a `actionIcon4` preenchido vira um `IconButton(onClick = …) { Icon(Icons.Filled.<actionIconN>, contentDescription = …) }` dentro de `actions = { … }` (escopo de `RowScope`, da esquerda para a direita). Com `floatingActionButton` preenchido, `floatingActionButton = { FloatingActionButton(onClick = …, containerColor = BottomAppBarDefaults.bottomAppBarFabColor, elevation = FloatingActionButtonDefaults.bottomAppBarFabElevation()) { Icon(Icons.Filled.<floatingActionButton>, contentDescription = …) } }`; vazio = omita o parâmetro. Dentro de um Scaffold, a barra vai em `bottomBar`. A altura (80, mais a barra de navegação do sistema) é do componente: largura e posição vêm do `Modifier`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Com botão flutuante**: actionIcon1=Check, actionIcon2=Edit, actionIcon3=Favorite, floatingActionButton=Add
- **Quatro ações**: actionIcon1=Home, actionIcon2=Search, actionIcon3=Person, actionIcon4=Settings
- **Uma ação e botão**: actionIcon1=Search, floatingActionButton=Edit
