# Icon toggle button

Botão de ícone que liga e desliga (favoritar, fixar, silenciar). Standard, filled, tonal ou outlined, ligado ou desligado.

Tipo de anotação: `icon-toggle-button` (camada Componentes).

## Campos

| Chave                | Rótulo     | Tipo   | Obrigatório | Opções                                                         | Padrão     | Descrição                                                                                                                                 |
| -------------------- | ---------- | ------ | ----------- | -------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`               | Ícone      | string | sim         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) | `Favorite` | Ícone do botão.                                                                                                                           |
| `contentDescription` | Descrição  | string | não         |                                                                |            | Texto de acessibilidade do botão (vai no `contentDescription` do Icon). Vazio = sem nome para leitores de tela.                           |
| `style`              | Estilo     | enum   | não         | `standard`, `filled`, `tonal`, `outlined`                      | `standard` | standard (IconToggleButton), filled (FilledIconToggleButton), tonal (FilledTonalIconToggleButton) ou outlined (OutlinedIconToggleButton). |
| `checked`            | Ligado     | enum   | não         | `true`, `false`                                                | `false`    | true liga o botão (cor de seleção do estilo).                                                                                             |
| `enabled`            | Habilitado | enum   | não         | `true`, `false`                                                | `true`     | false desabilita o botão.                                                                                                                 |

## Compose

- Símbolo: `androidx.compose.material3.IconToggleButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/IconButton.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`           | Símbolo                       |
| ----------------- | ----------------------------- |
| `standard` (base) | `IconToggleButton`            |
| `filled`          | `FilledIconToggleButton`      |
| `tonal`           | `FilledTonalIconToggleButton` |
| `outlined`        | `OutlinedIconToggleButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
IconToggleButton(    // style filled: FilledIconToggleButton, tonal: FilledTonalIconToggleButton, outlined: OutlinedIconToggleButton
    checked = checked,
    onCheckedChange = { checked = it },
    enabled = true,
) {
    Icon(Icons.Filled.Favorite, contentDescription = "Favoritar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onCheckedChange` liga à lógica da tela e o ícone vai em `content = { Icon(Icons.Filled.<icon>, contentDescription = <contentDescription>) }`. É costume trocar o ícone quando ligado (por exemplo `Icons.Filled.Favorite` ligado e `Icons.Outlined.FavoriteBorder` desligado): o desenho usa o mesmo `icon` nos dois estados. Nenhum estilo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

## Exemplos

- **Desligado**: icon=Favorite, contentDescription=Favoritar, style=standard, checked=false
- **Preenchido ligado**: icon=Favorite, contentDescription=Favoritar, style=filled, checked=true
- **Contornado ligado**: icon=Notifications, contentDescription=Notificações, style=outlined, checked=true
