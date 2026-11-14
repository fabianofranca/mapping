# signature/: the signature sheet extractor (`mapping-signature`)

A dependency-free Node CLI that reads the **source code** of a `@Composable` function (Kotlin) or of a SwiftUI `struct`, or the **JSON of a Figma node**, and prints its **signature sheet** (`mapping-signature`, `formatVersion` 1; format in [`docs/SIGNATURE-FORMAT.md`](../docs/SIGNATURE-FORMAT.md)). It is the sheet's `source.extractor: "mapping-signature/<reader>@1"`, and there are three readers: `kotlin`, `swift` and `figma`. All three produce sheets of the same format, imported by the same tool.

The MCP server **never reads code**; this script does, on the owner's machine, in the owner's repository. All it returns is the JSON that the specialization cites in `signature`.

## Usage

```bash
node tools/mapping-signature.mjs kotlin --file <file.kt> --symbol <name> [--path <relative to the repository>] [--ref <commit>]
                                 [--also <file.kt>]... [--overload <n>] [--out <sheet.json>]
node tools/mapping-signature.mjs swift  --file <file.swift> --symbol <name> [--path <relative to the repository>] [--ref <commit>]
                                 [--also <file.swift>]... [--init <n>] [--out <sheet.json>]
node tools/mapping-signature.mjs figma  --file <nodes.json> --node <id> [--out <sheet.json>]
node tools/mapping-signature.mjs --help
```

In the Mapping repository, after `npm run build:signature` (or `build:mcp`), the two files land in `dist-mcp/`: `mapping-signature.js` (CommonJS, what the scripts call) and `mapping-signature.mjs` (ESM, what the Release publishes and `setup.sh` installs in `tools/`). Both are the same code and give the same output, byte for byte.

| Option               | What it does                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--file <file>`      | The file that defines the function (`kotlin`), the struct (`swift`) or the Figma JSON (`figma`).                                                                                              |
| `--symbol <name>`    | The function name, simple (`Button`) or full (`androidx.compose.material3.Button`). The prefix, if present, must be the file's `package`.                                                     |
| `--path <path>`      | Goes in `source.path` (relative to the repository root). Without it the `--file` is used, if relative (with `/` and no leading `./`); an absolute `--file` without `--path` is a usage error. |
| `--ref <commit>`     | Goes in `source.ref`. Without it the key does not exist: the extractor does not make one up.                                                                                                  |
| `--also <file>`      | Another file to look for `object …Defaults` (factories) and `enum class` in. Repeatable; order matters.                                                                                       |
| `--overload <n>`     | The overload to use (0 onwards, in file order, **counting the `@Deprecated` ones**). Goes in `source.overload`.                                                                               |
| `--init <n>`         | `swift`: the `init` to use (0 onwards, in struct order, **counting the `deprecated` ones**). Goes in `source.init`. With no written `init`, `0` is the memberwise one.                        |
| `--node <id>`        | `figma`: the node id (`12:34`; `12-34`, as it comes in the URL, also works).                                                                                                                  |
| `--out <sheet.json>` | Writes the sheet to this file instead of printing it. It is the **only** file the script writes: it creates the file, not folders.                                                            |

`source.symbol` is always `<file's package>.<name>` (just the name, if the file declares no `package`). The sheet comes out with 2-space indentation, the keys in the type's order (`src/model/signatures/types.ts`) and `\n` at the end.

Exit codes: **0** ok; **1** extraction error (syntax, missing symbol or node, ambiguous overload or `init`, unreadable file, sheet that fails `parseSignature`); **2** usage error (missing or unknown argument, unknown reader, option that does not belong to the reader: `the option --init does not apply to kotlin (it applies to swift)`). Messages go to stderr, in English; the syntax error comes out as `<file>:<line>:<column>: <message>`.

Before writing, the sheet goes through `parseSignature` (the same one as the importer and `validate_library`); if it fails, the error is internal (exit 1) and nothing is printed or written.

## What the Kotlin reader does

1. **Tokenizes** the whole file: parentheses, brackets, braces, strings (`"…"` with escapes, `"""…"""`, nested `${…}`), characters, `//` and `/* */` comments (which nest; the `/** */` KDoc is kept for `doc`). An unclosed delimiter, string or comment is an error with the line and column of the opener.
2. **Candidates:** every `fun [<T>] [Receiver.]Name(` annotated with `@Composable` (before or after other annotations and modifiers, on the same line or on separate lines). `@Composable` inside a parameter's type does not count; a function of the same name without `@Composable` is ignored.
3. **Overloads:** the `@Deprecated` ones are dropped. If one is left, that is the one. If more than one is left (or none) and there is no `--overload`, the error starts with `ambiguous overload:` and lists **all** the candidates, one per line: `  <index>: line <n> [@Deprecated] (<parameter names>)`. With `--overload n`, the n-th of the complete list is used; an index outside the list is an error with the list.
4. **Parameters** (`[annotations] [vararg|noinline|crossinline] name: Type [= default]`, trailing comma accepted): `type` and `default` are the source text with normalized whitespace (a line break next to `( [ < .` or `) ] > , .` disappears; elsewhere it becomes a space); `required: true` when there is no default.
5. **`role`:** `Modifier` → `modifier`; function type (has `->` at the top level, with or without parentheses and `?`) → `slot` if `@Composable`, otherwise `callback`; a type ending in `InteractionSource`, `State`, `FocusRequester` or `ScrollBehavior` (without the generic arguments) → `state`, unless the type is a known `enum class` (from the file or the `--also` ones): the enum wins over the suffix (`role: value`, `kind: enum`); `vararg` → `other` (with `type: "vararg <T>"`); the rest → `value`.
6. **`value.kind`** (only in `role: value`): `String`/`AnnotatedString` → `text`; `Boolean` → `boolean`; `Int`/`Long`/`Short`/`Byte` → `integer`; `Float`/`Double` → `number`; `Dp` → `dimension`; `Color` → `color`; `enum class` from the same file or the `--also` ones → `enum` with `options` (the constants, in declaration order); the rest → `opaque`. A trailing `?` does not change the kind.
7. **`value.default`** only for a representable literal: `true`/`false`; a simple string (no `$` or `\`); an integer (`3`, `1_000`, `10L`); a decimal (`0.5f`, `1.0`); `16.dp`/`16.0.dp` → 16; `Enum.CONSTANT` of the known enum. `null`, `Modifier`, `ButtonDefaults.shape` and other expressions stay only in the parameter's text `default`.
8. **Factories:** a default `Object.factory(...)` gets a `factory` if there is a `fun factory(` in the body of `object Object { … }` in the same file or in the `--also` ones. Among those of the same name, the `@Deprecated` ones are discarded and the one with the **most parameters** stays (tie: the first); with no parameters, no `factory`. `call` is `<package of the file where it was found>.Object.factory`. A parameter with a factory has no `value`, and the factory has no factory inside it (one level only).
9. **`doc`:** the KDoc attached to the declaration, one `@param name text…` per parameter (continuations become a single text). Only parameters that exist are included; the factory's go as `doc["<param>.<factoryParam>"]` (`colors.containerColor`). With nothing, the key does not exist.

## What the Swift reader does

It uses the same tokenizer as Kotlin (the Swift dialect reads `///` as doc and the `\(…)` interpolation of strings).

1. **Candidate:** `struct <Name>` (with or without generics and `: View`) at the top level of the file or inside another type. `--symbol` is the simple name (`ProfileCard`) or qualified (`DS.ProfileCard`); the text goes as given in `source.symbol`, and the prefix only disambiguates structs of the same name (by the type that wraps them).
2. **`init`:** the `init(...)`s written **in the struct** (not those in an `extension`), in file order. With just one, that is the one; with more than one and no `--init`, the error starts with `ambiguous init:` and lists **all** of them, `  <index>: line <n> [deprecated] (<labels>)`. An `@available(… deprecated|unavailable|obsoleted)` counts like Kotlin's `@Deprecated`, and so does a `private`/`fileprivate` `init` (which no outsider calls): they appear in the list (`[deprecated]`, `[private]`) and drop out of the automatic choice, but `--init <n>` reaches them. With no written `init` the **memberwise** one applies, and `--init 0` picks it.
3. **Memberwise:** the stored properties, in declaration order: `let` without a value and `var`. Left out: `@State`, `@StateObject`, `@Environment`, `@EnvironmentObject`, `@FocusState`, `@Namespace`, `@GestureState`, `@ScaledMetric`, `@AccessibilityFocusState` (and any wrapper with arguments, such as `@AppStorage("k")`), `private`/`fileprivate`, `static`/`class`, `lazy`, `let` with a value and the computed ones. `var x: T?` without a value gets `default: "nil"`; `var x = 0` without a type uses the literal's type (or `_`).
4. **Labels:** in `init(_ title: String, badge badgeCount: Int)`, `name` is the **internal** name (`title`, `badgeCount`) and `label` the external one (`_` for the positional one, `badge`); with no written label, the external one is the name itself and the `label` key does not exist.
5. **`role`:** function type (`->`) → `slot` if it has `@ViewBuilder` (or returns a view), otherwise `callback` (`@escaping` and `Optional` count); `some View`, `AnyView` and generic `<C: View>`/`<C: View & Equatable>`/`where C: View` → `slot`; `@Binding var x: T` becomes `Binding<T>`, and `@ObservedObject`/`@Bindable` → `state`; the rest → `value`.
6. **`value.kind`:** `String`, `LocalizedStringKey`, `AttributedString` → `text`; `Bool` → `boolean`; `Int`… → `integer`; `Double`, `Float` → `number`; `CGFloat` → `dimension`; `Color` → `color`; `enum` from the same file (or the `--also` ones) → `enum` with `options` (the `case`s, in order; associated value → `opaque`); the rest → `opaque`. A trailing `?` does not change the kind.
7. **`value.default`** only for a literal: `true`/`false`, simple string, integer, decimal, `CGFloat(8)` and `.case`/`Enum.case` of the known enum (becomes the option: `.compact` → `compact`). `nil` and other expressions stay only in the parameter's text `default`.
8. **`doc`:** the `- Parameter name:`/`- Parameters:` of the `init`'s `///`, then the struct's and, last, the property's `///` (the key is the internal name; the external label also finds it).

## What the Figma reader does

Reads the saved JSON (it does not open the network or the Figma MCP) and finds the node anywhere in it, by `id` + `type`: the response of `GET /v1/files/:key/nodes`, the whole-file one or the bare node all work, **as long as the node carries `id`, `type` and `componentPropertyDefinitions`** (what the Figma MCP returns was not checked: save it in this format).

- `VARIANT` → `enum` with `variantOptions` in `options`; `BOOLEAN` → `boolean`; `TEXT` → `text`; `INSTANCE_SWAP` → `slot` (no `default` or `required`); a type the reader does not know → `role: other`. The `defaultValue` goes in `default` (and `value.default`); the property's `description` goes to `doc`.
- The `#<id>` suffix of the name (`Disabled#1:2`) leaves `name` and goes to the parameter's `id`.
- `source` is `{ kind: "design", system: "figma", id, name }` of the node (no `path`, `ref` or `symbol`): on import, the sheet links the type's `sources`, not `code`.
- A variant (a `COMPONENT` with no definitions, child of a `COMPONENT_SET`) is an error pointing to the `COMPONENT_SET`; a node that does not exist is too.

## Determinism

The same input gives the same bytes: the sheet carries no date, absolute path or anything locale-dependent, and the keys come out in the type's fixed order. Two tests prove it (two runs; `.js` against `.mjs`).

## Security

The script does not open the network (`net`, `http(s)`, `dns`, `child_process`, `fetch`, `WebSocket` appear neither in the code nor in the bundle) and writes nothing outside `--out`: only `readFileSync` of the `--file` and the `--also` ones. ESLint forbids the network modules and the write functions outside `cli.ts`, and `tests/signature/staticGuards.test.ts` checks the code, the bundle and the folder tree before and after a run. From `src/` only `src/model/` is imported (the sheet and `parseSignature`).

## Known limits

The reader is not a compiler: it reads the function headers and resolves nothing.

- **Types from other files:** only the `enum class`es of the file and of the `--also` ones become `enum`; any other type (`Shape`, `PaddingValues`, `BorderStroke`, `TextUnit`, `WindowInsets`, `TextStyle`, `typealias`, classes) is `opaque`. The same holds for **generics** (`List<String>`) and for a parameter with **its own annotation** (`@FloatRange(…)`: the annotation text stays at the start of `type`).
- **Defaults:** only the literals above become `value.default`; constants (`DEFAULT`, `Dp.Unspecified`), computations and `stringResource(…)` stay only in the text `default`. Hexadecimal and strings with `$` or escapes are not representable literals.
- **Factories:** only the `Object.factory(...)` format with `Object` starting in uppercase; an extension function, an unnamed `companion object` and a factory in an object of another module (without `--also`) get no `factory`.
- **Types:** `typealias` and the qualified name only by the last segment (`androidx.…Color` counts as `Color`); a type with the same name as another (your project's `Color`) is read as Compose's `Color`.
- **Candidates:** the name counts, at any level of the file (a class's or object's function too). `expect`/`actual` show up as two candidates (use `--overload`).
- **`<` in defaults:** it only opens a generic when it sticks to the identifier (`listOf<A>()`); `a<b` without spaces would be read as a generic.
- **Swift:** only the `init`s written in the struct (those in an `extension` and those inside `#if` are not read); a `#"…"#` string is not tokenized; a duplicate struct with the same name and no prefix in `--symbol` is ambiguous; `enum`s and types from other files only count with `--also`.
- **Figma:** only the node's `componentPropertyDefinitions`; the children and the variants are not read.
