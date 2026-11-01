# Dropdown menu

Menu suspenso com uma lista de ações ou de opções. Menu abre sobre um elemento âncora (um botão de ícone, por exemplo); exposed fica preso a um campo de texto e escolhe um valor entre as opções.

Tipo de anotação: `dropdown-menu` (camada Componentes).

## Campos

| Chave      | Rótulo          | Tipo   | Obrigatório | Opções             | Padrão | Descrição                                                                                                                                   |
| ---------- | --------------- | ------ | ----------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`    | Estilo          | enum   | não         | `menu`, `exposed`  | `menu` | menu (DropdownMenu, popup ancorado a um elemento) ou exposed (ExposedDropdownMenuBox, campo de texto com o menu preso a ele; exige opt-in). |
| `items`    | Itens           | table  | sim         | ver Colunas abaixo |        | Um item por linha, na ordem em que aparecem no menu.                                                                                        |
| `expanded` | Aberto          | enum   | não         | `true`, `false`    | `true` | true mostra o menu; false o esconde (no exposed sobra só o campo). No código é o estado `expanded` da tela.                                 |
| `label`    | Rótulo do campo | string | não         |                    |        | Rótulo do campo de texto do exposed. Vazio = sem rótulo. Só vale em exposed.                                                                |
| `value`    | Valor do campo  | string | não         |                    |        | Opção escolhida, mostrada no campo de texto do exposed. Só vale em exposed.                                                                 |

Colunas de `items` (uma linha por item):

| Chave          | Rótulo           | Tipo   | Obrigatório | Opções                                                         | Padrão |
| -------------- | ---------------- | ------ | ----------- | -------------------------------------------------------------- | ------ |
| `text`         | Texto            | string | sim         |                                                                |        |
| `leadingIcon`  | Ícone à esquerda | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        |
| `trailingIcon` | Ícone à direita  | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |        |
| `enabled`      | Habilitado       | enum   | não         | `true`, `false`                                                | `true` |

## Compose

- Símbolo: `androidx.compose.material3.DropdownMenu`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Menu.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`       | Símbolo                  |
| ------------- | ------------------------ |
| `menu` (base) | `DropdownMenu`           |
| `exposed`     | `ExposedDropdownMenuBox` |

O caso `exposed` também troca o arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/ExposedDropdownMenu.kt`.

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
// style menu: DropdownMenu ancorado a um IconButton
Box {
    IconButton(onClick = { expanded = true }) {
        Icon(Icons.Filled.MoreVert, contentDescription = "Mais opções")
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        // uma linha de items vira um DropdownMenuItem
        DropdownMenuItem(
            text = { Text("Editar") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
        )
        DropdownMenuItem(
            text = { Text("Excluir") },
            onClick = { expanded = false },
            leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
            enabled = false,
        )
    }
}

// style exposed: ExposedDropdownMenuBox (@OptIn(ExperimentalMaterial3Api::class))
ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    TextField(
        value = "Português",
        onValueChange = {},
        readOnly = true,
        label = { Text("Idioma") },
        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text("Português") },
            onClick = { expanded = false },
            contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
        )
    }
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. O menu é um popup ancorado ao composable onde é declarado: ponha-o num `Box` junto do elemento âncora (o `IconButton` que o abre) e ligue `expanded` a um estado da tela (`var expanded by remember { mutableStateOf(<expanded>) }`), com `onDismissRequest = { expanded = false }`. Dentro, um `DropdownMenuItem` por linha de `items`: `text = { Text(<text>) }`, `onClick = { expanded = false; … }`, `leadingIcon = { Icon(Icons.Filled.<leadingIcon>, contentDescription = null) }` e `trailingIcon = { Icon(Icons.Filled.<trailingIcon>, contentDescription = null) }` só quando preenchidos, e `enabled = <enabled>`. A largura vai de 112 a 280 dp pelo conteúdo. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`.

Variante `exposed`: Exige @OptIn(ExperimentalMaterial3Api::class) (o `ExposedDropdownMenuBox` e o `ExposedDropdownMenu` são experimentais no commit fixado). `ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) { … }`, com `expanded` ligado a um estado da tela (`var expanded by remember { mutableStateOf(<expanded>) }`). Dentro vão um `TextField` (ou `OutlinedTextField`, como no tipo text-field) com `value = <value>`, `onValueChange = {}`, `readOnly = true`, `label = { Text(<label>) }`, `trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) }` e `Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)` (o `menuAnchor()` sem argumentos está `@Deprecated`), e depois `ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) { … }`, extensão do `ExposedDropdownMenuBoxScope`, com um `DropdownMenuItem` por linha de `items` (`onClick` guarda a escolha, atualiza `<value>` e fecha com `expanded = false`; `contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding`). O menu tem a largura do campo (`matchAnchorWidth = true`, o padrão).

## Exemplos

- **Menu aberto**: style=menu, expanded=true
- **Campo exposto fechado**: style=exposed, expanded=false, label=País, value=Brasil
- **Campo exposto aberto**: style=exposed, expanded=true, label=Idioma, value=Português
