# Badge

Indicador de notificação. Small é só um ponto; large mostra um contador. Ancore-o ao canto de um ícone.

Tipo de anotação: `badge` (camada Componentes).

## Campos

| Chave   | Rótulo   | Tipo   | Obrigatório | Opções           | Padrão  | Descrição                                                               |
| ------- | -------- | ------ | ----------- | ---------------- | ------- | ----------------------------------------------------------------------- |
| `count` | Contador | string | não         |                  |         | Texto do contador (por exemplo 3 ou 99+). Só vale no estilo large.      |
| `style` | Estilo   | enum   | não         | `small`, `large` | `small` | small é um ponto sem conteúdo; large é o contador com o texto de count. |

## Compose

- Símbolo: `androidx.compose.material3.Badge`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Badge.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`        | Símbolo |
| -------------- | ------- |
| `small` (base) | `Badge` |
| `large`        | `Badge` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
BadgedBox(badge = { Badge { Text("3") } }) {    // style small: badge = { Badge() }
    Icon(Icons.Filled.Notifications, contentDescription = "Notificações")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `Badge()` sem `content` desenha o ponto de 6dp. O Badge sozinho não se posiciona: para ancorá-lo ao canto de um ícone use `BadgedBox(badge = { Badge() }) { Icon(Icons.Filled.Notifications, contentDescription = …) }`, que cuida do deslocamento. Cores padrão `error` (fundo) e `onError` (texto); `containerColor` e `contentColor` só entram para mudá-las. Nem Badge nem BadgedBox exigem opt-in.

Variante `large`: `Badge(content = { Text(<count>) })` desenha o contador de 16dp, que cresce com o texto (use `99+` para valores grandes). Ancorado: `BadgedBox(badge = { Badge { Text(<count>) } }) { Icon(Icons.Filled.Notifications, contentDescription = …) }`. Não exige opt-in.

## Exemplos

- **Ponto**: style=small
- **Contador**: count=3, style=large
- **Muitos itens**: count=99+, style=large
