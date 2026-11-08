# Secure text field

Campo de senha: o texto digitado fica mascarado. Filled tem fundo preenchido; outlined tem contorno.

Tipo de anotação: `secure-text-field` (camada Componentes).

## Campos

| Chave            | Rótulo             | Tipo   | Obrigatório | Opções                                                         | Padrão   | Descrição                                                                                                                                          |
| ---------------- | ------------------ | ------ | ----------- | -------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`          | Rótulo             | string | sim         |                                                                |          | Rótulo flutuante do campo.                                                                                                                         |
| `hasText`        | Com texto digitado | enum   | não         | `true`, `false`                                                | `false`  | true mostra o campo preenchido, com os caracteres mascarados (ou escondidos). Só afeta o desenho: o texto vive no TextFieldState, não na anotação. |
| `placeholder`    | Dica               | string | não         |                                                                |          | Texto de dica quando o campo está vazio.                                                                                                           |
| `supportingText` | Texto de apoio     | string | não         |                                                                |          | Texto de apoio ou de erro abaixo do campo.                                                                                                         |
| `style`          | Estilo             | enum   | não         | `filled`, `outlined`                                           | `filled` | filled (SecureTextField) ou outlined (OutlinedSecureTextField).                                                                                    |
| `enabled`        | Habilitado         | enum   | não         | `true`, `false`                                                | `true`   | false desabilita o campo.                                                                                                                          |
| `isError`        | Em erro            | enum   | não         | `true`, `false`                                                | `false`  | true pinta o campo como erro.                                                                                                                      |
| `leadingIcon`    | Ícone inicial      | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone antes do texto. Vazio = sem ícone.                                                                                                           |
| `trailingIcon`   | Ícone final        | string | não         | texto livre; sugestões de ícones (`Home`, `Search`, `Person`…) |          | Ícone depois do texto, em geral o botão de mostrar ou esconder a senha. Vazio = sem ícone.                                                         |
| `width`          | Largura            | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a largura disponível e fixed usa a largura da marcação (dp).                                              |
| `height`         | Altura             | enum   | não         | `wrap`, `fill`, `fixed`                                        | `wrap`   | wrap ajusta ao conteúdo, fill ocupa toda a altura disponível e fixed usa a altura da marcação (dp).                                                |
| `weight`         | Peso (weight)      | number | não         |                                                                |          | Fatia do espaço que sobra numa Row ou Column (Modifier.weight). Vazio = sem peso.                                                                  |

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

## Fidelidade

Referência: Compose `material3` 1.4.0, commit `5113b82a4ed6416d6344efa50e41db8cb65928ff` (decisões 1 a 3 da etapa Material 3 fiel). A unidade é a de sempre: 1 dp = 1 px do componente. Os valores vêm dos tokens da especialização (`tokens`, nos modos `light` e `dark`), que espelham os arquivos de tokens do androidx; nenhuma cor, fonte ou raio fica literal no componente, e nenhum nó de texto declara `family` (todos herdam `font-sans`).

**Arquivos usados**

- Os mesmos do `text-field` (`TextFieldDefaults.kt`, `TextField.kt`, `OutlinedTextField.kt`, `internal/TextFieldImpl.kt`, `tokens/FilledTextFieldTokens.kt` e `tokens/OutlinedTextFieldTokens.kt`; linhas em `docs/text-field.md`), porque `SecureTextField` e `OutlinedSecureTextField` usam o mesmo decorador `TextFieldDefaults.decorator` e as mesmas cores.
- `compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/TextField.kt` (as sobrecargas `SecureTextField`, com `TextFieldLineLimits.SingleLine`) e `OutlinedTextField.kt` (`OutlinedSecureTextField`).

**Como o desenho segue o Compose**

- Tudo o que o `text-field` desenha: campo de 56, filled com fundo `surface-container-highest`, raio superior `corner-extra-small` e indicador de 1 só embaixo por `stroke.sides: ["bottom"]`; outlined com contorno de 1, raio `corner-extra-small`, 8 de cima do rótulo e vão de verdade no contorno; rótulo `body-large` ou `body-small` minimizado; apoio `body-small`; ícones de 24 pelo nó `icon`; cores de erro e desabilitado (0,38 e 0,12) iguais.
- Texto digitado: com `hasText`, oito `•` em `body-large` e `on-surface`, numa linha só, sem quebra nem reticências (o campo seguro é sempre `SingleLine`) e recortado na largura. Sem `hasText`, aparece a dica (rótulo minimizado) ou só o rótulo expandido.

**O que ainda difere do Compose**

- As mesmas diferenças do `text-field`: sem foco, cursor e animação; dica mostrada com o rótulo minimizado; cantos quadrados no vão do contorno do outlined; raio superior do filled por um retângulo recortado (a lista de 4 raios não aceita `$token`); contêiner desabilitado do filled como no código (`ContainerColor`), não o 0,04 do token; outlined com apoio pede 84 de altura e o tamanho inicial é 76.
- Os oito `•` são fixos: o Compose desenha um por caractere digitado e, com `RevealLastTyped`, mostra o último por um instante.
- Sem o ícone de mostrar ou esconder a senha: ele é o `trailingIcon` que a tela escolhe.
