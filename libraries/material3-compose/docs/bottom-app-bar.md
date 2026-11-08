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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente e os ícones são o nó `icon` do conjunto da biblioteca, escolhido pelo `$switch` do campo (nenhum caminho SVG no componente).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/AppBar.kt` (linhas 1035 a 1133: o `BottomAppBar` com `actions` e `floatingActionButton`, as ações num `Row` de peso 1 e o FAB num `Box` com `padding(top = FABVerticalPadding, end = FABHorizontalPadding)` e `contentAlignment = TopStart`; 1320 a 1400: `BottomAppBarLayout`, o `Surface` e o `Row` de altura `containerHeight` com `padding(contentPadding)` e `verticalAlignment = CenterVertically`; 2125 a 2158: `BottomAppBarDefaults` (`containerColor`, `ContainerElevation` 0, `ContentPadding` e `bottomAppBarFabColor`); 2457 a 2462: `BottomAppBarHorizontalPadding` 4, `BottomAppBarVerticalPadding` 4, `FABHorizontalPadding` 12 e `FABVerticalPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/BottomAppBarTokens.kt` (`ContainerColor` `SurfaceContainer`, `ContainerHeight` 80, `ContainerShape` `CornerNone`) e `tokens/FabSecondaryContainerTokens.kt` (`ContainerColor` `SecondaryContainer`, `IconColor` `OnSecondaryContainer`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt` (linhas 109 a 132: `FloatingActionButton`, `contentColor = contentColorFor(containerColor)`; 513 a 514: a forma `FabBaselineTokens.ContainerShape`; 591 a 603: `bottomAppBarFabElevation()` com 0 em todos os estados) e `tokens/FabBaselineTokens.kt` (56 por 56, `CornerLarge`, ícone de 24).

**Como o desenho segue o Compose**

- Barra de 80 (`BottomAppBarTokens.ContainerHeight`) em `surface-container`, sem forma (`CornerNone`) e sem sombra: o `tonalElevation` padrão é 0 e o `Surface` da barra não leva `shadowElevation`.
- Ações: áreas de 48 a partir de 4 da esquerda (`BottomAppBarHorizontalPadding`), uma ao lado da outra, centradas na linha de 76 (80 menos os 4 de cima do `contentPadding`), por isso a 18 do topo; ícones de 24 em `on-surface` (o `contentColorFor(surface-container)`).
- FAB embutido: 56 por 56 na forma `corner-large` (16), em `secondary-container` (`bottomAppBarFabColor`), sem sombra (`bottomAppBarFabElevation()` é 0), com o ícone de 24 em `on-secondary-container` (`contentColorFor`), a 12 do topo (4 do padding de cima mais `FABVerticalPadding` 8) e a 16 da direita (4 mais `FABHorizontalPadding` 12).

**O que ainda difere do Compose**

- A altura de 80 não soma a barra de navegação do sistema (`windowInsets` de baixo) nem o recolhimento ao rolar (`scrollBehavior`).
- Sem estados de pressionado, foco e passar o mouse nas ações e no FAB, e sem a área de toque mínima de 48 além da própria área da ação.
- As ações do Compose são livres (`actions = { ... }` aceita qualquer composable); o tipo desenha até quatro ícones de 48 e as que passam do espaço antes do FAB não encolhem como o `Row` de peso 1.
- Os ícones são só os do conjunto da biblioteca (`icons`); `Icons.Filled` de mesmo nome, sem os de espelhamento (`AutoMirrored`).
- O FAB do tipo é sempre o regular de 56; o Compose deixa passar qualquer `floatingActionButton` composable (um `ExtendedFloatingActionButton`, por exemplo).
