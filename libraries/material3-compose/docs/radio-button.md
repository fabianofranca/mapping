# Radio button

Opção exclusiva de um grupo: marcar uma desmarca as outras. Use um por opção.

Tipo de anotação: `radio-button` (camada Componentes).

## Campos

| Chave         | Rótulo      | Tipo   | Obrigatório | Opções                                  | Padrão  | Descrição                                                                                                                                                                                                                                |
| ------------- | ----------- | ------ | ----------- | --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`       | Rótulo      | string | não         |                                         |         | Texto ao lado do botão (o RadioButton em si não tem rótulo).                                                                                                                                                                             |
| `selected`    | Selecionado | enum   | não         | `true`, `false`                         | `false` | true marca a opção.                                                                                                                                                                                                                      |
| `enabled`     | Habilitado  | enum   | não         | `true`, `false`                         | `true`  | false desabilita a opção.                                                                                                                                                                                                                |
| `interaction` | Interação   | enum   | não         | `none`, `hovered`, `focused`, `pressed` | `none`  | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |

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
- **Mouse sobre**: label=Boleto, selected=false, interaction=hovered
- **Com foco**: label=Cartão de crédito, selected=true, interaction=focused
- **Pressionado**: label=Boleto, selected=false, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou opacidade fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/RadioButton.kt` (linhas 74 a 128: `RadioButton`, o `Canvas` com `padding(RadioButtonPadding)` e `requiredSize(IconSize)`, o `drawCircle` do anel e o do ponto; 163 a 180: `defaultRadioButtonColors`; 224 a 240: `radioColor` por estado; 264 a 266: `RadioButtonPadding` 2, `RadioButtonDotSize` 12 e `RadioStrokeWidth` 2).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/RadioButtonTokens.kt` (linhas 23 a 38: `IconSize` 20, `SelectedIconColor` `Primary`, `UnselectedIconColor` `OnSurfaceVariant`, os desabilitados `OnSurface` a 0,38; linhas 29 a 32 e 34 a 37: os papéis `Focus`, `Hover` e `Pressed`; 33: `StateLayerSize` 40).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Anel de 20 por 20 com traço de 2 por dentro (`drawCircle` com raio `IconSize / 2 - traço / 2` e `Stroke` de 2). O ponto selecionado é cheio e tem **10** de diâmetro: o Compose o desenha com raio `RadioButtonDotSize / 2 - traço / 2` = 5, e não os 12 do nome da constante. O anel e o ponto usam a mesma cor.
- A área é de 24 (padding de 2 em volta dos 20), o desenho de `RadioButton(onClick = null)` numa `Row` selecionável, que é a chamada deste tipo; o rótulo (`body-large-*`, `on-surface`) vem logo depois.
- Cores: selecionado `primary`; não selecionado `on-surface-variant`; desabilitado `on-surface` com `state-disabled-content` (0,38), selecionado ou não, em light e dark.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que o `RadioButtonTokens.kt` do commit define: `hovered`, `focused` e `pressed` (não há `Dragged*`, então não há `dragged`).

- **Camada de estado:** o nó `estado` é um círculo de 40 (`StateLayerSize`, linha 33) centrado no anel, atrás dele, com a cor do papel do estado: `primary` selecionado (`SelectedHoverIconColor`, `SelectedFocusIconColor`, `SelectedPressedIconColor`, linhas 29, 30 e 32) e `on-surface` não selecionado (`UnselectedHoverIconColor`, `UnselectedFocusIconColor`, `UnselectedPressedIconColor`, linhas 34, 35 e 37). O `opacity` vem dos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10).
- **Anel do não selecionado:** passa de `on-surface-variant` para `on-surface` com o mouse, o foco e o pressionado (as mesmas linhas); o selecionado continua `primary` no anel e no ponto.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível e o anel não muda, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Sem ripple animado, sem transição entre estados e sem a animação do ponto (`animateDpAsState`): o desenho é um quadro parado do estado final. O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- A camada de 40 é maior que a área de 24 do desenho e passa 8 para cada lado; a raiz recorta o que sai da caixa da instância, então a camada aparece cortada em 8 na borda esquerda. No Compose a camada sai do `selectable` da `Row` e do `minimumInteractiveComponentSize`.
- Com `onClick` preenchido o Compose aumenta a área para 48 (`minimumInteractiveComponentSize`); o desenho fica com os 24 da chamada com `onClick = null`.
- O rótulo a 0,38 quando desabilitado é convenção do desenho: o `Text` do Compose herda a cor do conteúdo e não diminui sozinho.
- `RadioButtonColors` próprio não é campo do tipo.
