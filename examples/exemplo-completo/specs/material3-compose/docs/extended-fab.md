# Extended FAB

Botão de ação flutuante com ícone e texto. Use quando a ação precisa de um rótulo.

Tipo de anotação: `extended-fab` (camada Componentes).

## Campos

| Chave            | Rótulo       | Tipo   | Obrigatório | Opções                                                         | Padrão             | Descrição                                     |
| ---------------- | ------------ | ------ | ----------- | -------------------------------------------------------------- | ------------------ | --------------------------------------------- |
| `text`           | Texto        | string | sim         |                                                                |                    | Rótulo do botão.                              |
| `icon`           | Ícone        | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |                    | Ícone antes do texto. Vazio = só texto.       |
| `expanded`       | Expandido    | enum   | não         | `true`, `false`                                                | `true`             | false recolhe o botão para só o ícone.        |
| `containerColor` | Cor do botão | enum   | não         | papéis do `ColorScheme`                                        | `primaryContainer` | Papel de cor do tema usado no fundo do botão. |

## Compose

- Símbolo: `androidx.compose.material3.ExtendedFloatingActionButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/FloatingActionButton.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
ExtendedFloatingActionButton(
    text = { Text("Criar") },
    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
    onClick = { /* lógica da tela */ },
    expanded = true,
    containerColor = MaterialTheme.colorScheme.primaryContainer,
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Use a sobrecarga `ExtendedFloatingActionButton(text = { Text(<text>) }, icon = { Icon(Icons.Filled.<icon>, contentDescription = null) }, onClick = …, expanded = <expanded>)`; sem `icon`, use a de `content = { Text(<text>) }`. Dentro de um Scaffold, vai em `floatingActionButton`. Desde a material3 1.4.0 os ícones pedem `androidx.compose.material:material-icons-core` (ou `-extended`) ou um Material Symbol baixado com `painterResource`; os que espelham (ArrowBack, KeyboardArrowRight, List) ficam em `Icons.AutoMirrored.Filled`.

## Exemplos

- **Criar**: text=Criar, icon=Add
- **Recolhido**: text=Editar, icon=Edit, expanded=false, containerColor=secondaryContainer
