# Tooltip

Dica que aparece ao lado de um elemento (a âncora) ao tocar, pressionar ou passar o ponteiro. Plain traz só um texto curto; rich traz título, texto e uma ação.

Tipo de anotação: `tooltip` (camada Componentes).

## Campos

| Chave    | Rótulo | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                                                  |
| -------- | ------ | ------ | ----------- | --------------- | ------- | -------------------------------------------------------------------------- |
| `style`  | Estilo | enum   | não         | `plain`, `rich` | `plain` | plain (PlainTooltip, só texto) ou rich (RichTooltip, com título e ação).   |
| `text`   | Texto  | string | sim         |                 |         | Texto do tooltip.                                                          |
| `title`  | Título | string | não         |                 |         | Título do tooltip rich. Vazio = sem título. Só vale em rich.               |
| `action` | Ação   | string | não         |                 |         | Texto do botão de ação do tooltip rich. Vazio = sem ação. Só vale em rich. |

## Compose

- Símbolo: `androidx.compose.material3.PlainTooltip`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Tooltip.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo        |
| -------------- | -------------- |
| `plain` (base) | `PlainTooltip` |
| `rich`         | `RichTooltip`  |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
TooltipBox(    // style rich: tooltip = { RichTooltip(title = { Text("Modo avião") }, action = { … }) { Text("…") } }
    positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above),
    tooltip = { PlainTooltip { Text("Adicionar aos favoritos") } },
    state = rememberTooltipState(),
) {
    IconButton(onClick = { /* ... */ }) {
        Icon(Icons.Filled.Favorite, contentDescription = "Adicionar aos favoritos")
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Exige @OptIn(ExperimentalMaterial3Api::class) (TooltipBox, PlainTooltip e RichTooltip são experimentais no commit fixado). O tooltip não existe sozinho: envolve o elemento âncora em `TooltipBox(positionProvider = TooltipDefaults.rememberTooltipPositionProvider(TooltipAnchorPosition.Above), tooltip = { PlainTooltip { Text(<text>) } }, state = rememberTooltipState()) { <âncora> }`; o overload `rememberTooltipPositionProvider()` sem argumento está `@Deprecated` no commit fixado, por isso o argumento de posição (`Above`, `Below`, `Start`, `End`, `Left`, `Right`). O `PlainTooltip` e o `RichTooltip` são extensões do `TooltipScope` recebido pela lambda `tooltip`. A âncora é a marcação sob o tooltip; o texto vai na lambda `content` do `PlainTooltip`.

Variante `rich`: Exige @OptIn(ExperimentalMaterial3Api::class). Mesmo `TooltipBox`, com `tooltip = { RichTooltip(title = { Text(<title>) }, action = { TextButton(onClick = { /* ... */ }) { Text(<action>) } }) { Text(<text>) } }`, `state = rememberTooltipState(isPersistent = true)` quando há `action` (para o tooltip não sumir antes do toque) e `TooltipBox(hasAction = true, …)`. `title` e `action` só entram quando preenchidos; o `text` vai na lambda final (parâmetro `text`).

## Exemplos

- **Plain**: style=plain, text=Adicionar aos favoritos
- **Rich com título**: style=rich, title=Modo avião, text=Desliga o Wi-Fi, o Bluetooth e os dados móveis.
- **Rich com ação**: style=rich, title=Sincronização, text=Suas fotos são copiadas para a nuvem quando há Wi-Fi., action=Saiba mais
