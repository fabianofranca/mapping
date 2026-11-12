# Checkbox

Caixa de seleção. Marcada, desmarcada ou indeterminada (parte de um grupo marcada).

Tipo de anotação: `checkbox` (camada Componentes).

## Campos

| Chave         | Rótulo     | Tipo   | Obrigatório | Opções                                  | Padrão      | Descrição                                                                                                                                                                                                                                |
| ------------- | ---------- | ------ | ----------- | --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`       | Rótulo     | string | não         |                                         |             | Texto ao lado da caixa (o Checkbox em si não tem rótulo).                                                                                                                                                                                |
| `state`       | Estado     | enum   | não         | `unchecked`, `checked`, `indeterminate` | `unchecked` | unchecked, checked ou indeterminate (TriStateCheckbox).                                                                                                                                                                                  |
| `enabled`     | Habilitado | enum   | não         | `true`, `false`                         | `true`      | false desabilita a caixa.                                                                                                                                                                                                                |
| `interaction` | Interação  | enum   | não         | `none`, `hovered`, `focused`, `pressed` | `none`      | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |

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
- **Mouse sobre**: label=Aceito os termos, state=unchecked, interaction=hovered
- **Com foco**: label=Lembrar de mim, state=checked, interaction=focused
- **Pressionado**: label=Selecionar tudo, state=indeterminate, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). 1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem (`docs/COMPONENT-FORMAT.md`, "Unidades e densidade"). Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Checkbox.kt` (linhas 91 a 110: `Checkbox` com traço de 2 e ponta quadrada; 267 a 306: `TriStateCheckbox`, o `minimumInteractiveComponentSize` do toque e o `padding(CheckboxDefaultPadding)`; 357 a 386: `defaultCheckboxColors`; 395 a 459: `CheckboxImpl` e o `Canvas` de `requiredSize(CheckboxSize)`; 461 a 487: `drawBox`; 489 a 523: `drawCheck`; 607 a 681: `checkmarkColor`, `boxColor` e `borderColor` por estado; 736 a 738: `CheckboxDefaultPadding` 2, `CheckboxSize` 20 e `RadiusSize` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/CheckboxTokens.kt` (linhas 24 a 76: papéis de cor `SelectedContainerColor` `Primary`, `SelectedIconColor` `OnPrimary`, `UnselectedOutlineColor` `OnSurfaceVariant`, os desabilitados `OnSurface` a 0,38 e `UnselectedOutlineWidth` 2; linhas 45 a 55 e 68 a 75: os papéis `Focus*`, `Hover*` e `Pressed*`; 56 e 57: `StateLayerShape` e `StateLayerSize`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- A caixa tem **20** por 20 e raio 2 (`CheckboxSize` e `RadiusSize` do `Checkbox.kt`, que mandam no `Canvas`; o token `ContainerHeight` de 18 não é o que o código desenha) e fica no centro da área de 48 do toque mínimo (`minimumInteractiveComponentSize`), com o rótulo logo depois, como numa `Row` com `onCheckedChange`. O rótulo usa `body-large-*` e `on-surface`.
- Marcada e indeterminada: a caixa é cheia em `primary` (o `drawBox` desenha uma só forma quando a caixa e a borda têm a mesma cor) e a marca é `on-primary`. O check é o caminho de três pontos de `drawCheck` (20% e 50%, 40% e 70%, 80% e 30% da caixa) com traço de 2 e ponta quadrada; o traço do indeterminado é a mesma linha com a cruz no centro (50% e 50%), horizontal, de 4 a 16.
- Desmarcada: sem fundo e contorno de 2 por dentro em `on-surface-variant`.
- Desabilitado: a caixa (cheia ou o contorno) vai a `on-surface` com `state-disabled-content` (0,38), em light e dark. A marca continua `on-primary` e sem diluir, porque `defaultCheckboxColors` usa `SelectedIconColor` também desabilitado (o token `SelectedDisabledIconColor`, `Surface`, não entra no código).

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `CheckboxTokens.kt` do commit define para a caixa: `hovered`, `focused` e `pressed` (não há `Dragged*` nos tokens do checkbox, então não há `dragged`).

- **Camada de estado:** o nó `estado` é um círculo de 40 (`StateLayerSize` 40, `StateLayerShape` `CornerFull`, linhas 56 e 57) centrado na caixa de 20, atrás dela, na área de 48 do toque mínimo. A cor é a do papel da caixa: `primary` marcada ou indeterminada (`SelectedHoverContainerColor`, `SelectedFocusContainerColor`, `SelectedPressedContainerColor`, linhas 45, 48 e 53) e `on-surface` desmarcada (`UnselectedHoverOutlineColor`, `UnselectedFocusOutlineColor`, `UnselectedPressedOutlineColor`, linhas 68, 70 e 74). O `opacity` vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10).
- **Contorno do desmarcado:** passa de `on-surface-variant` para `on-surface` com o mouse, o foco e o pressionado (linhas 68, 70 e 74); a largura continua 2 (`UnselectedHoverOutlineWidth`, `UnselectedFocusOutlineWidth` e `UnselectedPressedOutlineWidth` valem 2, como `UnselectedOutlineWidth`).
- **Marcada e indeterminada:** a caixa continua `primary` e a marca `on-primary` (`Selected*ContainerColor` e `Selected*IconColor` repetem os papéis do padrão); só a camada aparece.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível e o contorno não muda, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Sem ripple animado, sem transição entre estados e sem a animação do traço do check (`checkDrawFraction`): o desenho é um quadro parado do estado final. O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- Sem o estado de erro: `CheckboxTokens.kt` tem as cores `Error` dos papéis `SelectedError*` e `UnselectedError*` (linhas 34 a 44 e 61 a 67), mas o tipo não tem campo de erro; a camada e o contorno usam só os papéis normais.
- O raio 2 vem do token `corner-checkbox` (`compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/CheckboxTokens.kt`, linha 26: `ContainerShape = RoundedCornerShape(2.0.dp)`); `corner-extra-small` vale 4.
- A área é de 48 por 40: a altura de 40 vem do `sizing` do tipo, abaixo dos 48 do toque mínimo. Com `onClick = null` o Compose desenha só 24.
- O rótulo a 0,38 quando desabilitado é convenção do desenho: o `Text` do Compose herda a cor do conteúdo e não diminui sozinho.
- `CheckboxColors` próprio, os `Stroke` trocáveis e o estado de erro não são campos do tipo.
