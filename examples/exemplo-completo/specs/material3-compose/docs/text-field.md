# Text field

Campo de texto. Filled tem fundo preenchido; outlined tem contorno.

Tipo de anotação: `text-field` (camada Componentes).

## Campos

| Chave            | Rótulo           | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                             |
| ---------------- | ---------------- | ------ | ----------- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `label`          | Rótulo           | string | sim         |                                                                |          | Rótulo flutuante do campo.                                                                            |
| `value`          | Valor            | string | não         |                                                                |          | Texto digitado no campo.                                                                              |
| `placeholder`    | Dica             | string | não         |                                                                |          | Texto de dica quando o campo está vazio.                                                              |
| `supportingText` | Texto de apoio   | string | não         |                                                                |          | Texto de apoio ou de erro abaixo do campo.                                                            |
| `style`          | Estilo           | enum   | não         | `filled`, `outlined`                                           | `filled` | filled (TextField) ou outlined (OutlinedTextField).                                                   |
| `enabled`        | Habilitado       | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o campo.                                                                             |
| `isError`        | Em erro          | enum   | não         | `true`, `false`                                                | `false`  | true pinta o campo como erro.                                                                         |
| `singleLine`     | Linha única      | enum   | não         | `true`, `false`                                                | `false`  | true limita o campo a uma linha.                                                                      |
| `maxLines`       | Máximo de linhas | number | não         |                                                                |          | Limite de linhas (Int). Vazio = sem limite.                                                           |
| `leadingIcon`    | Ícone inicial    | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = sem ícone.                                                              |
| `trailingIcon`   | Ícone final      | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone depois do texto. Vazio = sem ícone.                                                             |
| `width`          | Largura          | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`         | Altura           | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`         | Peso (weight)    | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.material3.TextField`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo                                              |
| --------------- | ---------------------------------------------------- |
| `filled` (base) | `TextField`                                          |
| `outlined`      | `OutlinedTextField` (arquivo `OutlinedTextField.kt`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
TextField(    // style outlined: OutlinedTextField (mesmos parâmetros)
    value = value,                  // estado da tela
    onValueChange = { value = it },
    enabled = true,
    isError = false,
    singleLine = true,
    label = { Text("E-mail") },
    placeholder = { Text("nome@exemplo.com") },
    supportingText = { Text("Texto de apoio") },
    leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
    modifier = Modifier.fillMaxWidth(),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `value` e `onValueChange` ligam a um estado da tela. `label`, `placeholder` e `supportingText` preenchidos viram `{ Text(<campo>) }`; `leadingIcon` e `trailingIcon` viram `{ Icon(Icons.Filled.<nome>, contentDescription = null) }`. `maxLines` só entra quando preenchido; filled e outlined não exigem opt-in. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Preenchido**: label=Nome, style=filled
- **Contornado com dica**: label=E-mail, placeholder=nome@exemplo.com, style=outlined, leadingIcon=Email, singleLine=true
- **Em erro**: label=Senha, value=123, supportingText=Mínimo de 8 caracteres, style=outlined, isError=true, trailingIcon=Lock
