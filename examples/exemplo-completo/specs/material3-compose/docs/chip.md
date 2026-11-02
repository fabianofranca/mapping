# Chip

Chip compacto. Assist sugere uma ação, filter filtra conteúdo, input representa um valor digitado e suggestion propõe uma resposta. Cada estilo tem a versão elevated.

Tipo de anotação: `chip` (camada Componentes).

## Campos

| Chave          | Rótulo        | Tipo   | Obrigatório | Opções                                                                                                 | Padrão   | Descrição                                                               |
| -------------- | ------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `label`        | Rótulo        | string | sim         |                                                                                                        |          | Texto do chip.                                                          |
| `style`        | Estilo        | enum   | não         | `assist`, `assist-elevated`, `filter`, `filter-elevated`, `input`, `suggestion`, `suggestion-elevated` | `assist` | assist, filter, input ou suggestion, cada um também na versão elevated. |
| `selected`     | Selecionado   | enum   | não         | `true`, `false`                                                                                        | `false`  | true marca o chip. Só vale nos estilos filter e input.                  |
| `enabled`      | Habilitado    | enum   | não         | `true`, `false`                                                                                        | `true`   | false desabilita o chip.                                                |
| `leadingIcon`  | Ícone inicial | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone antes do texto. Vazio = sem ícone.                                |
| `trailingIcon` | Ícone final   | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…)                                         |          | Ícone depois do texto. Vazio = sem ícone. Não existe em suggestion.     |

## Compose

- Símbolo: `androidx.compose.material3.AssistChip`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Chip.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`               | Símbolo                  |
| --------------------- | ------------------------ |
| `assist` (base)       | `AssistChip`             |
| `assist-elevated`     | `ElevatedAssistChip`     |
| `filter`              | `FilterChip`             |
| `filter-elevated`     | `ElevatedFilterChip`     |
| `input`               | `InputChip`              |
| `suggestion`          | `SuggestionChip`         |
| `suggestion-elevated` | `ElevatedSuggestionChip` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
AssistChip(    // style assist-elevated: ElevatedAssistChip
    onClick = { /* lógica da tela */ },
    label = { Text("Adicionar ao calendário") },
    leadingIcon = {
        Icon(Icons.Filled.DateRange, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize))
    },
)

FilterChip(    // style filter; filter-elevated: ElevatedFilterChip
    selected = true,
    onClick = { /* ... */ },
    label = { Text("Aberto agora") },
    leadingIcon = {
        Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize))
    },
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e `label = { Text(<label>) }`. `leadingIcon` e `trailingIcon` preenchidos viram `{ Icon(Icons.Filled.<nome>, contentDescription = null, Modifier.size(AssistChipDefaults.IconSize)) }`. Nenhum estilo exige opt-in.

Variante `filter`: `selected` e `onClick` ligam ao estado do filtro e `label = { Text(<label>) }`. Com `selected = true` é costume `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; `trailingIcon` preenchido vira um `Icon` do mesmo tamanho.

Variante `filter-elevated`: `selected` e `onClick` ligam ao estado do filtro e `label = { Text(<label>) }`. Com `selected = true` é costume `leadingIcon = { Icon(Icons.Filled.Done, contentDescription = null, Modifier.size(FilterChipDefaults.IconSize)) }`; `trailingIcon` preenchido vira um `Icon` do mesmo tamanho.

Variante `input`: `selected` e `onClick` ligam ao estado do valor e `label = { Text(<label>) }`. `trailingIcon` costuma ser `Icons.Filled.Close` para remover o valor; o `avatar` (imagem circular) é opcional e não é campo.

Variante `suggestion`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O SuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

Variante `suggestion-elevated`: `onClick` liga à lógica da tela e `label = { Text(<label>) }`. O ElevatedSuggestionChip tem um só ícone, chamado `icon`: `icon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null, Modifier.size(SuggestionChipDefaults.IconSize)) }`.

## Exemplos

- **Assist**: label=Adicionar ao calendário, style=assist, leadingIcon=DateRange
- **Filtro selecionado**: label=Aberto agora, style=filter, selected=true
- **Valor digitado**: label=ana@exemplo.com, style=input, trailingIcon=Close
