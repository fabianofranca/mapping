# Button

Botão de ação. Filled é a ênfase alta, tonal e elevated a média, outlined e text a baixa.

Tipo de anotação: `button` (camada Componentes).

## Campos

| Chave     | Rótulo        | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                             |
| --------- | ------------- | ------ | ----------- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `label`   | Rótulo        | string | sim         |                                                                |          | Texto do botão.                                                                                       |
| `style`   | Estilo        | enum   | não         | `filled`, `tonal`, `outlined`, `text`, `elevated`              | `filled` | filled (Button), tonal (FilledTonalButton), outlined, text ou elevated.                               |
| `enabled` | Habilitado    | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o botão.                                                                             |
| `icon`    | Ícone         | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = só texto.                                                               |
| `width`   | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp). |
| `height`  | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).   |
| `weight`  | Peso (weight) | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                     |

## Compose

- Símbolo: `androidx.compose.material3.Button`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo             |
| --------------- | ------------------- |
| `filled` (base) | `Button`            |
| `tonal`         | `FilledTonalButton` |
| `outlined`      | `OutlinedButton`    |
| `text`          | `TextButton`        |
| `elevated`      | `ElevatedButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Button(    // style tonal: FilledTonalButton, outlined: OutlinedButton, text: TextButton, elevated: ElevatedButton
    onClick = { /* lógica da tela */ },
    enabled = true,
    modifier = Modifier.fillMaxWidth(),    // width = fill
) {
    Icon(Icons.Filled.Add, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))   // só com icon
    Spacer(Modifier.size(ButtonDefaults.IconSpacing))
    Text("Adicionar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e o texto vai em `content = { Text(<label>) }`. Com `icon` preenchido, ponha antes do texto `Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))` e `Spacer(Modifier.size(ButtonDefaults.IconSpacing))`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Preenchido**: label=Salvar, style=filled
- **Contornado**: label=Cancelar, style=outlined
- **Com ícone**: label=Adicionar, style=tonal, icon=Add
