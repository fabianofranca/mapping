# Switch

Chave liga e desliga. Use para configurações com efeito imediato.

Tipo de anotação: `switch` (camada Componentes).

## Campos

| Chave       | Rótulo           | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                               |
| ----------- | ---------------- | ------ | ----------- | --------------- | ------- | ------------------------------------------------------- |
| `label`     | Rótulo           | string | não         |                 |         | Texto ao lado da chave (o Switch em si não tem rótulo). |
| `checked`   | Ligado           | enum   | não         | `true`, `false` | `false` | true liga a chave.                                      |
| `enabled`   | Habilitado       | enum   | não         | `true`, `false` | `true`  | false desabilita a chave.                               |
| `thumbIcon` | Ícone no polegar | enum   | não         | `true`, `false` | `false` | true mostra um ícone de marca no polegar quando ligada. |

## Compose

- Símbolo: `androidx.compose.material3.Switch`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Row(verticalAlignment = Alignment.CenterVertically) {
    Text("Modo avião", Modifier.weight(1f))
    Switch(
        checked = checked,
        onCheckedChange = { checked = it },
        enabled = true,
        thumbContent = {    // só com thumbIcon = true
            Icon(Icons.Filled.Check, contentDescription = null, Modifier.size(SwitchDefaults.IconSize))
        },
    )
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onCheckedChange` liga à lógica da tela. O Switch não tem rótulo: o `label` vira um `Text` ao lado, numa `Row`. Com `thumbIcon = true`, passe `thumbContent = { Icon(Icons.Filled.Check, contentDescription = null, Modifier.size(SwitchDefaults.IconSize)) }`.

## Exemplos

- **Desligada**: label=Notificações, checked=false
- **Ligada com ícone**: label=Modo avião, checked=true, thumbIcon=true
