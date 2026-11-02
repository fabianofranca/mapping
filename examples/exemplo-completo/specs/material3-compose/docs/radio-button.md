# Radio button

Opção exclusiva de um grupo: marcar uma desmarca as outras. Use um por opção.

Tipo de anotação: `radio-button` (camada Componentes).

## Campos

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções          | Padrão  | Descrição                                                    |
| ---------- | ----------- | ------ | ----------- | --------------- | ------- | ------------------------------------------------------------ |
| `label`    | Rótulo      | string | não         |                 |         | Texto ao lado do botão (o RadioButton em si não tem rótulo). |
| `selected` | Selecionado | enum   | não         | `true`, `false` | `false` | true marca a opção.                                          |
| `enabled`  | Habilitado  | enum   | não         | `true`, `false` | `true`  | false desabilita a opção.                                    |

## Compose

- Símbolo: `androidx.compose.material3.RadioButton`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt`

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Row(
    Modifier.selectable(selected = selected, onClick = { selected = true }, role = Role.RadioButton),
    verticalAlignment = Alignment.CenterVertically,
) {
    RadioButton(
        selected = selected,
        onClick = null,    // a Row inteira recebe o toque
        enabled = true,
    )
    Text("Cartão de crédito")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> O RadioButton não tem rótulo: o `label` vira um `Text` ao lado, numa `Row`. O padrão de acessibilidade é a `Row` inteira selecionável, `Modifier.selectable(selected = <selected>, onClick = { … }, role = Role.RadioButton)`, com `RadioButton(selected = <selected>, onClick = null)` dentro; sem a `Row` selecionável, `onClick` liga à lógica da tela. Um grupo é uma `Column` (ou `Modifier.selectableGroup()`) com um RadioButton por opção. Não exige opt-in.

## Exemplos

- **Selecionado**: label=Cartão de crédito, selected=true
- **Não selecionado**: label=Boleto, selected=false
- **Desabilitado**: label=Pix, selected=false, enabled=false
