# Segmented button

Linha de dois a cinco segmentos para escolher uma opção (seleção única) ou várias (seleção múltipla). Cada linha de Opções é um segmento.

Tipo de anotação: `segmented-button` (camada Componentes).

## Campos

| Chave       | Rótulo     | Tipo  | Obrigatório | Opções             | Padrão   | Descrição                                                                                                       |
| ----------- | ---------- | ----- | ----------- | ------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| `options`   | Opções     | table | sim         | ver Colunas abaixo |          | Um segmento por linha, na ordem em que aparecem (de dois a cinco).                                              |
| `selection` | Seleção    | enum  | não         | `single`, `multi`  | `single` | single (SingleChoiceSegmentedButtonRow) marca um segmento; multi (MultiChoiceSegmentedButtonRow) aceita vários. |
| `enabled`   | Habilitado | enum  | não         | `true`, `false`    | `true`   | false desabilita os segmentos.                                                                                  |

Colunas de `options` (uma linha por opção):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.SingleChoiceSegmentedButtonRow`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt`
- O campo `selection` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `selection`     | Símbolo                          |
| --------------- | -------------------------------- |
| `single` (base) | `SingleChoiceSegmentedButtonRow` |
| `multi`         | `MultiChoiceSegmentedButtonRow`  |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
SingleChoiceSegmentedButtonRow {    // selection multi: MultiChoiceSegmentedButtonRow
    // uma linha de options vira um SegmentedButton
    SegmentedButton(
        selected = false,
        onClick = { /* lógica da tela */ },
        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = false) },
        label = { Text("Dia") },
    )
    SegmentedButton(
        selected = true,
        onClick = { /* ... */ },
        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = true) },
        label = { Text("Semana") },
    )
    // ... o terceiro segmento (index = 2, count = 3)
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Um `SegmentedButton` por linha de `options`, dentro de `SingleChoiceSegmentedButtonRow { … }`: `selected`, `onClick`, `shape = SegmentedButtonDefaults.itemShape(index = <posição da linha>, count = <número de linhas>)` (obrigatório), `enabled = <enabled>` (parâmetro do segmento, não da linha), `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` (o check) e `label = { Text(<label>) }`. Com a coluna `icon` preenchida, passe `inactiveContent = { Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(SegmentedButtonDefaults.IconSize)) }` ao `SegmentedButtonDefaults.Icon`. O `SegmentedButton` é função de extensão do escopo da linha: importe `androidx.compose.material3.SegmentedButton`. Nenhum tipo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

Variante `multi`: Um `SegmentedButton` por linha de `options`, dentro de `MultiChoiceSegmentedButtonRow { … }`, com `checked = <selected>` e `onCheckedChange` no lugar de `selected` e `onClick` (cada segmento liga e desliga sozinho); `shape = SegmentedButtonDefaults.itemShape(index = <posição da linha>, count = <número de linhas>)`, `enabled = <enabled>`, `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` e `label = { Text(<label>) }`. Importe `androidx.compose.material3.SegmentedButton`.

## Exemplos

- **Seleção única**: selection=single
- **Seleção múltipla**: selection=multi
- **Desabilitado**: selection=single, enabled=false
