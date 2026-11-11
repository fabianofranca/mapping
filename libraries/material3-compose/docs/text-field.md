# Text field

Campo de texto. Filled tem fundo preenchido; outlined tem contorno.

Tipo de anotação: `text-field` (camada Componentes).

## Campos

| Chave            | Rótulo           | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | ------ | ----------- | -------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | Rótulo           | string | sim         |                                                                |          | Rótulo flutuante do campo.                                                                                                                                                                                                                                           |
| `value`          | Valor            | string | não         |                                                                |          | Texto digitado no campo.                                                                                                                                                                                                                                             |
| `placeholder`    | Dica             | string | não         |                                                                |          | Texto de dica quando o campo está vazio.                                                                                                                                                                                                                             |
| `supportingText` | Texto de apoio   | string | não         |                                                                |          | Texto de apoio ou de erro abaixo do campo.                                                                                                                                                                                                                           |
| `style`          | Estilo           | enum   | não         | `filled`, `outlined`                                           | `filled` | filled (TextField) ou outlined (OutlinedTextField).                                                                                                                                                                                                                  |
| `enabled`        | Habilitado       | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o campo.                                                                                                                                                                                                                                            |
| `interaction`    | Interação        | enum   | não         | `none`, `hovered`, `focused`                                   | `none`   | Aparência parada do estado de interação: mouse sobre (hovered) ou foco (focused: indicador ou contorno de 2 em primary e rótulo em primary); none = sem destaque. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |
| `isError`        | Em erro          | enum   | não         | `true`, `false`                                                | `false`  | true pinta o campo como erro.                                                                                                                                                                                                                                        |
| `singleLine`     | Linha única      | enum   | não         | `true`, `false`                                                | `false`  | true limita o campo a uma linha.                                                                                                                                                                                                                                     |
| `maxLines`       | Máximo de linhas | number | não         |                                                                |          | Limite de linhas (Int). Vazio = sem limite.                                                                                                                                                                                                                          |
| `leadingIcon`    | Ícone inicial    | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = sem ícone.                                                                                                                                                                                                                             |
| `trailingIcon`   | Ícone final      | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone depois do texto. Vazio = sem ícone.                                                                                                                                                                                                                            |
| `width`          | Largura          | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                                                                |
| `height`         | Altura           | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                                                                  |
| `weight`         | Peso (weight)    | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                                                    |

## Compose

- Símbolo: `androidx.compose.material3.TextField`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo                                              |
| --------------- | ---------------------------------------------------- |
| `filled` (base) | `TextField`                                          |
| `outlined`      | `OutlinedTextField` (arquivo `OutlinedTextField.kt`) |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
TextField(    // style outlined: OutlinedTextField (mesmos parâmetros)
    value = value,                  // estado da tela
    onValueChange = { value = it },
    enabled = true,
    isError = false,
    singleLine = true,
    label = { Text("E-mail") },
    placeholder = { Text("nome@exemplo.com") },
    supportingText = { Text("Texto de apoio") },
    leadingIcon = { Icon(Icons.Filled.Email, contentDescription = null) },
    modifier = Modifier.fillMaxWidth(),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> `value` e `onValueChange` ligam a um estado da tela. `label`, `placeholder` e `supportingText` preenchidos viram `{ Text(<campo>) }`; `leadingIcon` e `trailingIcon` viram `{ Icon(Icons.Filled.<nome>, contentDescription = null) }`. `maxLines` só entra quando preenchido; filled e outlined não exigem opt-in. Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Preenchido**: label=Nome, style=filled
- **Contornado com dica**: label=E-mail, placeholder=nome@exemplo.com, style=outlined, leadingIcon=Email, singleLine=true
- **Em erro**: label=Senha, value=123, supportingText=Mínimo de 8 caracteres, style=outlined, isError=true, trailingIcon=Lock
- **Mouse sobre**: label=Nome, value=Maria Silva, style=filled, interaction=hovered
- **Com foco**: label=E-mail, value=nome@exemplo.com, style=outlined, interaction=focused
- **Preenchido com apoio**: label=Nome, supportingText=Como aparece no seu perfil, style=filled

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, e nenhum nó de texto declara `family` (todos herdam `font-sans`).

**Arquivos usados**

- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextFieldDefaults.kt` (linhas 66 a 87: forma `FilledTextFieldTokens.ContainerShape`, `MinHeight` 56, `MinWidth` 280 e as espessuras do indicador, 1 sem foco e 2 com foco; 440 a 471: `contentPaddingWithLabel`, `contentPaddingWithoutLabel` e `supportingTextPadding`; 636 a 710: `TextFieldColors` do filled; 885 a 906: forma e espessuras do outlined; 1364 a 1453: `TextFieldColors` do outlined).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (linhas 700 a 805: `TextFieldLayout`, com o ícone numa área de 48 e o texto a `16 - 12 = 4` do ícone; 1471 a 1560: `IndicatorLineNode`, a linha de baixo do filled; 1662: `TextFieldWithLabelVerticalPadding` 8).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/OutlinedTextField.kt` (linhas 236 a 262: `padding(top = minimizedLabelHalfHeight())` e `defaultMinSize` 280 por 56; 1289 a 1355: posição do rótulo minimizado, `y = -(altura / 2)` e `x = 16`; 1406 a 1437: `outlineCutout`, o vão do contorno com 4 de folga de cada lado do rótulo).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/internal/TextFieldImpl.kt` (linhas 139 a 150: o rótulo vai de `bodyLarge` a `bodySmall` ao minimizar; 521 a 542: `TextFieldPadding` 16, `SupportingTopPadding` 4, `MinTextLineHeight` 24, `MinFocusedLabelLineHeight` 16, `MinSupportingTextLineHeight` 16).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (container `SurfaceContainerHighest` com forma `CornerExtraSmallTop`, indicador de 1, papéis de cor de rótulo, texto, apoio e ícones, opacidades do desabilitado) e `tokens/OutlinedTextFieldTokens.kt` (`ContainerHeight` 56, `ContainerShape` `CornerExtraSmall`, `OutlineWidth` 1, `OutlineColor`, `ErrorOutlineColor`, `DisabledOutlineOpacity` 0,12).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (linhas 45 a 73: os papéis `Focus*`, `Hover*`, `ErrorFocus*` e `ErrorHover*`) e `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedTextFieldTokens.kt` (linhas 42 a 70: os mesmos, mais `FocusOutlineWidth`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Campo de 56 de altura (`minHeight` do contêiner) e piso de 280 de largura (o `minSize` e o `minWidth` da raiz). O outlined soma os 8 de cima do `padding(top = minimizedLabelHalfHeight())`, por isso o contêiner dele tem no mínimo 64 e o contorno 56.
- **Altura pelo estilo e pelo texto de apoio:** `sizing.height` é uma expressão (`$switch` pelo `style`, `$if` com `$has` do `supportingText`), sem os pixels vazios de antes: filled 56 sem apoio e 76 com (56 + 4 + 16); outlined 64 sem apoio (8 + 56) e 84 com (8 + 56 + 4 + 16). Os 4 de cima do apoio são o `SupportingTopPadding` (`TextFieldDefaults.kt` linhas 466 a 470) e os 16, o `MinSupportingTextLineHeight` (`TextField.kt` linhas 797 a 801); os 8 do outlined, o `padding(top = minimizedLabelHalfHeight())` (`OutlinedTextField.kt` linhas 244 a 252). O `size` continua 280 por 84 (o do outlined com apoio, o maior); o Arrumar e o `fit_marking` levam a altura ao valor da expressão e mantêm a largura.
- **Limite de largura da raiz:** `minWidth` 280 (`defaultMinSize(minWidth = MinWidth, minHeight = MinHeight)`, `TextField.kt` linhas 305 a 308 e `OutlinedTextField.kt` linhas 257 a 260; `TextFieldDefaults.kt` linhas 81 e 900). Vale quando a largura é medida (`measureComponent`, o ajuste com a largura livre): nunca sai abaixo de 280.
- Filled: fundo `surface-container-highest` com raio superior `corner-extra-small` e indicador de 1, só na borda de baixo, por `stroke.sides: ["bottom"]` (nenhum retângulo de 1 de altura). Cor do indicador `on-surface-variant`, `error` em erro.
- Outlined: contorno de 1 com raio `corner-extra-small`, cor `outline` e `error` em erro; o contêiner é transparente.
- Rótulo: `body-large` (16/24, `body-large-tracking` 0,5) quando o campo está vazio e `body-small` (12/16, 0,4) quando há valor ou dica. No filled ele fica sobre o valor (8 de cima); no outlined, minimizado, vai para o vão do contorno, em x = 16 e centrado na linha de cima. Cor `on-surface-variant`, `error` em erro.
- Vão do contorno (outlined com valor ou dica): o contorno é um nó só, com o raio `corner-extra-small` nos quatro cantos, e o `stroke.gap` (`node` o rótulo minimizado, `padding` 4) interrompe o lado de cima onde a caixa do rótulo o atravessa, mais 4 de cada lado, como o `outlineCutout` do `OutlinedTextField.kt` (linhas 1405 a 1435, `OutlinedTextFieldInnerPadding` = 4 dp); é um vão de verdade, sem remendo com a cor do fundo, e os cantos ao lado dele seguem redondos.
- Valor e dica em `body-large`; valor `on-surface`, dica `on-surface-variant` (também em erro, como `errorPlaceholderColor`). Com `singleLine`, o valor fica numa linha, sem quebra nem reticências (`font.wrap: "none"`, `maxLines: 1`) e é recortado na largura; sem `singleLine`, quebra por palavra e `maxLines` (campo) corta nas linhas pedidas, sem reticências. `singleLine` vence `maxLines`, como no `BasicTextField`.
- Rótulo e texto de apoio quebram por palavra, sem `maxLines` nem reticências, como o `Text` do Compose.
- Ícone inicial a 12 da borda e texto a 52 (área de 48 do ícone mais 4); sem ícone o texto começa a 16. O ícone final espelha: 12 da borda. Os ícones são o nó `icon` de 24, escolhido pelo `$switch` do campo.
- Texto de apoio `body-small`, a 4 do campo e com 16 dos lados. Cor `on-surface-variant`, `error` em erro.
- Ícone inicial `on-surface-variant` (também em erro, como `errorLeadingIconColor`); ícone final `on-surface-variant`, `error` em erro.
- Desabilitado: rótulo, valor, dica, apoio e ícones em `on-surface` a 0,38 (`state-disabled-content`); indicador do filled em `on-surface` a 0,38; contorno do outlined em `on-surface` a 0,12 (`state-disabled-container`). O desabilitado vence o erro.
- Rótulo (o grande e o minimizado), dica e valor de uma linha centram pela altura da maiúscula (`font.verticalAlign: "cap-middle"`; o valor só com `singleLine`, o multilinha segue no topo). O `Text` do Compose centra pela caixa de linha da fonte; com Roboto as duas coincidem a menos de 1 px.

**Estado de interação (campo `interaction`)**

O campo escolhe a aparência parada de um estado, como o `enabled` escolhe o desabilitado; não entra no `code` nem nas `variants`. As opções são `none`, `hovered` e `focused`: os tokens do campo (`FilledTextFieldTokens.kt` e `OutlinedTextFieldTokens.kt`) definem `Hover*` e `Focus*` e nenhum `Pressed*` nem `Dragged*`, então não há `pressed` nem `dragged`.

- **Filled, com foco** (`FilledTextFieldTokens.kt`, linhas 63 a 66): o indicador de baixo passa a 2 de espessura (`FocusActiveIndicatorHeight`) em `primary` (`FocusActiveIndicatorColor`) e o rótulo vai a `primary` (`FocusLabelColor`). Em erro, o indicador e o rótulo ficam em `error` (`ErrorFocusActiveIndicatorColor` e `ErrorFocusLabelColor`, linhas 45 e 48).
- **Outlined, com foco** (`OutlinedTextFieldTokens.kt`, linhas 60 a 63): o contorno passa a 2 (`FocusOutlineWidth`) em `primary` (`FocusOutlineColor`), inclusive o lado de cima ao redor do vão do rótulo, e o rótulo vai a `primary` (`FocusLabelColor`). Em erro, `error` (`ErrorFocusOutlineColor` e `ErrorFocusLabelColor`, linhas 42 e 44).
- **Filled, com o mouse** (`FilledTextFieldTokens.kt`, linhas 70 a 73): o indicador vai a `on-surface` (`HoverActiveIndicatorColor`), ainda com 1 de espessura (`HoverActiveIndicatorHeight`); o rótulo continua `on-surface-variant` (`HoverLabelColor`). Em erro, o indicador, o rótulo e o ícone final vão a `on-error-container` (`ErrorHoverActiveIndicatorColor`, `ErrorHoverLabelColor` e `ErrorHoverTrailingIconColor`, linhas 52, 54 e 57).
- **Outlined, com o mouse** (`OutlinedTextFieldTokens.kt`, linhas 67 a 69): o contorno e o rótulo vão a `on-surface` (`HoverOutlineColor` e `HoverLabelColor`), com a espessura de 1. Em erro, o contorno, o rótulo e o ícone final vão a `on-error-container` (linhas 48, 50 e 52).
- **Sem mudança:** o texto (`on-surface`), o ícone inicial (`on-surface-variant`), o texto de apoio e o contêiner repetem os papéis de sempre nos dois estados (`Hover*` e `Focus*` de `InputColor`, `LeadingIconColor` e `SupportingColor`); o ícone final só muda no erro com o mouse.
- **Desabilitado vence:** com `enabled` `false` o `interaction` não muda cor nem espessura, então o desenho é o do desabilitado, qualquer que seja o estado.
- **Layout igual:** o indicador e o contorno de 2 ficam por dentro (`align` `inside`); o texto e o campo não se mexem.

**O que ainda difere do Compose**

- O `interaction` é um quadro parado: sem foco real, cursor, seleção, `pressed` e animação do rótulo (o rótulo só fica pequeno com valor ou dica). O Compose não define anel de foco para este tipo no commit fixado (nenhum `*Tokens.kt` dele traz `FocusIndicatorColor`): nenhum é desenhado.
- O desenho mostra a dica com o rótulo minimizado; no Compose a dica só aparece com foco (sem foco, vazio, o rótulo fica expandido e a dica some).
- O contêiner desabilitado do filled segue o código (`TextFieldDefaults.colors` usa `ContainerColor` também desabilitado), não o token `DisabledContainerOpacity` de 0,04 sobre `on-surface`.
- O vão do contorno do outlined é o `stroke.gap` do nó `contorno`; a largura dele é a da caixa do rótulo minimizado medida na arrumação, não a do `labelSize` animado do Compose. Sem valor nem dica o rótulo fica dentro do campo e o contorno não abre vão.
- O raio superior do filled é a lista de 4 raios com `$token` por item (`corner-extra-small` em cima, 0 embaixo), sem retângulo mais alto recortado.
- A largura do campo é `fill` no `sizing` (como o `fillMaxWidth()` das telas do Material): numa marcação com retângulo a raiz ocupa a caixa e o `minWidth` de 280 da raiz não muda nada, como o `minSize`; o Arrumar não mexe na largura. A altura vem do `sizing`, mas só conta uma linha de apoio (16): um apoio que quebra em duas linhas passa da caixa ajustada (o Compose cresce o campo com as linhas).
- `singleLine` mostra o começo do texto (o `BasicTextField` rola até o cursor); `maxLines` corta o texto, sem rolagem vertical.
- Sem prefixo, sufixo, contador, `labelPosition` acima, área de toque de 48 dos ícones e demais parâmetros de `TextField`.
