# Icon button

Botão só com ícone para uma ação (editar, adicionar, mais opções). Standard, filled, tonal ou outlined.

Tipo de anotação: `icon-button` (camada Componentes).

## Campos

| Chave                | Rótulo     | Tipo   | Obrigatório | Opções                                                         | Padrão     | Descrição                                                                                                         |
| -------------------- | ---------- | ------ | ----------- | -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `icon`               | Ícone      | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Favorite` | Ícone do botão.                                                                                                   |
| `contentDescription` | Descrição  | string | não         |                                                                |            | Texto de acessibilidade do botão (vai no `contentDescription` do Icon). Vazio = sem nome para leitores de tela.   |
| `style`              | Estilo     | enum   | não         | `standard`, `filled`, `tonal`, `outlined`                      | `standard` | standard (IconButton), filled (FilledIconButton), tonal (FilledTonalIconButton) ou outlined (OutlinedIconButton). |
| `enabled`            | Habilitado | enum   | não         | `true`, `false`                                                | `true`     | false desabilita o botão.                                                                                         |

## Compose

- Símbolo: `androidx.compose.material3.IconButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`           | Símbolo                 |
| ----------------- | ----------------------- |
| `standard` (base) | `IconButton`            |
| `filled`          | `FilledIconButton`      |
| `tonal`           | `FilledTonalIconButton` |
| `outlined`        | `OutlinedIconButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
IconButton(    // style filled: FilledIconButton, tonal: FilledTonalIconButton, outlined: OutlinedIconButton
    onClick = { /* lógica da tela */ },
    enabled = true,
) {
    Icon(Icons.Filled.Edit, contentDescription = "Editar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e o ícone vai em `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }` (sem `contentDescription`, passe `null`). O container é de 40 dp com forma full; nenhum estilo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

## Exemplos

- **Padrão**: icon=Edit, contentDescription=Editar, style=standard
- **Preenchido**: icon=Add, contentDescription=Adicionar, style=filled
- **Contornado desabilitado**: icon=Settings, contentDescription=Ajustes, style=outlined, enabled=false
