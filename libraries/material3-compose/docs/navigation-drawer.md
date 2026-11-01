# Navigation drawer

Folha de navegação lateral. Modal cobre a tela com um scrim; dismissible empurra o conteúdo e se dispensa; permanent fica sempre à vista. Cada linha de Itens é um destino.

Tipo de anotação: `navigation-drawer` (camada Componentes).

## Campos

| Chave      | Rótulo    | Tipo   | Obrigatório | Opções                              | Padrão  | Descrição                                                                                                          |
| ---------- | --------- | ------ | ----------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `headline` | Cabeçalho | string | não         |                                     |         | Título opcional no topo da folha, acima dos itens.                                                                 |
| `style`    | Estilo    | enum   | não         | `modal`, `dismissible`, `permanent` | `modal` | modal (ModalNavigationDrawer), dismissible (DismissibleNavigationDrawer) ou permanent (PermanentNavigationDrawer). |
| `items`    | Itens     | table  | sim         | ver Colunas abaixo                  |         | Um destino por linha, na ordem em que aparecem na folha.                                                           |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |
| `badge`    | Selo        | string | não         |                                                                |         |

## Compose

- Símbolo: `androidx.compose.material3.ModalNavigationDrawer`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationDrawer.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo                                                        |
| -------------- | -------------------------------------------------------------- |
| `modal` (base) | `ModalNavigationDrawer` (folha `ModalDrawerSheet`)             |
| `dismissible`  | `DismissibleNavigationDrawer` (folha `DismissibleDrawerSheet`) |
| `permanent`    | `PermanentNavigationDrawer` (folha `PermanentDrawerSheet`)     |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style modal: o drawer envolve o Scaffold; a marcação é a folha
ModalNavigationDrawer(
    drawerContent = {
        ModalDrawerSheet {
            Text("Mapping", Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)
            NavigationDrawerItem(    // uma por linha de items
                label = { Text("Caixa de entrada") },
                selected = true,
                onClick = { /* lógica da tela */ },
                icon = { Icon(Icons.Filled.Email, contentDescription = null) },
                badge = { Text("24") },
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
            )
        }
    },
    drawerState = rememberDrawerState(DrawerValue.Closed),
) {
    Scaffold { innerPadding -> /* conteúdo da tela */ }
}

// style dismissible: DismissibleNavigationDrawer + DismissibleDrawerSheet (mesmos itens)
// style permanent: PermanentNavigationDrawer + PermanentDrawerSheet (sem drawerState)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. `ModalNavigationDrawer(drawerContent = { ModalDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <conteúdo da tela> }`; dentro da `ModalDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. A marcação é a folha: o conteúdo da tela vai no último parâmetro (`content`) e o scrim é do composable. Abrir e fechar: `drawerState.open()` e `close()` numa coroutine. O drawer envolve o `Scaffold` (`ModalNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (até 360 dp) é do composable, e `Modifier.width(<largura da marcação>.dp)` ajusta a folha. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `dismissible`: Estável, sem opt-in. `DismissibleNavigationDrawer(drawerContent = { DismissibleDrawerSheet { … } }, drawerState = rememberDrawerState(DrawerValue.Closed)) { <conteúdo da tela> }`; dentro da `DismissibleDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. Sem scrim: ao abrir, a folha empurra o conteúdo ao lado dela. Abrir e fechar: `drawerState.open()` e `close()` numa coroutine. O drawer envolve o `Scaffold` (`DismissibleNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (até 360 dp) é do composable. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `permanent`: Estável, sem opt-in. `PermanentNavigationDrawer(drawerContent = { PermanentDrawerSheet { … } }) { <conteúdo da tela> }`, sem `drawerState` (sempre visível, ao lado do conteúdo numa `Row`); dentro da `PermanentDrawerSheet`: um `NavigationDrawerItem` por linha de `items`: `label = { Text(<label>) }`, `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }` (anulável), `badge = { Text(<badge>) }` (anulável) e `modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)`; o `headline` vira um `Text(<headline>, Modifier.padding(16.dp), style = MaterialTheme.typography.titleSmall)` antes dos itens. O drawer envolve o `Scaffold` (`PermanentNavigationDrawer { Scaffold { … } }`), não ocupa slot dele. A largura (de 240 a 360 dp) é do composable, e `PermanentDrawerSheet(Modifier.width(<largura da marcação>.dp))` a ajusta. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Modal com cabeçalho**: style=modal, headline=Mapping
- **Dismissible**: style=dismissible, headline=Pastas
- **Permanente sem cabeçalho**: style=permanent
