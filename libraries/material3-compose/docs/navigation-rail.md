# Navigation rail

Barra de navegação lateral para telas largas. A rail estreita (rail), a wide (wide) e a wide modal (modal-wide) têm um destino por linha de Itens.

Tipo de anotação: `navigation-rail` (camada Componentes).

## Campos

| Chave             | Rótulo                  | Tipo  | Obrigatório | Opções                       | Padrão     | Descrição                                                                                                                                                  |
| ----------------- | ----------------------- | ----- | ----------- | ---------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`           | Itens                   | table | sim         | ver Colunas abaixo           |            | Um destino por linha, na ordem em que aparecem na rail, de cima para baixo.                                                                                |
| `style`           | Estilo                  | enum  | não         | `rail`, `wide`, `modal-wide` | `rail`     | rail (NavigationRail, 80 de largura), wide (WideNavigationRail, recolhida ou expandida) ou modal-wide (ModalWideNavigationRail, que expande sobre a tela). |
| `initialValue`    | Estado inicial          | enum  | não         | `Collapsed`, `Expanded`      | `Expanded` | Só para wide e modal-wide: Expanded mostra o ícone ao lado do rótulo; Collapsed, o ícone acima (rememberWideNavigationRailState).                          |
| `alwaysShowLabel` | Sempre mostrar o rótulo | enum  | não         | `true`, `false`              | `true`     | Só para rail: false mostra o rótulo só no destino selecionado.                                                                                             |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.NavigationRail`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/NavigationRail.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`       | Símbolo                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `rail` (base) | `NavigationRail` (itens `NavigationRailItem`)                                               |
| `wide`        | `WideNavigationRail` (arquivo `WideNavigationRail.kt`; itens `WideNavigationRailItem`)      |
| `modal-wide`  | `ModalWideNavigationRail` (arquivo `WideNavigationRail.kt`; itens `WideNavigationRailItem`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style rail
NavigationRail {
    NavigationRailItem(    // uma por linha de items
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        alwaysShowLabel = true,
    )
}

// style wide (modal-wide: ModalWideNavigationRail, mesmos parâmetros)
val state = rememberWideNavigationRailState(initialValue = WideNavigationRailValue.Expanded)
WideNavigationRail(state = state) {
    WideNavigationRailItem(    // uma por linha de items
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        railExpanded = state.targetValue == WideNavigationRailValue.Expanded,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Um `NavigationRailItem` por linha de `items`, dentro de `NavigationRail { … }`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `alwaysShowLabel = <alwaysShowLabel>` (parâmetro do item, não da rail). O slot `header = { … }` da rail (um FAB ou o botão de menu) não é um campo. A largura mínima é de 80 dp, vinda do composable; a altura enche a tela (`fillMaxHeight`). O Scaffold não tem slot para a rail: ela vai numa `Row` antes do conteúdo, dentro de `content = { innerPadding -> Row(Modifier.padding(innerPadding)) { rail; Box(Modifier.weight(1f)) { … } } }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `wide`: Estável, sem opt-in. `WideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }` (`initialValue` é parâmetro de `rememberWideNavigationRailState`; o composable lê o mesmo `state`). Um `WideNavigationRailItem` por linha de `items`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (obrigatório e igual em todos os itens; o `iconPosition` do item acompanha: ao lado do rótulo expandida, acima dele recolhida). O `label` é anulável. `alwaysShowLabel` não existe aqui. O slot `header = { … }` não é um campo. A rail recolhida tem 96 dp de largura e a expandida de 220 a 360 dp, vindas do composable. Fora do Scaffold: ela vai numa `Row` antes do conteúdo, dentro de `content = { innerPadding -> … }`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

Variante `modal-wide`: Estável, sem opt-in. `ModalWideNavigationRail(state = rememberWideNavigationRailState(initialValue = <initialValue>)) { … }`: recolhida, fica no lugar como a wide; expandida, abre numa janela modal sobre a tela, com scrim; quem expande e recolhe é o `state` (`expand()`, `collapse()` e `toggle()`, numa coroutine), e `hideOnCollapse = true` faz a rail sair da tela ao recolher. Um `WideNavigationRailItem` por linha de `items`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` e `railExpanded = state.targetValue == WideNavigationRailValue.Expanded` (obrigatório e igual em todos os itens; o `iconPosition` do item acompanha: ao lado do rótulo expandida, acima dele recolhida). O `label` é anulável. O slot `header = { … }` não é um campo. Fica ao lado do conteúdo, numa `Row` antes dele, dentro de `content = { innerPadding -> … }` do Scaffold; o `Scaffold` não tem slot para ela. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Rail estreita**: style=rail, alwaysShowLabel=true
- **Wide expandida**: style=wide, initialValue=Expanded
- **Modal expandida**: style=modal-wide, initialValue=Expanded
