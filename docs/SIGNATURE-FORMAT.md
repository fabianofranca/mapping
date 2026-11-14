# Signature sheet format (`mapping-signature`, `formatVersion` 1)

The **signature sheet** is a JSON file that describes, in a neutral form, the signature of **one thing that gets instantiated**: the parameters of a `@Composable` function, the `init` of a SwiftUI view, the properties of a Figma component. It is **derived**: whoever writes it reads the source (the agent, or, in a later stage, an extractor) and the result lives in the library package, next to the specialization, in `signatures/<tipo>.<plataforma>.json` (for a variant, `signatures/<tipo>.<caso>.<plataforma>.json`). The **MCP server never reads code**: what it reads, to say what is left to map, is only this JSON.

The schema is in [`signature.schema.json`](signature.schema.json). Mapping's validation is the same as the import's and `validate_library`'s, with the exact path of each error (`params[3].factory.params[0].factory`).

## What it is for

The specialization (`formatVersion` 16, see [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Signatures and field templates") cites the sheet in the type's `code` (`signature`). With it:

- MCP returns, in the `code`, the `unmapped`: the parameters that no field binds and that `ignore` does not dismiss, in source order (including the required ones, such as `onClick`);
- `validate_library` checks that the `code`'s `params` point to parameters that exist (warning `parâmetro fora da ficha: "<nome>"`) and that the sheet is the one for the same symbol and file.

The sheet stores nothing about the solution or the project; it only records what the source declares.

## The object

**Strict** object: an unknown key is an error (`propriedade desconhecida: "x"`).

| Key             | Required | Description                                                                                                    |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `format`        | yes      | Always `"mapping-signature"`.                                                                                  |
| `formatVersion` | yes      | `1`. It is the version **of the sheet**, independent of the specialization, library and project versions.      |
| `source`        | yes      | Where the signature came from (below).                                                                         |
| `params`        | yes      | List of parameters, **in source order**. A repeated name is an error (`parâmetro "x" repetido`). May be empty. |
| `doc`           | no       | Documentation per parameter: parameter name → text (KDoc's `@param`, Swift's `///`, Figma's `description`).    |

A platform, language or system name appears **only in `source`**; the rest of the sheet describes parameters.

## `source`

It has two formats, depending on `kind`.

**`kind: "code"`** (a function, a view, a class):

| Key         | Required | Description                                                                                                                                                |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | yes      | `"code"`.                                                                                                                                                  |
| `platform`  | yes      | The specialization's platform id (`compose`, `swiftui`).                                                                                                   |
| `language`  | yes      | The language read (`kotlin`, `swift`).                                                                                                                     |
| `symbol`    | yes      | What gets called, with the full name (`androidx.compose.material3.Button`). Must equal the `symbol` of the `code` that cites the sheet.                    |
| `path`      | yes      | The file that defines it, relative to the repository root. Must equal the `code`'s `path`, when it declares one.                                           |
| `ref`       | no       | The commit, tag or branch read.                                                                                                                            |
| `extractor` | yes      | Who wrote the sheet: `mapping-signature/<leitor>@<versão>` (an extractor, such as `mapping-signature/kotlin@1`) or `agent` (the agent that read the code). |
| `overload`  | no       | Integer from 0 up: the overload chosen (Kotlin).                                                                                                           |
| `init`      | no       | Integer from 0 up: the `init` chosen (Swift).                                                                                                              |

**`kind: "design"`** (a component of a design system):

| Key         | Required | Description                       |
| ----------- | -------- | --------------------------------- |
| `kind`      | yes      | `"design"`.                       |
| `system`    | yes      | The design system (`figma`).      |
| `id`        | yes      | The component's id in the system. |
| `name`      | yes      | The component's name.             |
| `extractor` | yes      | As in `code`.                     |

## `params`

Each parameter is a strict object:

| Key        | Required | Description                                                                                                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | yes      | The parameter's name in the source.                                                                                                                                 |
| `label`    | no       | The external label, in Swift (`func f(_ text: String)` has `label: "_"`). `_` means **positional**: it is what the `#n` of the specialization's `params` addresses. |
| `id`       | no       | The parameter's id in the source (the `#<id>` suffix of a Figma property's name).                                                                                   |
| `role`     | yes      | What the parameter is for the screen (below).                                                                                                                       |
| `type`     | yes      | The type text in the source, normalized only in whitespace (`Boolean`, `() -> Unit`, `@Composable RowScope.() -> Unit`).                                            |
| `default`  | no       | The default's text in the source (`Modifier`, `ButtonDefaults.buttonColors()`).                                                                                     |
| `required` | no       | `true` when the source requires the parameter (no default). Absent means `false`.                                                                                   |
| `value`    | no       | Only in `role: "value"`: what the data is and how it is written (below).                                                                                            |
| `factory`  | no       | The default's factory, for a parameter whose value is built by a function (below).                                                                                  |

### `role`

| `role`     | The parameter is…                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `value`    | data that the screen shows or configures (text, number, color, boolean, option): a candidate for a field of the type. |
| `slot`     | content that goes inside (a `@Composable` `content`, a `ViewBuilder`).                                                |
| `callback` | an event (`onClick`).                                                                                                 |
| `modifier` | a layout or style modifier (`Modifier`).                                                                              |
| `state`    | a state or a controller that the caller creates (`interactionSource`, a `Binding`).                                   |
| `other`    | whatever does not fit the previous ones.                                                                              |

### `value`

Strict object: `kind`, `default?` and `options?`.

| `kind`      | The data is…                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `text`      | a text.                                                                                                      |
| `boolean`   | true or false.                                                                                               |
| `number`    | any number.                                                                                                  |
| `integer`   | an integer.                                                                                                  |
| `dimension` | a measure, **in component units**: 1 dp in Compose, 1 pt in SwiftUI, 1 CSS px at 1x in Figma and on the web. |
| `enum`      | one option among constants; `options` is **required** and lists the constants as written in the source.      |
| `color`     | a color.                                                                                                     |
| `opaque`    | something the format does not represent (a shape, an object): the sheet only records that it exists.         |

`default` is the **literal** default that can be represented (text, number or `true`/`false`); a default that is an expression (`ButtonDefaults.shape`) stays only in the parameter's `default`, as text. `options` outside `enum` is an error.

### `factory`

A parameter whose value is built by a function (`colors: ButtonColors = ButtonDefaults.buttonColors()`) carries `factory`: `{ call, params }`, where `call` is the factory's symbol and `params` are its parameters, in the same format as `params`. It is **one level only**: `factory` inside `factory` is an error (`a fábrica não pode ter fábrica: só um nível`). The specialization binds a field to the factory's argument by path (`colors.containerColor`).

## Complete example: Compose's `Button`

```json
{
  "format": "mapping-signature",
  "formatVersion": 1,
  "source": {
    "kind": "code",
    "platform": "compose",
    "language": "kotlin",
    "symbol": "androidx.compose.material3.Button",
    "path": "compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt",
    "ref": "5113b82a4ed6416d6344efa50e41db8cb65928ff",
    "extractor": "agent"
  },
  "params": [
    { "name": "onClick", "role": "callback", "type": "() -> Unit", "required": true },
    { "name": "modifier", "role": "modifier", "type": "Modifier", "default": "Modifier" },
    {
      "name": "enabled",
      "role": "value",
      "type": "Boolean",
      "default": "true",
      "value": { "kind": "boolean", "default": true }
    },
    {
      "name": "shape",
      "role": "value",
      "type": "Shape",
      "default": "ButtonDefaults.shape",
      "value": { "kind": "opaque" }
    },
    {
      "name": "colors",
      "role": "value",
      "type": "ButtonColors",
      "default": "ButtonDefaults.buttonColors()",
      "factory": {
        "call": "androidx.compose.material3.ButtonDefaults.buttonColors",
        "params": [
          {
            "name": "containerColor",
            "role": "value",
            "type": "Color",
            "default": "Color.Unspecified",
            "value": { "kind": "color" }
          }
        ]
      }
    },
    {
      "name": "content",
      "role": "slot",
      "type": "@Composable RowScope.() -> Unit",
      "required": true
    }
  ],
  "doc": { "shape": "defines the shape of this button's container…" }
}
```

## Example: a SwiftUI view (`swift` extractor)

The explicit `init` of `ProfileCard` (`init(_ title: String, badge badgeCount: Int = 0, style: Style = .compact, onTap: (() -> Void)? = nil, @ViewBuilder content: () -> Content)`), as `mapping-signature swift` writes it. `name` is the property's **internal** name, `label` the external label (`_` is the positional, the `#0` of `code.params`); the `.compact` default becomes the `compact` option; the `doc` comes from `- Parameters:` and from `///`.

```json
{
  "format": "mapping-signature",
  "formatVersion": 1,
  "source": {
    "kind": "code",
    "platform": "swiftui",
    "language": "swift",
    "symbol": "DS.ProfileCard",
    "path": "Sources/DS/ProfileCard.swift",
    "ref": "fixture",
    "extractor": "mapping-signature/swift@1"
  },
  "params": [
    {
      "name": "title",
      "label": "_",
      "role": "value",
      "type": "String",
      "required": true,
      "value": { "kind": "text" }
    },
    {
      "name": "badgeCount",
      "label": "badge",
      "role": "value",
      "type": "Int",
      "default": "0",
      "value": { "kind": "integer", "default": 0 }
    },
    {
      "name": "style",
      "role": "value",
      "type": "Style",
      "default": ".compact",
      "value": { "kind": "enum", "default": "compact", "options": ["compact", "regular"] }
    },
    { "name": "onTap", "role": "callback", "type": "(() -> Void)?", "default": "nil" },
    {
      "name": "content",
      "role": "slot",
      "type": "@ViewBuilder () -> Content",
      "required": true
    }
  ],
  "doc": { "title": "The name shown at the top of the card." }
}
```

Once imported, the sheet gives the `title` field bound to the positional argument (`code.params`: `"title": "#0"`) and `badgeCount` bound to the `badge` label; `onTap` and `content` stay in `unmapped`.

## Example: a Figma component (`figma` extractor)

The `componentPropertyDefinitions` of a `COMPONENT_SET`. The `#<id>` suffix of the name leaves `name` and goes to `id`; `VARIANT` is `enum` with `options`, `BOOLEAN` is `boolean`, `TEXT` is `text` and `INSTANCE_SWAP` is `slot`. The sheet is a design one (`kind: "design"`), so the import links it in the type's `sources` and the existing `style` gains the `VARIANT`'s `values`.

```json
{
  "format": "mapping-signature",
  "formatVersion": 1,
  "source": {
    "kind": "design",
    "system": "figma",
    "id": "12:34",
    "name": "Button",
    "extractor": "mapping-signature/figma@1"
  },
  "params": [
    {
      "name": "Style",
      "role": "value",
      "type": "VARIANT",
      "default": "Filled",
      "value": {
        "kind": "enum",
        "default": "Filled",
        "options": ["Filled", "Outlined", "Text"]
      }
    },
    {
      "name": "Disabled",
      "id": "1:2",
      "role": "value",
      "type": "BOOLEAN",
      "default": "false",
      "value": { "kind": "boolean", "default": false }
    },
    { "name": "Icon", "id": "1:4", "role": "slot", "type": "INSTANCE_SWAP" }
  ]
}
```

## How the specialization cites it

In the type's `code.<platform>` (and in each case of `variants`), `signature` is the sheet's path in the package; next to it come `ignore`, `calls` and `formats`, and `params` may use a path and a positional. In the type's `sources` (design origin), `signature` is the design sheet. The complete format, the `variants` summing rule and the errors are in [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Signatures and field templates". The MCP server's resource `mapping-docs://SIGNATURE-FORMAT.md` delivers this document.

## Validation errors

Each error carries the path inside the sheet (the root is empty). The main ones:

| Path                                  | Message                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------- |
|                                       | `propriedade desconhecida: "x"`; `deve ser um objeto`                         |
| `format`                              | `deve ser "mapping-signature"`                                                |
| `formatVersion`                       | `deve ser 1`                                                                  |
| `source`, `params`                    | `obrigatório`                                                                 |
| `source.kind`                         | `"x" inválido; use "code" ou "design"`                                        |
| `source.extractor`                    | `inválido; use "mapping-signature/<leitor>@<versão>" ou "agent"`              |
| `source.overload`                     | `deve ser um inteiro de 0 em diante` (igual para `init`)                      |
| `params[2].name`                      | `parâmetro "x" repetido`                                                      |
| `params[2].role`                      | `"x" inválido; use "value", "slot", "callback", "modifier", "state", "other"` |
| `params[2].value`                     | `só é permitido em role "value"`                                              |
| `params[2].value.kind`                | `"x" inválido; use "text", "boolean", "number", …`                            |
| `params[2].value.options`             | `obrigatório em enum`; `só é permitido em enum`                               |
| `params[4].factory.params[0].factory` | `a fábrica não pode ter fábrica: só um nível`                                 |
| `doc.<nome>`                          | `deve ser texto`                                                              |

In `validate_library`, the sheet file that the specialization cites and that does not exist (`arquivo não encontrado`), invalid JSON and a `source.symbol` or `source.path` different from the `code`'s are also errors; a `params` that points to a parameter absent from the sheet is a warning.

## Format version

The sheet's `formatVersion` is **1**. It is independent of the `formatVersion` of the specialization (16 is the first that cites sheets), of the component and of the project. A sheet of a different version is refused with `formatVersion: deve ser 1`.
