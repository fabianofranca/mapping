# Formato da ficha de assinatura (`mapping-signature`, `formatVersion` 1)

A **ficha de assinatura** é um arquivo JSON que descreve, numa forma neutra, a assinatura de **uma coisa que se instancia**: os parâmetros de uma função `@Composable`, o `init` de uma view SwiftUI, as propriedades de um componente do Figma. Ela é **derivada**: quem a escreve lê a fonte (o agente, ou, em etapa seguinte, um extrator) e o resultado vive no pacote da biblioteca, ao lado da especialização, em `signatures/<tipo>.<plataforma>.json` (no caso de uma variante, `signatures/<tipo>.<caso>.<plataforma>.json`). O **servidor MCP nunca lê código**: o que ele lê, para dizer o que falta mapear, é só este JSON.

O schema está em [`signature.schema.json`](signature.schema.json). A validação do Mapping é a mesma da importação e do `validate_library`, com o caminho exato de cada erro (`params[3].factory.params[0].factory`).

## Para que serve

A especialização (`formatVersion` 16, ver [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Assinaturas e modelos de campo") cita a ficha no `code` do tipo (`signature`). Com ela:

- o MCP devolve, no `code`, o `unmapped`: os parâmetros que nenhum campo liga e que o `ignore` não dispensa, na ordem da fonte (inclusive os obrigatórios, como o `onClick`);
- o `validate_library` confere que o `params` do `code` aponta para parâmetros que existem (aviso `parâmetro fora da ficha: "<nome>"`) e que a ficha é a do mesmo símbolo e arquivo.

A ficha não guarda nada da solução nem do projeto; ela só registra o que a fonte declara.

## O objeto

Objeto **estrito**: uma chave desconhecida é erro (`propriedade desconhecida: "x"`).

| Chave           | Obrigatória | Descrição                                                                                                               |
| --------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `format`        | sim         | Sempre `"mapping-signature"`.                                                                                           |
| `formatVersion` | sim         | `1`. É a versão **da ficha**, independente da versão da especialização, da biblioteca e do projeto.                     |
| `source`        | sim         | De onde a assinatura saiu (abaixo).                                                                                     |
| `params`        | sim         | Lista dos parâmetros, **na ordem da fonte**. Nome repetido é erro (`parâmetro "x" repetido`). Pode ser vazia.           |
| `doc`           | não         | Documentação por parâmetro: nome do parâmetro → texto (o `@param` do KDoc, o `///` do Swift, a `description` do Figma). |

Nome de plataforma, de linguagem ou de sistema aparece **só em `source`**; o resto da ficha descreve parâmetros.

## `source`

Tem dois formatos, conforme `kind`.

**`kind: "code"`** (uma função, uma view, uma classe):

| Chave       | Obrigatória | Descrição                                                                                                                                             |
| ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | sim         | `"code"`.                                                                                                                                             |
| `platform`  | sim         | O id da plataforma da especialização (`compose`, `swiftui`).                                                                                          |
| `language`  | sim         | A linguagem lida (`kotlin`, `swift`).                                                                                                                 |
| `symbol`    | sim         | O que se chama, com o nome completo (`androidx.compose.material3.Button`). Precisa ser igual ao `symbol` do `code` que cita a ficha.                  |
| `path`      | sim         | O arquivo que o define, relativo à raiz do repositório. Precisa ser igual ao `path` do `code`, quando ele o declara.                                  |
| `ref`       | não         | O commit, a tag ou o branch lido.                                                                                                                     |
| `extractor` | sim         | Quem escreveu a ficha: `mapping-signature/<leitor>@<versão>` (um extrator, como `mapping-signature/kotlin@1`) ou `agent` (o agente que leu o código). |
| `overload`  | não         | Inteiro de 0 em diante: a sobrecarga escolhida (Kotlin).                                                                                              |
| `init`      | não         | Inteiro de 0 em diante: o `init` escolhido (Swift).                                                                                                   |

**`kind: "design"`** (um componente de um sistema de design):

| Chave       | Obrigatória | Descrição                      |
| ----------- | ----------- | ------------------------------ |
| `kind`      | sim         | `"design"`.                    |
| `system`    | sim         | O sistema de design (`figma`). |
| `id`        | sim         | O id do componente no sistema. |
| `name`      | sim         | O nome do componente.          |
| `extractor` | sim         | Como em `code`.                |

## `params`

Cada parâmetro é um objeto estrito:

| Chave      | Obrigatória | Descrição                                                                                                                                                     |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | sim         | O nome do parâmetro na fonte.                                                                                                                                 |
| `label`    | não         | O rótulo externo, no Swift (`func f(_ text: String)` tem `label: "_"`). `_` quer dizer **posicional**: é o que o `#n` de `params` da especialização endereça. |
| `id`       | não         | O id do parâmetro na fonte (o sufixo `#<id>` do nome de uma propriedade do Figma).                                                                            |
| `role`     | sim         | O que o parâmetro é para a tela (abaixo).                                                                                                                     |
| `type`     | sim         | O texto do tipo na fonte, normalizado só nos espaços (`Boolean`, `() -> Unit`, `@Composable RowScope.() -> Unit`).                                            |
| `default`  | não         | O texto do padrão na fonte (`Modifier`, `ButtonDefaults.buttonColors()`).                                                                                     |
| `required` | não         | `true` quando a fonte exige o parâmetro (sem padrão). Ausente vale `false`.                                                                                   |
| `value`    | não         | Só em `role: "value"`: o que o dado é e como se escreve (abaixo).                                                                                             |
| `factory`  | não         | A fábrica do padrão, para um parâmetro cujo valor se monta por uma função (abaixo).                                                                           |

### `role`

| `role`     | O parâmetro é…                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `value`    | um dado que a tela mostra ou configura (texto, número, cor, booleano, opção): candidato a campo do tipo. |
| `slot`     | conteúdo que se põe dentro (um `@Composable` `content`, um `ViewBuilder`).                               |
| `callback` | um evento (`onClick`).                                                                                   |
| `modifier` | um modificador de layout ou de estilo (`Modifier`).                                                      |
| `state`    | um estado ou um controlador que o chamador cria (`interactionSource`, um `Binding`).                     |
| `other`    | o que não cabe nos anteriores.                                                                           |

### `value`

Objeto estrito: `kind`, `default?` e `options?`.

| `kind`      | O dado é…                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `text`      | um texto.                                                                                                     |
| `boolean`   | verdadeiro ou falso.                                                                                          |
| `number`    | um número qualquer.                                                                                           |
| `integer`   | um inteiro.                                                                                                   |
| `dimension` | uma medida, **em unidades do componente**: 1 dp no Compose, 1 pt no SwiftUI, 1 px CSS a 1x no Figma e na web. |
| `enum`      | uma opção entre constantes; `options` é **obrigatório** e lista as constantes no texto da fonte.              |
| `color`     | uma cor.                                                                                                      |
| `opaque`    | algo que o formato não representa (uma forma, um objeto): a ficha só registra que existe.                     |

`default` é o padrão **literal** que dá para representar (texto, número ou `true`/`false`); um padrão que é uma expressão (`ButtonDefaults.shape`) fica só no `default` do parâmetro, em texto. `options` fora de `enum` é erro.

### `factory`

Um parâmetro cujo valor se monta por uma função (`colors: ButtonColors = ButtonDefaults.buttonColors()`) leva `factory`: `{ call, params }`, em que `call` é o símbolo da fábrica e `params` são os parâmetros dela, no mesmo formato de `params`. É **um nível só**: `factory` dentro de `factory` é erro (`a fábrica não pode ter fábrica: só um nível`). A especialização liga um campo ao argumento da fábrica por caminho (`colors.containerColor`).

## Exemplo completo: o `Button` do Compose

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

## Exemplo: uma view SwiftUI (extrator `swift`)

O `init` explícito de `ProfileCard` (`init(_ title: String, badge badgeCount: Int = 0, style: Style = .compact, onTap: (() -> Void)? = nil, @ViewBuilder content: () -> Content)`), como o `mapping-signature swift` o escreve. `name` é o nome **interno** da propriedade, `label` o rótulo externo (`_` é o posicional, o `#0` do `code.params`); o padrão `.compact` vira a opção `compact`; o `doc` vem do `- Parameters:` e do `///`.

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

Importada, a ficha dá o campo `title` ligado ao argumento posicional (`code.params`: `"title": "#0"`) e `badgeCount` ligado ao rótulo `badge`; `onTap` e `content` ficam em `unmapped`.

## Exemplo: um componente do Figma (extrator `figma`)

As `componentPropertyDefinitions` de um `COMPONENT_SET`. O sufixo `#<id>` do nome sai de `name` e vai para `id`; `VARIANT` é `enum` com `options`, `BOOLEAN` é `boolean`, `TEXT` é `text` e `INSTANCE_SWAP` é `slot`. A ficha é de design (`kind: "design"`), por isso a importação a liga em `sources` do tipo e o `style` existente ganha o `values` do `VARIANT`.

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

## Como a especialização a cita

No `code.<plataforma>` do tipo (e em cada caso de `variants`), `signature` é o caminho da ficha no pacote; ao lado ficam `ignore`, `calls` e `formats`, e o `params` pode usar caminho e posicional. Nas `sources` do tipo (origem de design), `signature` é a ficha de design. O formato completo, a regra de soma das `variants` e os erros estão em [`SPEC-FORMAT.md`](SPEC-FORMAT.md), "Assinaturas e modelos de campo". O recurso `mapping-docs://SIGNATURE-FORMAT.md` do servidor MCP entrega este documento.

## Erros de validação

Cada erro traz o caminho dentro da ficha (a raiz é vazia). Os principais:

| Caminho                               | Mensagem                                                                      |
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

No `validate_library`, o arquivo da ficha que a especialização cita e que não existe (`arquivo não encontrado`), o JSON inválido e o `source.symbol` ou `source.path` diferentes do `code` também são erros; o `params` que aponta para um parâmetro ausente da ficha é aviso.

## Versão do formato

A `formatVersion` da ficha é **1**. Ela é independente da `formatVersion` da especialização (a 16 é a primeira que cita fichas), do componente e do projeto. Uma ficha de versão diferente é recusada com `formatVersion: deve ser 1`.
