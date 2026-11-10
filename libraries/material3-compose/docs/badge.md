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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Badge.kt` (linhas 150 a 189: `Badge`, uma `Row` com `defaultMinSize(size, size)`, fundo na forma e, com conteúdo, `padding(horizontal = 4.dp)` e o estilo `LargeLabelTextFont`; 201: `BadgeWithContentHorizontalPadding` 4; 192 a 196: `BadgeDefaults.containerColor`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/BadgeTokens.kt` (`Size` 6, `LargeSize` 16, `Shape` e `LargeShape` = `CornerFull`, `Color` = `Error`, `LargeLabelTextColor` = `OnError`, `LargeLabelTextFont` = `LabelSmall`).

**Como o desenho segue o Compose**

- Pequeno: círculo de 6 em `error`. Com contador: pílula de 16 de altura e no mínimo 16 de largura, com 4 de padding dos lados, em `error`, com a forma `corner-full`; cresce com o texto (`99+` fica mais larga que um dígito, que fica em 16).
- O texto usa `label-small-*` (11, peso 500, linha 16, espaçamento 0,5) em `on-error`, na fonte do tema (`font-sans`), sem `family` no arquivo.
- Nos dois modos a cor vem do papel `error` e `on-error` do modo.

**O que ainda difere do Compose**

- O posicionamento no canto do ícone (`BadgedBox`, deslocamento de 6 sem conteúdo e de 12 por 14 com conteúdo) é da marcação ao redor, não deste componente.
- Sem o limite de texto do contador do Compose (quem chama corta, por exemplo `99+`).
- A altura do contador é a do texto (`hug`), com o mínimo de 16 (`minHeight`), como o `defaultMinSize` do Compose: a prova de desenho da biblioteca mede o texto com o tamanho e a linha do token do modo (`label-small-line-height`, 16), então não avisa.
