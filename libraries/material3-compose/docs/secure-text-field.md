# Secure text field

Campo de senha: o texto digitado fica mascarado. Filled tem fundo preenchido; outlined tem contorno.

Tipo de anotação: `secure-text-field` (camada Componentes).

## Campos

| Chave            | Rótulo             | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                                                                                                                                                                                            |
| ---------------- | ------------------ | ------ | ----------- | -------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | Rótulo             | string | sim         |                                                                |          | Rótulo flutuante do campo.                                                                                                                                                                                                                                           |
| `hasText`        | Com texto digitado | enum   | não         | `true`, `false`                                                | `false`  | true mostra o campo preenchido, com os caracteres mascarados (ou escondidos). Só afeta o desenho: o texto vive no TextFieldState, não na anotação.                                                                                                                   |
| `placeholder`    | Dica               | string | não         |                                                                |          | Texto de dica quando o campo está vazio.                                                                                                                                                                                                                             |
| `supportingText` | Texto de apoio     | string | não         |                                                                |          | Texto de apoio ou de erro abaixo do campo.                                                                                                                                                                                                                           |
| `style`          | Estilo             | enum   | não         | `filled`, `outlined`                                           | `filled` | filled (SecureTextField) ou outlined (OutlinedSecureTextField).                                                                                                                                                                                                      |
| `enabled`        | Habilitado         | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o campo.                                                                                                                                                                                                                                            |
| `interaction`    | Interação          | enum   | não         | `none`, `hovered`, `focused`                                   | `none`   | Aparência parada do estado de interação: mouse sobre (hovered) ou foco (focused: indicador ou contorno de 2 em primary e rótulo em primary); none = sem destaque. Só muda o desenho, não entra no código. Com enabled false não desenha nada (o desabilitado vence). |
| `isError`        | Em erro            | enum   | não         | `true`, `false`                                                | `false`  | true pinta o campo como erro.                                                                                                                                                                                                                                        |
| `leadingIcon`    | Ícone inicial      | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = sem ícone.                                                                                                                                                                                                                             |
| `trailingIcon`   | Ícone final        | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone depois do texto, em geral o botão de mostrar ou esconder a senha. Vazio = sem ícone.                                                                                                                                                                           |
| `width`          | Largura            | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                                                                                                                                                |
| `height`         | Altura             | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                                                                                                                                  |
| `weight`         | Peso (weight)      | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                                                                                                                                    |

## Compose

- Símbolo: `androidx.compose.material3.SecureTextField`
- Arquivo (`path`): `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SecureTextField.kt`
- O campo `style` escolhe o símbolo; os valores sem caso próprio usam o da base.

| `style`         | Símbolo                   |
| --------------- | ------------------------- |
| `filled` (base) | `SecureTextField`         |
| `outlined`      | `OutlinedSecureTextField` |

Como a anotação vira a chamada (os valores abaixo são de exemplo; os nomes dos parâmetros e as expressões são os de `params` e `values` do `code`):

```kotlin
var showPassword by remember { mutableStateOf(false) }
SecureTextField(    // style outlined: OutlinedSecureTextField (mesmos parâmetros)
    state = rememberTextFieldState(),    // guarda o texto digitado
    enabled = true,
    isError = false,
    label = { Text("Senha") },
    supportingText = { Text("Mínimo de 8 caracteres") },
    leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
    textObfuscationMode = if (showPassword) TextObfuscationMode.Visible else TextObfuscationMode.RevealLastTyped,
    modifier = Modifier.fillMaxWidth(),
)
```

Notas do `code` (o que a ferramenta entrega ao agente):

> Estável, sem opt-in. Em vez de `value`/`onValueChange`, o campo recebe `state = rememberTextFieldState()` (`androidx.compose.foundation.text.input.TextFieldState`), que guarda o texto; `hasText` só afeta o desenho e não é parâmetro. `label`, `placeholder` e `supportingText` preenchidos viram `{ Text(<campo>) }`; `leadingIcon` e `trailingIcon` viram `{ Icon(Icons.Filled.<nome>, contentDescription = null) }` (para mostrar e esconder a senha, ligue o ícone a um `textObfuscationMode` que alterne `TextObfuscationMode.Visible` e `TextObfuscationMode.RevealLastTyped`). Tamanho: `fill` vira `Modifier.fillMaxWidth()`/`fillMaxHeight()`, `fixed` vira `Modifier.width(<largura da marcação>.dp)`/`height(<altura da marcação>.dp)` e `weight` vira `Modifier.weight(<weight>f)` (só dentro de Row, Column ou FlowRow).

## Exemplos

- **Preenchido**: label=Senha, style=filled
- **Contornado com texto**: label=Senha, hasText=true, style=outlined, leadingIcon=Lock, trailingIcon=Done
- **Em erro**: label=Senha, hasText=true, supportingText=Senha incorreta, style=outlined, isError=true
- **Mouse sobre**: label=Senha, hasText=true, style=outlined, interaction=hovered
- **Com foco**: label=Senha, hasText=true, style=filled, interaction=focused
- **Preenchido com apoio**: label=Senha, supportingText=Mínimo de 8 caracteres, style=filled

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, e nenhum nó de texto declara `family` (todos herdam `font-sans`).

**Arquivos usados**

- Os mesmos do `text-field` (`TextFieldDefaults.kt`, `TextField.kt`, `OutlinedTextField.kt`, `internal/TextFieldImpl.kt`, `tokens/FilledTextFieldTokens.kt` e `tokens/OutlinedTextFieldTokens.kt`; linhas em `docs/text-field.md`), porque `SecureTextField` e `OutlinedSecureTextField` usam o mesmo decorador `TextFieldDefaults.decorator` e as mesmas cores.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (as sobrecargas `SecureTextField`, com `TextFieldLineLimits.SingleLine`) e `OutlinedTextField.kt` (`OutlinedSecureTextField`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/FilledTextFieldTokens.kt` (linhas 45 a 73: os papéis `Focus*`, `Hover*`, `ErrorFocus*` e `ErrorHover*`) e `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/OutlinedTextFieldTokens.kt` (linhas 42 a 70: os mesmos, mais `FocusOutlineWidth`).
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt` (linhas 22 a 25: `HoverStateLayerOpacity`, `FocusStateLayerOpacity`, `PressedStateLayerOpacity`; `DraggedStateLayerOpacity` 0,16 é o `state-dragged`).

**Como o desenho segue o Compose**

- Tudo o que o `text-field` desenha: campo de 56, filled com fundo `surface-container-highest`, raio superior `corner-extra-small` e indicador de 1 só embaixo por `stroke.sides: ["bottom"]`; outlined com contorno de 1, raio `corner-extra-small`, 8 de cima do rótulo e vão de verdade no contorno (`stroke.gap` sobre o rótulo minimizado, cantos redondos); rótulo `body-large` ou `body-small` minimizado; apoio `body-small`; ícones de 24 pelo nó `icon`; cores de erro e desabilitado (0,38 e 0,12) iguais.
- **Altura e largura:** as do `text-field` (`sizing.height` por expressão, `minWidth` 280 na raiz): filled 56 sem apoio e 76 com (56 + 4 + 16), outlined 64 sem apoio (8 + 56) e 84 com (8 + 56 + 4 + 16); o `size` continua 280 por 84. O `SecureTextField` tem o mesmo `defaultMinSize(TextFieldDefaults.MinWidth, MinHeight)` (`SecureTextField.kt` linhas 173 a 176) e o mesmo apoio (`TextFieldDefaults.kt` linhas 466 a 470, `TextField.kt` linhas 797 a 801); o `OutlinedSecureTextField` soma os 8 de cima do rótulo (`OutlinedTextField.kt` linhas 244 a 260).
- Texto digitado: com `hasText`, oito `•` em `body-large` e `on-surface`, numa linha só, sem quebra nem reticências (o campo seguro é sempre `SingleLine`) e recortado na largura. Sem `hasText`, aparece a dica (rótulo minimizado) ou só o rótulo expandido.
- Rótulo (o grande e o minimizado), dica e os oito `•` do valor centram pela altura da maiúscula (`font.verticalAlign: "cap-middle"`). O `Text` do Compose centra pela caixa de linha da fonte; com Roboto as duas coincidem a menos de 1 px.

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

- As mesmas diferenças do `text-field`: o `interaction` é um quadro parado (sem foco real, cursor, `pressed` e animação do rótulo; sem anel de foco (o Compose não define `FocusIndicatorColor` para ele no commit fixado); dica mostrada com o rótulo minimizado; raio superior do filled pela lista de 4 raios com `$token` por item; contêiner desabilitado do filled como no código (`ContainerColor`), não o 0,04 do token; o `size` é 84 (o do outlined com apoio) e a altura vem do `sizing`, que só conta uma linha de apoio (um apoio de duas linhas passa da caixa ajustada); a largura é `fill` no `sizing`, então o `minWidth` de 280 da raiz só age quando a largura é medida.
- Os oito `•` são fixos: o Compose desenha um por caractere digitado e, com `RevealLastTyped`, mostra o último por um instante.
- Sem o ícone de mostrar ou esconder a senha: ele é o `trailingIcon` que a tela escolhe.
