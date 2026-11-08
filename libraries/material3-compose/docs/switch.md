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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Switch.kt` (linhas 91 a 133: `Switch` com `requiredSize(SwitchWidth, SwitchHeight)`; 136 a 182: `SwitchImpl`, o `border` e o `background` do trilho e o fundo da alça; 209 a 297: `ThumbNode`, o tamanho 24 ou 16 (`hasContent || checked`) e a posição `minBound` e `maxBound`; 389 a 433: `defaultSwitchColors` (o desabilitado é `compositeOver(surface)`); 436: `IconSize` 16; 529 a 580: `thumbColor`, `trackColor`, `borderColor` e `iconColor` por estado; 624 a 629: `ThumbDiameter`, `UncheckedThumbDiameter`, `SwitchWidth`, `SwitchHeight` e `ThumbPadding`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/SwitchTokens.kt` (linhas 23 a 82: `TrackWidth` 52, `TrackHeight` 32, `TrackOutlineWidth` 2, `SelectedHandleWidth` 24, `UnselectedHandleWidth` 16, os papéis de cor de trilho, alça, contorno e ícone, `DisabledTrackOpacity` 0,12 e as opacidades de 0,38).

**Como o desenho segue o Compose**

- Trilho de 52 por 32 na forma `corner-full`. Ligado: `primary`, sem contorno. Desligado: `surface-container-highest` com contorno de 2 por dentro em `outline` (o `border` é desenhado sobre o fundo).
- Alça circular: ligada 24 em `on-primary`, a 4 da borda direita (`thumbPathLength` = 52 - 24 - 4); desligada 16 em `outline`, a 8 da esquerda ((32 - 16) / 2); desligada com ícone 24, a 4 (a alça passa a 24 quando há `thumbContent`). A alça fica no centro de uma área de 24 que o trilho põe com `padding` de 4 e `justify` no fim ou no início.
- Ícone da alça (`thumbIcon`) de 16 (`SwitchDefaults.IconSize`), nó `icon` do conjunto: `check` ligado em `on-primary-container` e `close` desligado em `surface-container-highest`.
- Desabilitado: o Compose compõe cada cor sobre a `surface` (`compositeOver(surface)`). O desenho faz o mesmo em duas camadas: a base opaca em `surface` e a cor do papel por cima com a opacidade do token: trilho ligado `on-surface` a 0,12 (`state-disabled-container`), desligado `surface-container-highest` a 0,12, contorno `on-surface` a 0,12, alça ligada `surface` (opacidade 1), alça desligada `on-surface` a 0,38 e ícones a 0,38 (`on-surface` ligado, `surface-container-highest` desligado). Light e dark seguem os mesmos tokens.

**O que ainda difere do Compose**

- Sem estados de pressionado (a alça de 28 e o recuo), foco e passar o mouse e sem a animação do deslizar da alça; o desenho é o estado final.
- O `thumbContent` do Compose é livre; o campo `thumbIcon` desenha `check` ligado e `close` desligado (o par do Material), e o `code` do tipo só passa o `check`.
- O espaço de 16 entre o rótulo e a chave e o rótulo a 0,38 quando desabilitado são convenção do desenho: o Compose não tem rótulo.
- `SwitchColors` próprio não é campo do tipo.
