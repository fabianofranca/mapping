# List item

Item de lista de uma a três linhas, com conteúdo à esquerda e à direita. Use dentro de listas.

Tipo de anotação: `list-item` (camada Componentes).

## Campos

| Chave               | Rótulo         | Tipo   | Obrigatório | Opções                                                         | Padrão | Descrição                                                   |
| ------------------- | -------------- | ------ | ----------- | -------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `headlineContent`   | Título         | string | sim         |                                                                |        | Linha principal do item.                                    |
| `overlineContent`   | Sobretítulo    | string | não         |                                                                |        | Linha pequena acima do título. Vazio = sem linha.           |
| `supportingContent` | Texto de apoio | string | não         |                                                                |        | Linha de apoio abaixo do título. Vazio = sem linha.         |
| `leadingIcon`       | Ícone inicial  | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Ícone à esquerda. Vazio = sem ícone.                        |
| `leadingImage`      | Avatar (URL)   | string | não         |                                                                |        | Endereço https:// do avatar à esquerda. Vazio = sem avatar. |
| `trailingContent`   | Texto final    | string | não         |                                                                |        | Texto curto à direita (hora, valor). Vazio = sem texto.     |
| `trailingIcon`      | Ícone final    | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        | Ícone à direita. Vazio = sem ícone.                         |

## Compose

- Símbolo: `androidx.compose.material3.ListItem`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ListItem.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ListItem(
    overlineContent = { Text("Hoje") },
    headlineContent = { Text("Reunião de planejamento") },
    supportingContent = { Text("Sala 3, com a equipe de produto.") },
    leadingContent = { Icon(Icons.Filled.DateRange, contentDescription = null) },
    trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null) },
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `headlineContent = { Text(<headlineContent>) }`; `overlineContent`, `supportingContent` e `trailingContent` preenchidos viram `{ Text(<campo>) }` (o item tem de uma a três linhas conforme o preenchimento). `leadingIcon` e `trailingIcon` viram `leadingContent`/`trailingContent` com `Icon(Icons.Filled.<nome>, contentDescription = null)`; `leadingImage` é um avatar de `Modifier.size(40.dp).clip(CircleShape)` que, remoto, usa o carregador de imagens do app (por exemplo Coil `AsyncImage`).

## Exemplos

- **Uma linha**: headlineContent=Wi-Fi, leadingIcon=Settings
- **Duas linhas**: headlineContent=Ana Souza, supportingContent=Vamos almoçar?, trailingContent=12:30, leadingImage=https://example.com/ana.jpg
- **Três linhas**: overlineContent=Hoje, headlineContent=Reunião de planejamento, supportingContent=Sala 3, com a equipe de produto., trailingIcon=KeyboardArrowRight
