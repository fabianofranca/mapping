# Short navigation bar

Barra de navegação curta, inferior, com três a seis destinos. Cada linha de Itens é um destino; o ícone fica acima ou ao lado do rótulo.

Tipo de anotação: `short-navigation-bar` (camada Componentes).

## Campos

| Chave          | Rótulo           | Tipo  | Obrigatório | Opções                    | Padrão        | Descrição                                                                                                                                     |
| -------------- | ---------------- | ----- | ----------- | ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`        | Itens            | table | sim         | ver Colunas abaixo        |               | Um destino por linha, na ordem em que aparecem na barra (de três a cinco com o ícone acima; até seis com o ícone ao lado).                    |
| `arrangement`  | Distribuição     | enum  | não         | `EqualWeight`, `Centered` | `EqualWeight` | EqualWeight reparte a largura por igual (telas estreitas); Centered agrupa os itens no centro (telas médias; o desenho ocupa 80% da largura). |
| `iconPosition` | Posição do ícone | enum  | não         | `Top`, `Start`            | `Top`         | Top põe o ícone acima do rótulo; Start põe o ícone ao lado dele (parâmetro do item, o mesmo em todos).                                        |

Colunas de `items` (uma linha por item):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.ShortNavigationBar`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ShortNavigationBar.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ShortNavigationBar(arrangement = ShortNavigationBarArrangement.EqualWeight) {
    // uma linha de items vira um ShortNavigationBarItem
    ShortNavigationBarItem(
        selected = true,
        onClick = { /* lógica da tela */ },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
        label = { Text("Início") },
        iconPosition = NavigationItemIconPosition.Top,    // o mesmo em todos os itens
    )
    ShortNavigationBarItem(
        selected = false,
        onClick = { /* ... */ },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
        label = { Text("Buscar") },
        iconPosition = NavigationItemIconPosition.Top,
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Um `ShortNavigationBarItem` por linha de `items`, dentro de `ShortNavigationBar(arrangement = <arrangement>) { … }`: `selected = <selected>`, `onClick = { /* lógica da tela */ }`, `icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }`, `label = { Text(<label>) }` (o `label` é anulável, mas a barra mostra sempre o rótulo), e `iconPosition = <iconPosition>` (parâmetro do item, não da barra: repita o valor em todos). Dentro de um Scaffold, a barra vai em `bottomBar`. A altura mínima é de 64 dp, vinda do composable; a largura é a da tela. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Ícone acima, distribuída**: arrangement=EqualWeight, iconPosition=Top
- **Ícone ao lado, centralizada**: arrangement=Centered, iconPosition=Start
- **Ícone acima, centralizada**: arrangement=Centered, iconPosition=Top
