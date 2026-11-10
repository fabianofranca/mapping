# Segmented button

Linha de dois a cinco segmentos para escolher uma opção (seleção única) ou várias (seleção múltipla). Cada linha de Opções é um segmento.

Tipo de anotação: `segmented-button` (camada Componentes).

## Campos

| Chave         | Rótulo     | Tipo  | Obrigatório | Opções                                  | Padrão   | Descrição                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------- | ----- | ----------- | --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`     | Opções     | table | sim         | ver Colunas abaixo                      |          | Um segmento por linha, na ordem em que aparecem (de dois a cinco).                                                                                                                                                                                                                                                         |
| `selection`   | Seleção    | enum  | não         | `single`, `multi`                       | `single` | single (SingleChoiceSegmentedButtonRow) marca um segmento; multi (MultiChoiceSegmentedButtonRow) aceita vários.                                                                                                                                                                                                            |
| `enabled`     | Habilitado | enum  | não         | `true`, `false`                         | `true`   | false desabilita os segmentos.                                                                                                                                                                                                                                                                                             |
| `interaction` | Interação  | enum  | não         | `none`, `hovered`, `focused`, `pressed` | `none`   | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Vale para o segmento selecionado (cada um dos selecionados, na seleção múltipla). Com enabled false não desenha nada (o desabilitado vence). |

Colunas de `options` (uma linha por opção):

| Chave      | Rótulo      | Tipo   | Obrigatório | Opções                                                         | Padrão  |
| ---------- | ----------- | ------ | ----------- | -------------------------------------------------------------- | ------- |
| `label`    | Rótulo      | string | sim         |                                                                |         |
| `icon`     | Ícone       | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |         |
| `selected` | Selecionado | enum   | não         | `true`, `false`                                                | `false` |

## Compose

- Símbolo: `androidx.compose.material3.SingleChoiceSegmentedButtonRow`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt`
- O campo `selection` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `selection`     | Símbolo                          |
| --------------- | -------------------------------- |
| `single` (base) | `SingleChoiceSegmentedButtonRow` |
| `multi`         | `MultiChoiceSegmentedButtonRow`  |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
SingleChoiceSegmentedButtonRow {    // selection multi: MultiChoiceSegmentedButtonRow
    // uma linha de options vira um SegmentedButton
    SegmentedButton(
        selected = false,
        onClick = { /* lógica da tela */ },
        shape = SegmentedButtonDefaults.itemShape(index = 0, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = false) },
        label = { Text("Dia") },
    )
    SegmentedButton(
        selected = true,
        onClick = { /* ... */ },
        shape = SegmentedButtonDefaults.itemShape(index = 1, count = 3),
        enabled = true,
        icon = { SegmentedButtonDefaults.Icon(active = true) },
        label = { Text("Semana") },
    )
    // ... o terceiro segmento (index = 2, count = 3)
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Um `SegmentedButton` por linha de `options`, dentro de `SingleChoiceSegmentedButtonRow { … }`: `selected`, `onClick`, `shape = SegmentedButtonDefaults.itemShape(index = <posição da linha>, count = <número de linhas>)` (obrigatório), `enabled = <enabled>` (parâmetro do segmento, não da linha), `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` (o check) e `label = { Text(<label>) }`. Com a coluna `icon` preenchida, passe `inactiveContent = { Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(SegmentedButtonDefaults.IconSize)) }` ao `SegmentedButtonDefaults.Icon`. O `SegmentedButton` é função de extensão do escopo da linha: importe `androidx.compose.material3.SegmentedButton`. Nenhum tipo exige opt-in. A 1.4.0 não traz os ícones: o app adiciona `androidx.compose.material:material-icons-core` (ou `-extended`) ou usa um Material Symbol com `painterResource`.

Variante `multi`: Um `SegmentedButton` por linha de `options`, dentro de `MultiChoiceSegmentedButtonRow { … }`, com `checked = <selected>` e `onCheckedChange` no lugar de `selected` e `onClick` (cada segmento liga e desliga sozinho); `shape = SegmentedButtonDefaults.itemShape(index = <posição da linha>, count = <número de linhas>)`, `enabled = <enabled>`, `icon = { SegmentedButtonDefaults.Icon(active = <selected>) }` e `label = { Text(<label>) }`. Importe `androidx.compose.material3.SegmentedButton`.

## Exemplos

- **Seleção única**: selection=single
- **Seleção múltipla**: selection=multi
- **Desabilitado**: selection=single, enabled=false
- **Mouse sobre**: selection=single, interaction=hovered
- **Com foco**: selection=multi, interaction=focused
- **Pressionado**: selection=single, interaction=pressed

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt` (linhas 130 a 170 e 210 a 250: o `SegmentedButton` com `weight(1f)`, `defaultMinSize` de `ButtonDefaults.MinWidth` e `MinHeight` e o `Surface` com a `border`; 328 a 347 e 364 a 381: as linhas, com `Arrangement.spacedBy(-space)` que sobrepõe os segmentos em 1 (a borda) e altura mínima de `ContainerHeight`; 383 a 462: `SegmentedButtonContent`, com o ícone de 18, `IconSpacing` 8 e o conjunto centrado; 541 a 567: as cores padrão (selecionado `SelectedContainerColor`, borda `OutlineColor`, desabilitado com `DisabledLabelTextOpacity` e `DisabledOutlineOpacity`); 582 a 611: `BorderWidth`, `itemShape` (forma full só nas pontas), `IconSize` e `ContentPadding`; 614 a 622: o `ActiveIcon` é o `Icons.Filled.Check`; 841: `IconSpacing`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedSegmentedButtonTokens.kt` (linhas 25 a 54: `ContainerHeight` 40, `OutlineWidth` 1, `Shape` `CornerFull`, `LabelTextFont` `LabelLarge`, `IconSize` 18, e os papéis selecionado e desmarcado).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (linhas 479 a 543: `TextButtonContentPadding` 12 e 8, `MinWidth` 58 e `MinHeight` 40).

**Como o desenho segue o Compose**

- Linha de 40 de altura e forma `corner-full`; os segmentos são o `repeat` de `options` com `distribute: fill`, de largura igual, cada um com o mínimo de 58.
- Selecionado: fundo `secondary-container`, rótulo e check `on-secondary-container`. Desmarcado: sem fundo, rótulo e ícone `on-surface`. O check é o nó `icon` de 18 e substitui o ícone da coluna; o rótulo usa os tokens de `label-large` (14, 20, 500 e 0,1).
- O ícone (18) e o rótulo ficam separados por 8 e o conjunto é centrado no segmento, com o espaço de `TextButtonContentPadding` (12 dos lados, 8 em cima e embaixo). Sem ícone e desmarcado, só o rótulo, centrado.
- Contorno de 1 em `outline`, dentro da caixa e com a forma full; o `clip` da raiz arredonda as pontas do fundo do selecionado. Entre os segmentos há um divisor de 1 em `outline` (a borda dupla do Compose, sobreposta em 1).
- Desabilitado: contorno e divisores `outline` a `state-disabled-container` (0,12, como `disabledActiveBorderColor` e `disabledInactiveBorderColor`: o código usa `OutlineColor`, não o `on-surface` que o token cita), rótulo e ícone `on-surface` a `state-disabled-content` (0,38) e o fundo do selecionado continua `secondary-container` (`disabledActiveContainerColor`).
- Rótulo de uma linha centrado pela maiúscula (`cap-middle`): o nó `rótulo` usa `font.verticalAlign: "cap-middle"` e ocupa a altura da caixa (`height: "fill"`), sem mudar a posição horizontal. O `Text` do Compose centra pela caixa de linha da fonte (ascent e descent); o desenho centra a altura da maiúscula na caixa, e com o Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `OutlinedSegmentedButtonTokens.kt` do commit definem: `hovered`, `focused` e `pressed` (não há `Dragged*` nos tokens do segmentado, então não há `dragged`).

- **Camada de estado:** o nó `estado` é um `rect` do tamanho do segmento, entre o fundo e o conteúdo, com a cor do conteúdo do segmento selecionado, `on-secondary-container` (`SelectedHoverLabelTextColor`, `SelectedFocusLabelTextColor`, `SelectedPressedLabelTextColor` e os `Selected*IconColor`, linhas 36 a 42 de `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedSegmentedButtonTokens.kt`) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25). As pontas da linha ficam arredondadas porque a raiz recorta.
- **Qual segmento:** a camada cai no segmento **selecionado**; na seleção múltipla, em cada um dos selecionados. Não há campo de índice para escolher outro. Sem nenhum segmento selecionado o estado não desenha nada: o formato do componente não tem índice da linha nem consulta ao conjunto das linhas, então "o primeiro, se nenhum estiver selecionado" não é expressável.
- **Cor do conteúdo:** o rótulo e o ícone do segmento mantêm a cor parada em todos os estados (os tokens repetem `on-secondary-container` no selecionado e `on-surface` no desmarcado). Elevação e contorno não mudam com o estado nos tokens do segmentado.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível, então o desenho é o do desabilitado, qualquer que seja o `interaction`.

**O que ainda difere do Compose**

- Os segmentos se encostam e o divisor é o lado esquerdo de cada um (o do primeiro fica fora da caixa), em vez de se sobrepor em 1: a largura de cada segmento é `(largura + 1) / n`, e não `(largura + n - 1) / n`, então a fronteira cai a menos de 1 do Compose.
- A linha ocupa a largura da marcação (`fill`); o Compose usa `width(IntrinsicSize.Min)` e mede os segmentos pelo conteúdo.
- O rótulo não corta nem quebra de propósito; um rótulo maior que o segmento avisa `texto maior que a caixa`. O Compose só limita pelo `Row`.
- Os estados de interação são quadros parados: sem ripple animado, sem transição e sem o movimento da troca do check e do deslocamento do rótulo (`SegmentedButtonContentMeasurePolicy` anima o `offsetX`). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado. O estado vale só para o segmento selecionado (ver "Qual segmento").
- O `selection` não muda o desenho (single e multi usam o mesmo check); só muda o símbolo do código.
