# Tabs

Fileira de abas para trocar entre vistas de um mesmo nível. Primary fica sob a barra do topo; Secondary separa conteúdo dentro de uma área; as roláveis aceitam mais abas do que cabem. Cada linha de Abas é uma aba.

Tipo de anotação: `tabs` (camada Componentes).

## Campos

| Chave          | Rótulo           | Tipo  | Obrigatório | Opções                                                               | Padrão    | Descrição                                                                                                                                                                                         |
| -------------- | ---------------- | ----- | ----------- | -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items`        | Abas             | table | sim         | ver Colunas abaixo                                                   |           | Uma aba por linha, na ordem em que aparecem; só uma com Selecionada = true.                                                                                                                       |
| `style`        | Estilo           | enum  | não         | `primary`, `secondary`, `primary-scrollable`, `secondary-scrollable` | `primary` | primary (indicador de 3 no tamanho do rótulo), secondary (indicador de 2 na largura da aba) ou a versão rolável de cada um (abas com a largura do conteúdo, no mínimo 90, e recuo inicial de 52). |
| `iconPosition` | Posição do ícone | enum  | não         | `top`, `leading`                                                     | `top`     | top (Tab) põe o ícone acima do texto, e a fileira passa de 48 para 72; leading (LeadingIconTab) põe o ícone à esquerda do texto, em 48. Só vale para as abas com ícone e texto.                   |

Colunas de `items` (uma linha por aba):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionada | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.PrimaryTabRow`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TabRow.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`                | Símbolo                     |
| ---------------------- | --------------------------- |
| `primary` (base)       | `PrimaryTabRow`             |
| `secondary`            | `SecondaryTabRow`           |
| `primary-scrollable`   | `PrimaryScrollableTabRow`   |
| `secondary-scrollable` | `SecondaryScrollableTabRow` |

A aba em si não depende do estilo, e sim de `iconPosition`: `top` (ou aba sem ícone) é `Tab`, e `leading` é `LeadingIconTab`, os dois em `Tab.kt`.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
PrimaryTabRow(selectedTabIndex = 0) {    // style secondary: SecondaryTabRow, primary-scrollable: PrimaryScrollableTabRow…
    // uma linha de items vira uma Tab (iconPosition top)
    Tab(
        selected = true,
        onClick = { /* lógica da tela */ },
        text = { Text("Início") },
        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
    )
    Tab(
        selected = false,
        onClick = { /* ... */ },
        text = { Text("Buscar") },
        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
    )
    // iconPosition leading: LeadingIconTab(selected, onClick, text = { … }, icon = { … })
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> A fileira é `PrimaryTabRow(selectedTabIndex = <índice da linha de items com selected = true>) { … }` (`style` escolhe a fileira). Dentro, uma aba por linha de `items`: com `iconPosition = top` (ou sem ícone), `Tab(selected = <selected>, onClick = …, text = { Text(<label>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) })` (omita `icon` quando a coluna estiver vazia); com `iconPosition = leading`, `LeadingIconTab(selected, onClick, text = { Text(<label>) }, icon = { Icon(…) })`, que pede `text` e `icon`. `Tab` e `LeadingIconTab` estão em `Tab.kt`, do mesmo pacote, e vêm de `androidx.compose.material3`. `TabRow` e `ScrollableTabRow` estão `@Deprecated` (substituídos pelas quatro fileiras): não os use. As quatro fileiras e as duas abas são estáveis, sem opt-in. A fileira fixa reparte a largura por igual; as roláveis (`edgePadding` 52, `minTabWidth` 90, `scrollState`) deixam cada aba com a largura do conteúdo. Largura e posição vêm do `Modifier` (a fileira não tem tamanho próprio; costuma ir sob o `TopAppBar` ou acima do conteúdo da página). Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Primárias com ícone acima**: style=primary, iconPosition=top
- **Secundárias com ícone à esquerda**: style=secondary, iconPosition=leading
- **Primárias roláveis**: style=primary-scrollable, iconPosition=leading
