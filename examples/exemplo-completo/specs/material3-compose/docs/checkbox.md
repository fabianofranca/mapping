# Checkbox

Caixa de seleção. Marcada, desmarcada ou indeterminada (parte de um grupo marcada).

Tipo de anotação: `checkbox` (camada Componentes).

## Campos

| Chave     | Rótulo     | Tipo   | Obrigatório | Opções                                  | Padrão      | Descrição                                                 |
| --------- | ---------- | ------ | ----------- | --------------------------------------- | ----------- | --------------------------------------------------------- |
| `label`   | Rótulo     | string | não         |                                         |             | Texto ao lado da caixa (o Checkbox em si não tem rótulo). |
| `state`   | Estado     | enum   | não         | `unchecked`, `checked`, `indeterminate` | `unchecked` | unchecked, checked ou indeterminate (TriStateCheckbox).   |
| `enabled` | Habilitado | enum   | não         | `true`, `false`                         | `true`      | false desabilita a caixa.                                 |

## Compose

- Símbolo: `androidx.compose.material3.Checkbox`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt`
- O campo `state` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `state`                       | Símbolo            |
| ----------------------------- | ------------------ |
| `unchecked`, `checked` (base) | `Checkbox`         |
| `indeterminate`               | `TriStateCheckbox` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Row(verticalAlignment = Alignment.CenterVertically) {
    Checkbox(checked = true, onCheckedChange = { /* lógica da tela */ }, enabled = true)
    Text("Lembrar de mim")
}

// state indeterminate
Row(verticalAlignment = Alignment.CenterVertically) {
    TriStateCheckbox(state = ToggleableState.Indeterminate, onClick = { /* ... */ }, enabled = true)
    Text("Selecionar tudo")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onCheckedChange` liga à lógica da tela. O Checkbox não tem rótulo: o `label` vira um `Text` ao lado, numa `Row`. O estado `indeterminate` troca para `TriStateCheckbox`.

Variante `indeterminate`: `TriStateCheckbox(state = ToggleableState.Indeterminate, onClick = …)` recebe `onClick` no lugar de `onCheckedChange`; importe `androidx.compose.ui.state.ToggleableState`. O `label` vira um `Text` ao lado, numa `Row`.

## Exemplos

- **Desmarcada**: label=Aceito os termos, state=unchecked
- **Marcada**: label=Lembrar de mim, state=checked
- **Indeterminada**: label=Selecionar tudo, state=indeterminate
