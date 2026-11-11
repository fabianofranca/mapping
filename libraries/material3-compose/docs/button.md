# Button

Botão de ação. Filled é a ênfase alta, tonal e elevated a média, outlined e text a baixa.

Tipo de anotação: `button` (camada Componentes).

## Campos

| Chave         | Rótulo        | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                                                                                                                                                                |
| ------------- | ------------- | ------ | ----------- | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`       | Rótulo        | string | sim         |                                                                |          | Texto do botão.                                                                                                                                                                                                                          |
| `style`       | Estilo        | enum   | não         | `filled`, `tonal`, `outlined`, `text`, `elevated`              | `filled` | filled (Button), tonal (FilledTonalButton), outlined, text ou elevated.                                                                                                                                                                  |
| `enabled`     | Habilitado    | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o botão.                                                                                                                                                                                                                |
| `interaction` | Interação     | enum   | não         | `none`, `hovered`, `focused`, `pressed`                        | `none`   | Aparência parada do estado de interação: mouse sobre (hovered), foco (focused) ou pressionado (pressed); none = sem camada de estado. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |
| `icon`        | Ícone         | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = só texto.                                                                                                                                                                                                  |
| `width`       | Largura       | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                                    |
| `height`      | Altura        | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                                      |
| `weight`      | Peso (weight) | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                        |

## Compose

- Símbolo: `androidx.compose.material3.Button`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo             |
| --------------- | ------------------- |
| `filled` (base) | `Button`            |
| `tonal`         | `FilledTonalButton` |
| `outlined`      | `OutlinedButton`    |
| `text`          | `TextButton`        |
| `elevated`      | `ElevatedButton`    |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
Button(    // style tonal: FilledTonalButton, outlined: OutlinedButton, text: TextButton, elevated: ElevatedButton
    onClick = { /* lógica da tela */ },
    enabled = true,
    modifier = Modifier.fillMaxWidth(),    // width = fill
) {
    Icon(Icons.Filled.Add, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))   // só com icon
    Spacer(Modifier.size(ButtonDefaults.IconSpacing))
    Text("Adicionar")
}
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `onClick` liga à lógica da tela e o texto vai em `content = { Text(<label>) }`. Com `icon` preenchido, ponha antes do texto `Icon(Icons.Filled.<icon>, contentDescription = null, Modifier.size(ButtonDefaults.IconSize))` e `Spacer(Modifier.size(ButtonDefaults.IconSpacing))`. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Preenchido**: label=Salvar, style=filled
- **Contornado**: label=Cancelar, style=outlined
- **Com ícone**: label=Adicionar, style=tonal, icon=Add
- **Mouse sobre**: label=Salvar, style=filled, interaction=hovered
- **Com foco**: label=Salvar, style=elevated, interaction=focused
- **Pressionado**: label=Salvar, style=tonal, interaction=pressed
- **Rótulo longo**: label=Salvar alterações e continuar editando, style=filled

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente.

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt` (linhas 143 a 148: o `Row` com `defaultMinSize(58, 40)` e o `padding(contentPadding)`, o `contentPadding` e o estilo `labelLarge`; 479 a 543: `ContentPadding` 24/8, `ButtonWithIconContentPadding` com início 16, `TextButtonContentPadding` 12, `TextButtonWithIconContentPadding` 12/16, `MinWidth` 58, `MinHeight` 40, `IconSize` 18 e `IconSpacing` 8; 550 em diante: a forma `corner-full`; 598 a 790: as cores padrão de cada estilo; 805 a 880: as elevações; 898 a 910: `outlinedButtonBorder`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ButtonSmallTokens.kt` (`ContainerHeight` 40, `ContainerShapeRound` = `CornerFull`, `IconLabelSpace` 8, `OutlinedOutlineWidth` 1), `tokens/BaselineButtonTokens.kt` (`LeadingSpace` e `TrailingSpace` 24).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledButtonTokens.kt`, `ElevatedButtonTokens.kt`, `FilledTonalButtonTokens.kt`, `OutlinedButtonTokens.kt` e `TextButtonTokens.kt`: papéis de cor, opacidades do desabilitado (0,1; 0,12 no tonal; 0,38 no conteúdo) e `ContainerElevation` (nível 1 só no elevated).

**Como o desenho segue o Compose**

- Largura mínima 58, altura mínima 40 e forma `corner-full`; o contêiner é um retângulo atrás do conteúdo, que fica centrado.
- **Altura pelas linhas do rótulo:** `sizing.height` é `hug` e a raiz leva o mínimo de 40 (`minHeight`). O quadro `conteúdo` e o nó `rótulo` abraçam a altura, como o `Row(Modifier.defaultMinSize(58, 40).padding(contentPadding))` do `Button.kt` (linhas 143 a 148; o padding vertical `ButtonVerticalPadding` é 8, linha 469, e o `ContentPadding`, linhas 479 a 485): uma linha dá 8 + 20 + 8 = 36, que o mínimo leva a 40, e duas linhas dão 8 + 40 + 8 = 56. O Arrumar e o `fit_marking` mantêm a largura da marcação e levam a altura a esse valor.
- **O rótulo quebra no que sobra da largura:** o `maxWidth` do nó `rótulo` é a largura da instância (`$size.width`) menos os paddings dos lados e, com ícone, o ícone de 18 e os 8 de espaço (48; 24 no `text`; 66 com ícone, 54 no `text` com ícone). Um rótulo que passa disso quebra por palavra, como o `Text` do Compose dentro do `Row`.
- Padding do conteúdo: 24 dos lados e 8 em cima e embaixo (16 no início com ícone); no `text`, 12 (12 no início e 16 no fim com ícone).
- Ícone de 18 desenhado pelo nó `icon` (nome do Compose para o nome do conjunto, como no `icon`), 8 de espaço até o rótulo. O rótulo usa os tokens `label-large-*` (14, peso 500, linha 20, espaçamento 0,1) e a fonte do tema (`font-sans`), sem `family` no arquivo.
- O rótulo centra pela altura da maiúscula (`font.verticalAlign: "cap-middle"`): o nó abraça a altura da linha (20) e o quadro `conteúdo` fica centrado na altura do botão, então o centro da letra cai no centro da caixa de 40, qualquer que seja a fonte; com várias linhas, o bloco inteiro fica centrado. O `Text` do Compose centra pela caixa de linha da fonte; com a Roboto as duas coincidem a menos de 1 px.
- Cores (iguais nos dois modos, com os valores de cada um): filled `primary` / `on-primary`; tonal `secondary-container` / `on-secondary-container`; elevated `surface-container-low` / `primary`, com as duas sombras do nível 1 (ponto: `y` 1, `blur` 2; ambiente: `y` 1, `blur` 3, `spread` 1; tokens `elevation-1-point-*` e `elevation-1-ambient-*`); outlined sem fundo, conteúdo `on-surface-variant` e contorno de 1 em `outline-variant`; text sem fundo e conteúdo `primary` (o `defaultTextButtonColors` do commit usa `Primary`, não o token `OnSurfaceVariant`).
- Desabilitado: o contêiner vira `on-surface` a 0,1 (`state-disabled-container-filled`; 0,12 no tonal, `state-disabled-container`) e o conteúdo, a 0,38 (`state-disabled-content`), em `on-surface-variant` (em `on-surface` no tonal); o outlined tem o contorno a 0,1; o elevated perde a sombra.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none` e os estados que os `*ButtonTokens.kt` do commit definem para o botão: `hovered`, `focused` e `pressed` (não há `Dragged*` nos tokens do botão, então não há `dragged`).

- **Camada de estado:** o nó `estado` é um `rect` da forma do botão (`corner-full`), entre o contorno e o conteúdo, com a cor do conteúdo do estilo (`on-primary` no filled, `on-secondary-container` no tonal, `primary` no elevated e no text, `on-surface-variant` no outlined; as `*ButtonTokens.kt` repetem a cor do conteúdo em `Hovered*`, `Focused*` e `Pressed*`) e `opacity` pelos tokens `state-hover` (0,08), `state-focus` (0,10) e `state-pressed` (0,10), que espelham `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).
- **Elevação por estado** (`$if` sobre o `interaction` na sombra do contêiner, `FilledButtonTokens.kt`, `FilledTonalButtonTokens.kt` e `ElevatedButtonTokens.kt`, linhas `*ContainerElevation`): filled e tonal sobem para o nível 1 com o mouse (`HoveredContainerElevation`) e ficam no 0 no foco e pressionado; o elevated vai de 1 para 2 com o mouse e fica em 1 no foco e pressionado; outlined e text não têm sombra.
- **Desabilitado vence:** com `enabled` `false` o nó `estado` fica invisível e a elevação some, então o desenho é o do desabilitado, qualquer que seja o `interaction`.
- **Cor do contorno** (outlined): `OutlineVariant` nos três estados, igual ao padrão.

**O que ainda difere do Compose**

- Sem a forma `pressed` do Material expressivo, sem ripple animado e sem transição entre estados (o desenho é um quadro parado). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- A sombra lê os tokens de elevação (`$token` em `shadow.y` e `shadow.blur`: `elevation-1-*` na raiz e, no nível 2 do elevated com o mouse, `elevation-2-*`). O `y` e o `blur` não aceitam expressão, então a sombra do nível 2 é de um nó à parte (`sombra elevada`), visível só no elevated com o mouse sobre.
- A medida pelo conteúdo (etapa #898) cobre a altura e a quebra do rótulo; a largura de partida do rótulo é a da marcação: sem retângulo (instância nova, tela arrumada pelo `layoutScreen`) vale o `size` de 136, então um rótulo mais largo que isso quebra em vez de alargar o botão, onde o Compose, sem limite do pai, não quebra. No `size` (136 × 40) o exemplo "Rótulo longo" mostra o texto passando da caixa de 40, porque a marcação só muda por ação: o Arrumar a leva a 16 + 20 × linhas.
- `ButtonDefaults.shape` é redondo; o `shape` trocável e o `contentPadding` próprio de uma chamada não são campos do tipo.
