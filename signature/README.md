# signature/: o extrator de fichas de assinatura (`mapping-signature`)

Uma CLI em Node, sem dependência, que lê o **código-fonte** de uma função `@Composable` (Kotlin) ou de uma `struct` SwiftUI, ou o **JSON de um nó do Figma**, e imprime a **ficha de assinatura** dele (`mapping-signature`, `formatVersion` 1; formato em [`docs/SIGNATURE-FORMAT.md`](../docs/SIGNATURE-FORMAT.md)). É o `source.extractor: "mapping-signature/<leitor>@1"` da ficha, e há três leitores: `kotlin`, `swift` e `figma`. Os três dão fichas do mesmo formato, importadas pela mesma tool.

O servidor MCP **nunca lê código**; quem lê é este script, na máquina do dono, no repositório dele. O que ele devolve é só o JSON que a especialização cita em `signature`.

## Uso

```bash
node tools/mapping-signature.mjs kotlin --file <arquivo.kt> --symbol <nome> [--path <relativo ao repositório>] [--ref <commit>]
                                 [--also <arquivo.kt>]... [--overload <n>] [--out <ficha.json>]
node tools/mapping-signature.mjs swift  --file <arquivo.swift> --symbol <nome> [--path <relativo ao repositório>] [--ref <commit>]
                                 [--also <arquivo.swift>]... [--init <n>] [--out <ficha.json>]
node tools/mapping-signature.mjs figma  --file <nós.json> --node <id> [--out <ficha.json>]
node tools/mapping-signature.mjs --help
```

No repositório do Mapping, depois do `npm run build:signature` (ou do `build:mcp`), os dois arquivos saem em `dist-mcp/`: `mapping-signature.js` (CommonJS, o que os roteiros chamam) e `mapping-signature.mjs` (ESM, o que a Release publica e o `setup.sh` instala em `tools/`). Os dois são o mesmo código e dão a mesma saída, byte a byte.

| Opção                | O que faz                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--file <arquivo>`   | O arquivo que define a função (`kotlin`), a struct (`swift`) ou o JSON do Figma (`figma`).                                                                                    |
| `--symbol <nome>`    | O nome da função, simples (`Button`) ou completo (`androidx.compose.material3.Button`). O prefixo, se vier, tem de ser o `package` do arquivo.                                |
| `--path <caminho>`   | Vai em `source.path` (relativo à raiz do repositório). Sem ele vale o `--file`, se for relativo (com `/` e sem `./` na frente); `--file` absoluto sem `--path` é erro de uso. |
| `--ref <commit>`     | Vai em `source.ref`. Sem ele a chave não existe: o extrator não inventa.                                                                                                      |
| `--also <arquivo>`   | Outro arquivo onde procurar `object …Defaults` (fábricas) e `enum class`. Repetível; a ordem conta.                                                                           |
| `--overload <n>`     | A sobrecarga a usar (0 em diante, na ordem do arquivo, **contando as `@Deprecated`**). Vai em `source.overload`.                                                              |
| `--init <n>`         | `swift`: o `init` a usar (0 em diante, na ordem da struct, **contando os `deprecated`**). Vai em `source.init`. Sem `init` escrito, `0` é o memberwise.                       |
| `--node <id>`        | `figma`: o id do nó (`12:34`; `12-34`, como vem na URL, também vale).                                                                                                         |
| `--out <ficha.json>` | Grava a ficha neste arquivo em vez de imprimir. É o **único** arquivo que o script grava: ele cria o arquivo, não cria pastas.                                                |

`source.symbol` é sempre `<package do arquivo>.<nome>` (só o nome, se o arquivo não declara `package`). A ficha sai com 2 espaços de indentação, as chaves na ordem do tipo (`src/model/signatures/types.ts`) e `\n` no fim.

Códigos de saída: **0** ok; **1** erro de extração (sintaxe, símbolo ou nó ausente, sobrecarga ou `init` ambíguo, arquivo ilegível, ficha que não passa no `parseSignature`); **2** erro de uso (argumento faltando ou desconhecido, leitor desconhecido, opção que não é do leitor: `a opção --init não vale para kotlin (vale para swift)`). As mensagens vão para o stderr, em português; o erro de sintaxe sai como `<arquivo>:<linha>:<coluna>: <mensagem>`.

Antes de escrever, a ficha passa no `parseSignature` (o mesmo do importador e do `validate_library`); se falhar, o erro é interno (exit 1) e nada é impresso nem gravado.

## O que o leitor Kotlin faz

1. **Tokeniza** o arquivo inteiro: parênteses, colchetes, chaves, strings (`"…"` com escape, `"""…"""`, `${…}` aninhado), caracteres, comentários `//` e `/* */` (que aninham; o KDoc `/** */` é guardado para o `doc`). Delimitador, string ou comentário não fechado é erro com a linha e a coluna do abridor.
2. **Candidatas:** toda `fun [<T>] [Receptor.]Nome(` anotada com `@Composable` (antes ou depois de outras anotações e modificadores, na mesma linha ou em linhas separadas). `@Composable` dentro do tipo de um parâmetro não conta; função de mesmo nome sem `@Composable` é ignorada.
3. **Sobrecargas:** as `@Deprecated` saem. Sobrando uma, é ela. Sobrando mais de uma (ou nenhuma) e sem `--overload`, o erro começa com `sobrecarga ambígua:` e lista **todas** as candidatas, uma por linha: `  <índice>: linha <n> [@Deprecated] (<nomes dos parâmetros>)`. Com `--overload n`, vale a n-ésima da lista completa; índice fora da lista é erro com a lista.
4. **Parâmetros** (`[anotações] [vararg|noinline|crossinline] nome: Tipo [= padrão]`, vírgula final aceita): `type` e `default` são o texto da fonte com os espaços normalizados (a quebra de linha junto de `( [ < .` ou de `) ] > , .` some; em outro lugar vira um espaço); `required: true` quando não há padrão.
5. **`role`:** `Modifier` → `modifier`; tipo-função (tem `->` no nível de cima, com ou sem parênteses e `?`) → `slot` se for `@Composable`, senão `callback`; tipo terminado em `InteractionSource`, `State`, `FocusRequester` ou `ScrollBehavior` (sem os argumentos de genérico) → `state`, salvo se o tipo for um `enum class` conhecido (do arquivo ou dos `--also`): o enum vence o sufixo (`role: value`, `kind: enum`); `vararg` → `other` (com `type: "vararg <T>"`); o resto → `value`.
6. **`value.kind`** (só em `role: value`): `String`/`AnnotatedString` → `text`; `Boolean` → `boolean`; `Int`/`Long`/`Short`/`Byte` → `integer`; `Float`/`Double` → `number`; `Dp` → `dimension`; `Color` → `color`; `enum class` do mesmo arquivo ou dos `--also` → `enum` com `options` (as constantes, na ordem da declaração); o resto → `opaque`. O `?` final não muda o kind.
7. **`value.default`** só para literal representável: `true`/`false`; string simples (sem `$` nem `\`); inteiro (`3`, `1_000`, `10L`); decimal (`0.5f`, `1.0`); `16.dp`/`16.0.dp` → 16; `Enum.CONSTANTE` do enum conhecido. `null`, `Modifier`, `ButtonDefaults.shape` e outras expressões ficam só no `default` em texto do parâmetro.
8. **Fábricas:** um padrão `Objeto.fabrica(...)` leva `factory` se houver `fun fabrica(` no corpo de `object Objeto { … }` do mesmo arquivo ou dos `--also`. Entre as de mesmo nome, descartam-se as `@Deprecated` e fica a de **mais parâmetros** (empate: a primeira); sem parâmetros, sem `factory`. `call` é `<package do arquivo onde achou>.Objeto.fabrica`. O parâmetro com fábrica não tem `value`, e a fábrica não tem fábrica dentro (um nível só).
9. **`doc`:** o KDoc colado na declaração, um `@param nome texto…` por parâmetro (as continuações viram um texto só). Só entram parâmetros que existem; os da fábrica vão como `doc["<param>.<paramDaFábrica>"]` (`colors.containerColor`). Sem nada, a chave não existe.

## O que o leitor Swift faz

Usa o mesmo tokenizador do Kotlin (o dialeto Swift lê `///` como doc e a interpolação `\(…)` das strings).

1. **Candidata:** `struct <Nome>` (com ou sem genéricos e `: View`) no nível de cima do arquivo ou dentro de outro tipo. `--symbol` é o nome simples (`ProfileCard`) ou qualificado (`DS.ProfileCard`); o texto vai como veio em `source.symbol`, e o prefixo só desambigua structs de mesmo nome (pelo tipo que as envolve).
2. **`init`:** os `init(...)` escritos **na struct** (não os de `extension`), na ordem do arquivo. Com um só, é ele; com mais de um e sem `--init`, o erro começa com `init ambíguo:` e lista **todos**, `  <índice>: linha <n> [deprecated] (<rótulos>)`. Um `@available(… deprecated|unavailable|obsoleted)` conta como o `@Deprecated` do Kotlin: aparece na lista e sai da escolha automática. Sem nenhum `init` escrito vale o **memberwise**, e `--init 0` o escolhe.
3. **Memberwise:** as propriedades armazenadas, na ordem da declaração: `let` sem valor e `var`. Ficam de fora `@State`, `@StateObject`, `@Environment`, `@EnvironmentObject`, `@FocusState` (e qualquer wrapper com argumentos, como `@AppStorage("k")`), `private`/`fileprivate`, `static`/`class`, `lazy`, `let` com valor e as computadas. `var x: T?` sem valor ganha `default: "nil"`; `var x = 0` sem tipo usa o tipo do literal (ou `_`).
4. **Rótulos:** em `init(_ title: String, badge badgeCount: Int)`, `name` é o nome **interno** (`title`, `badgeCount`) e `label` o externo (`_` para o posicional, `badge`); sem rótulo escrito, o externo é o próprio nome e a chave `label` não existe.
5. **`role`:** tipo-função (`->`) → `slot` se tem `@ViewBuilder` (ou devolve view), senão `callback` (`@escaping` e `Optional` valem); `some View`, `AnyView` e genérico `<C: View>`/`where C: View` → `slot`; `@Binding var x: T` vira `Binding<T>`, e `@ObservedObject`/`@Bindable` → `state`; o resto → `value`.
6. **`value.kind`:** `String`, `LocalizedStringKey`, `AttributedString` → `text`; `Bool` → `boolean`; `Int`… → `integer`; `Double`, `Float` → `number`; `CGFloat` → `dimension`; `Color` → `color`; `enum` do mesmo arquivo (ou dos `--also`) → `enum` com `options` (os `case`, na ordem; valor associado → `opaque`); o resto → `opaque`. O `?` final não muda o kind.
7. **`value.default`** só para literal: `true`/`false`, string simples, inteiro, decimal, `CGFloat(8)` e `.caso`/`Enum.caso` do enum conhecido (vira a opção: `.compact` → `compact`). `nil` e outras expressões ficam só no `default` em texto do parâmetro.
8. **`doc`:** o `- Parameter nome:`/`- Parameters:` do `///` do `init`, depois o da struct e, por último, o `///` da propriedade (a chave é o nome interno; o rótulo externo também acha).

## O que o leitor Figma faz

Lê o JSON salvo (não abre rede nem o MCP do Figma) e acha o nó em qualquer lugar dele, por `id` + `type`: a resposta de `GET /v1/files/:key/nodes`, a do arquivo inteiro ou o nó solto servem, **desde que o nó traga `id`, `type` e `componentPropertyDefinitions`** (o que o MCP do Figma devolve não foi conferido: salve nesse formato).

- `VARIANT` → `enum` com `variantOptions` em `options`; `BOOLEAN` → `boolean`; `TEXT` → `text`; `INSTANCE_SWAP` → `slot` (sem `default` nem `required`); tipo que o leitor não conhece → `role: other`. O `defaultValue` vai em `default` (e `value.default`); a `description` da propriedade vai para o `doc`.
- O sufixo `#<id>` do nome (`Disabled#1:2`) sai de `name` e vai para o `id` do parâmetro.
- `source` é `{ kind: "design", system: "figma", id, name }` do nó (sem `path`, `ref` nem `symbol`): ao importar, a ficha liga `sources` do tipo, não `code`.
- Variante (um `COMPONENT` sem definições, filho de um `COMPONENT_SET`) é erro apontando o `COMPONENT_SET`; nó que não existe também.

## Determinismo

A mesma entrada dá os mesmos bytes: a ficha não leva data, caminho absoluto nem nada que dependa de locale, e as chaves saem na ordem fixa do tipo. Dois testes provam isso (duas execuções; `.js` contra `.mjs`).

## Segurança

O script não abre rede (`net`, `http(s)`, `dns`, `child_process`, `fetch`, `WebSocket` não aparecem nem no código nem no bundle) e não grava nada fora do `--out`: só `readFileSync` do `--file` e dos `--also`. O ESLint proíbe os módulos de rede e as funções de escrita fora do `cli.ts`, e `tests/signature/staticGuards.test.ts` confere o código, o bundle e a árvore de pastas antes e depois de uma execução. De `src/` só se importa `src/model/` (a ficha e o `parseSignature`).

## Limites conhecidos

O leitor não é um compilador: lê o cabeçalho das funções, não resolve nada.

- **Tipos de outros arquivos:** só os `enum class` do arquivo e dos `--also` viram `enum`; qualquer outro tipo (`Shape`, `PaddingValues`, `BorderStroke`, `TextUnit`, `WindowInsets`, `TextStyle`, `typealias`, classes) é `opaque`. O mesmo vale para **genéricos** (`List<String>`) e para parâmetro com **anotação própria** (`@FloatRange(…)`: o texto da anotação fica no começo de `type`).
- **Padrões:** só os literais acima viram `value.default`; constantes (`DEFAULT`, `Dp.Unspecified`), cálculos e `stringResource(…)` ficam só no `default` em texto. Hexadecimal e string com `$` ou escape não são literais representáveis.
- **Fábricas:** só o formato `Objeto.fabrica(...)` com `Objeto` começando em maiúscula; função de extensão, `companion object` sem nome e fábrica em objeto de outro módulo (sem `--also`) ficam sem `factory`.
- **Tipos:** `typealias` e o nome qualificado só pelo último segmento (`androidx.…Color` vale `Color`); um tipo com o mesmo nome de outro (`Color` do seu projeto) é lido como o `Color` do Compose.
- **Candidatas:** vale o nome, em qualquer nível do arquivo (função de classe ou de objeto também). `expect`/`actual` aparecem como duas candidatas (use `--overload`).
- **`<` em padrões:** só abre genérico quando cola no identificador (`listOf<A>()`); `a<b` sem espaços seria lido como genérico.
- **Swift:** só os `init` escritos na struct (os de `extension` e os dentro de `#if` não são lidos); string com `#"…"#` não é tokenizada; struct duplicada com o mesmo nome e sem prefixo em `--symbol` é ambígua; `enum` e tipos de outros arquivos só valem com `--also`.
- **Figma:** só as `componentPropertyDefinitions` do nó; os filhos e as variantes não são lidos.
