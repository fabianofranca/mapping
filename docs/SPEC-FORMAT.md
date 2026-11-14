# Specialization format (`formatVersion` 1 to 16)

The format of the file that defines layers and annotation types (and, in `formatVersion` 2, the code platforms and the instantiation code of the types; in 3, the external sources; in 4, the **library**: components, documents, examples, fonts, executable origins and the version contract; in 5, the repository of each platform; in 6, the ready-made container sizes; in 7, the floating type; in 8, the text suggestions; in 9, the code variants; in 10, the notices; in 11, the children by layer and group, the link roles and the document in an external repository; in 12, the role migration steps; in 13, the children of the layer itself; in 14, the whole annotation as the target of a `ref`; in 15, the design tokens; in 16, the signatures and the field models). The "Help → Specializations" page of the app is a condensed version of this document (a test guarantees that the section titles and the code blocks match).

## What a specialization is

A **specialization** is a JSON file that defines **mandatory layers** and the **annotation types** that can be created in them. E.g. the **SDUI** specialization brings the Components layer (Button, Input…) and the Events layer (onClick, onHold…). When you create a Button, the keys are already defined and only the values are left to fill in.

- A project can apply **several** specializations, at any time.
- A specialization **does not cite another by name**. The link between them is made by **strong references** (type `ref`) that pick their targets by **tags**.
- The layers of a specialization only accept **typed** annotations, with no extra keys. Layers created by the user remain free.
- The applied specialization is **copied** to `specs/<id>.json` inside the project, which stays self-contained. The copy keeps the `formatVersion` it was applied with.
- `formatVersion` 12 is 11 plus three **role migration steps**, in `migrations`: `rename-role`, `remove-role` and `set-role` (see "Version contract" and "Link roles (childRoles)"). Before it, removing a role from `childRoles` left the annotations' `parentRole` pointing to a role that no longer exists; 12 treats that change as **breaking** and covers it with a step that renames, removes or fills in the role in the project's annotations. Version 12 is additive: versions 1 to 11 are still accepted unchanged, and each new step in an earlier version is the error `only allowed with formatVersion 12`, at the exact path. Only a specialization that declares one of these steps moves up to 12. A v11 that removes a type's role, or makes it required, without the step is rejected on update until it moves up to 12 with it.
- `formatVersion` 13 is 12 plus the **children of the layer itself**: `allowedChildren` now accepts the `{ layer }` clause with the owner's own layer and the id of a type in the same layer, including the type's own id (see "Children by layer and group"). With that, an event can own other events, each child in the role it links with (`childRoles`), and the **typed** annotation can have an owner in the same layer in the project (schema v15; the **free** one still only has an owner in another layer, and the cycle is still barred). Version 13 is additive: versions 1 to 12 are still accepted unchanged, and the layer or a type of the layer itself in `allowedChildren` in an earlier version is still the usual error (`children must be in another layer`). Only a specialization that declares a child of its own layer moves up to 13.
- `formatVersion` 14 is 13 plus the **whole annotation as a target**: the `accepts` of a `ref` field or column gains `annotations`, a list of type ids or `{ layer, groups? }` clauses of the **same specialization**, with the same syntax and the same resolver as `allowedChildren` (see "References and tags"). Version 14 is additive: versions 1 to 13 are still accepted unchanged, and `annotations` in an earlier version is the error `only allowed with formatVersion 14`, at the path `…accepts.annotations`. Only a specialization that declares `accepts.annotations` moves up to 14.
- `formatVersion` 15 is 14 plus the **design tokens**: the `tokens` key at the root declares named values (colors, radii, spacings, font families), simple or per mode (`light`/`dark`), which format 4 components read with `{ "$token": "name" }` (see "Design tokens"). Version 15 also brings the **icon set**: the `icons` key at the root points to a `.json` file in the package with the icons, which the `icon` node of format 4 components reads (see "Icon set"). Version 15 is additive: versions 1 to 14 are still accepted unchanged, and `tokens` or `icons` in an earlier version is the error `only allowed with formatVersion 15`, at the path of the key. Version 15 also brings `structural` on the annotation type: `structural: true` marks the type that **groups and does not draw** (a group, a section). It has no `component` (`structural` together with `component` is a validation error, at the path `structural`), its marking does not show the header with the name on the canvas, the outline appears only on mouse hover or when selected (like that of one that has a drawing) and it does not count as "without component" in any pending item; `structural` in an earlier version is the error `only allowed with formatVersion 15`, at the path `…annotationTypes[n].structural`. Version 15 also brings the **measured origin**: `origins[].kind` (`tree`, the default, or `measured`; see "Sources (sources)"); `kind` in an earlier version is the error `only allowed with formatVersion 15`, at the path `origins[n].kind`. Only a specialization that declares `tokens`, `icons`, `structural` or `kind: "measured"` moves up to 15.
- `formatVersion` 16 is 15 plus the **signatures and the field models**: the `code` of each platform (and each case of `variants`) can now cite the **signature sheet** of what it calls (`signature`, format `mapping-signature`, see `docs/SIGNATURE-FORMAT.md`), leave parameters out on purpose (`ignore`), link parameters to factories (`calls`) and format the value (`formats`); `params` now accepts the path `colors.containerColor` and the positional `#0`; the type's `sources` accept `signature`; and the root gains `fieldModels` (see "Signatures and field models"). Version 16 is additive: versions 1 to 15 are still accepted unchanged, and each new key in an earlier version is the error `only allowed with formatVersion 16`, at the exact path of the key. Before 16, `params` values with `.` or `#0` are opaque text, as they always were. Only a specialization that declares `fieldModels`, `signature`, `ignore`, `calls` or `formats`, or a path or positional in `params`, moves up to 16.
- `formatVersion` 2 is 1 plus the instantiation code (platforms and `code`: how to create an instance of each type). Import accepts versions 1 to 16; a v1 specialization is a v2 without platforms and without `code` (see "Platforms and code").
- `formatVersion` 3 is 2 plus `sources`: which elements of an external system each type corresponds to and which source property each field comes from (see "Sources (sources)").
- `formatVersion` 4 is 3 plus the **library**: the type points to a component (`component`), a document (`doc`) and examples (`examples`); the root gains `fonts`, `origins` and `migrations`; the `sources` gain `path`, `slot` and `ignore` (see "Sources (sources)", "Library: the package", "Version contract" and "Library validation"). Versions 1, 2 and 3 are still accepted unchanged: each v4 key in an earlier version is the error `only allowed with formatVersion 4`, at the exact path.
- `formatVersion` 5 is 4 plus `repo` on the platforms: the library's repository on each platform (`url`, `urlTemplate`, `ref`), which provides the link and the revision of the file of each `symbol` (see "Platforms and code"). Versions 1 to 4 are still accepted unchanged: `repo` in an earlier version is the error `only allowed with formatVersion 5`, at the exact path.
- `formatVersion` 6 is 5 plus `containers`: the list of **ready-made container sizes** that the **New container** dialog offers when the specialization is applied (see "Containers (preset sizes)"). Version 6 is additive: versions 1 to 5 are still accepted unchanged, and `containers` in an earlier version is the error `only allowed with formatVersion 6`, at the exact path. The app core has no device sizes; only **Custom** and **Selection size**.
- `formatVersion` 7 is 6 plus `floating` on the annotation type (the type whose instance is a **floating marking**, a loose comment over the canvas: see "Floating type"), `appliesTo` on the type (what the annotation applies to: marking, arrow or both: see "Where the type applies") and `ref` as a column type of `table` (a list of references as data: see "Value types"). Version 7 is additive: versions 1 to 6 are still accepted unchanged, and each key of 7 in an earlier version is the error `only allowed with formatVersion 7`, at the exact path.
- `formatVersion` 8 is 7 plus `suggestions` and `linkedRef` on a `string` field and column (a vocabulary suggested while typing, without restricting the value, and the mapped targets in the same list: see "Text suggestions" and "Mapped targets in the list (`linkedRef`)"). Version 8 is additive: versions 1 to 7 are still accepted unchanged, and `suggestions` or `linkedRef` in an earlier version is the error `only allowed with formatVersion 8`, at the exact path.
- `formatVersion` 9 is 8 plus `variants` in the `code` entry: the `enum` field of the type that chooses the variant of the instantiation code, such as the `style` of a button that in Compose switches the composable (`Button`, `OutlinedButton`, `TextButton`; see "Code variants (`variants`)"). Version 9 is additive: versions 1 to 8 are still accepted unchanged, and `variants` in an earlier version is the error `only allowed with formatVersion 9`, at the exact path. Only a specialization that uses `variants` moves up to 9.
- `formatVersion` 10 is 9 plus `notices` on the type, on the field and on the `table` column: short notices that tell whoever uses the specialization that something diverges between the sources, is pending, obsolete or removed (see "Notices (notices)"). Version 10 is additive: versions 1 to 9 are still accepted unchanged, and `notices` in an earlier version is the error `only allowed with formatVersion 10`, at the exact path. Only a specialization that uses `notices` moves up to 10.
- `formatVersion` 11 is 10 plus three features, all optional: `allowedChildren` that accepts, besides type ids, a **clause** `{ layer, groups? }` that covers a whole layer or only its **groups** (`groups` on the layer and on the type: see "Children by layer and group"); `childRoles` and `childRolesLabel` on the owner type, the **roles** in which a child links to it (see "Link roles (childRoles)"); and `docRepos` at the root with the type's `doc` as an object `{ repo, path }`, the document that lives in **another repository** (see "Document in an external repository (docRepos)"). Version 11 is additive: versions 1 to 10 are still accepted unchanged, and each key of 11 in an earlier version is the error `only allowed with formatVersion 11`, at the exact path. Only a specialization that uses one of these keys moves up to 11; `doc` as text (the package file) is still valid since 4.

Supporting files:

- `docs/spec.schema.json`: JSON Schema (draft 2020-12). It validates only the **structure**; the rules between elements (unique ids, `allowedChildren` with the clauses and the `groups`, `requiresOwner`, `childRoles`, the `repo` of `docRepos`, `labelField`, `rowLabel`, compatible `default`, declared platforms, keys of `params` and `values`, `sources` only from version 3, `values` of the origins only on `enum` and with targets in the `options`, `path`/`slot`/`ignore` only on a system declared in `origins`, `examples` in one mode only, the `migrations` steps consistent with the types and fields) are only checked by the app's validator (`src/model/spec.ts`, which is the source of truth).
- `docs/component.schema.json`: JSON Schema of the component file (`docs/COMPONENT-FORMAT.md`).
- `examples/specs/sdui.json` (`formatVersion` 12) and `examples/specs/modelo-de-dados.json` (`formatVersion` 1): complete examples.
- `examples/libraries/sdui-backend/`: the **executable origin** example (v9, 6 types): `origins` with `booleans`, `background.values` and roots with `anchor`, `margin` and `scrim`; type `sources` (`slot`, `ignore`, `id`) and field and column `sources` (`path`, `values`); examples of the external system (`examples[].system` and `file`) and the example screen; and `migrations` with the six steps. It is the example of `origins`, `sources` and `migrations`.
- `examples/libraries/sdui-backend/`: a small library package with the executable origin (`origins`, `sources` and `migrations`, with the example screen of a fictional external system; see "Library: the package"). What each example shows is in `examples/README.md`.
- `libraries/material3-compose/`: **ready-to-use** library (v9, not embedded: applied from the folder or the zip) of Material 3 for Jetpack Compose, with the composable of each type in `code` and `variants` where the variant switches the symbol; pinned to `compose.material3` 1.4.0.
- `libraries/kotlin/`: **ready-to-use** library (v8, not embedded: the person applies it from the folder or the zip) of the Kotlin declarations, with eleven class, object and interface types, each with a component and a document; the properties are reference targets with the `data-field` tag. The folders of `libraries/` are in [`libraries/README.md`](../libraries/README.md).

## File format

```json
{
  "format": "mapping-spec",
  "formatVersion": 1,
  "id": "sdui",
  "name": "SDUI",
  "version": 1,
  "description": "optional",
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "input",
          "name": "Input",
          "labelField": null,
          "requiresOwner": false,
          "allowedChildren": ["onChange"],
          "fields": [
            { "key": "id", "type": "string", "required": true },
            {
              "key": "tipo",
              "type": "enum",
              "options": ["text", "email"],
              "default": "text"
            },
            {
              "key": "dado",
              "type": "ref",
              "accepts": { "tags": ["data-field"], "free": true }
            }
          ]
        }
      ]
    }
  ]
}
```

At the root: `format` (always `"mapping-spec"`), `formatVersion` (`1` to `16`), `id`, `name` and `version` (integer ≥ 1) are required; `description`, `platforms` (from version 2, with `repo` in 5), `containers` (from version 6), `docRepos` (from version 11) and, from version 4, `fonts`, `origins` and `migrations` are optional, and so are `tokens` (from version 15) and `fieldModels` (from version 16). Each layer has `id` (unique), `name`, `color` (`#RRGGBB`) and `annotationTypes`, and, from version 11, optional `groups` (see "Children by layer and group"). Import still accepts old files with `"mapeador-spec"`.

### Annotation type

| Property          | Required | Description                                                                                                                                                                                                       |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | yes      | Unique **across the whole specialization**.                                                                                                                                                                       |
| `name`            | yes      | Displayed name (e.g. "Button").                                                                                                                                                                                   |
| `description`     | no       | Help text.                                                                                                                                                                                                        |
| `labelField`      | no       | Key of a `string` field whose value is the **instance label** when the annotation's `name` is empty.                                                                                                              |
| `requiresOwner`   | no       | Default `false`. The annotation must have exactly one owner (see "Relations").                                                                                                                                    |
| `allowedChildren` | no       | The types that can be **linked** to this one: type ids and, from `formatVersion` 11, `{ layer, groups? }` clauses; from 13, also from the owner's own layer (see "Children by layer and group").                  |
| `groups`          | no       | From `formatVersion` 11. Ids of the groups of the **type's own layer** that the type belongs to (see "Children by layer and group").                                                                              |
| `childRoles`      | no       | From `formatVersion` 11. The roles in which a child links to this type (see "Link roles (childRoles)").                                                                                                           |
| `childRolesLabel` | no       | From `formatVersion` 11. The name of the role selector, with `childRoles` (default "Role").                                                                                                                       |
| `fields`          | yes      | List of fields (can be empty).                                                                                                                                                                                    |
| `code`            | no       | From `formatVersion` 2. How to create an instance of the type, per declared platform (see "Platforms and code").                                                                                                  |
| `sources`         | no       | From `formatVersion` 3. Source elements the type corresponds to (see "Sources (sources)").                                                                                                                        |
| `component`       | no       | From `formatVersion` 4. Path of the `.json` component file that draws the type (see "Library: the package").                                                                                                      |
| `doc`             | no       | From `formatVersion` 4. Path of the type's `.md` document (see "Library: the package"); in 11, also `{ repo, path }`, a document in an external repository (see "Document in an external repository (docRepos)"). |
| `examples`        | no       | From `formatVersion` 4. Named examples of the type: field values or the JSON of an external system.                                                                                                               |
| `floating`        | no       | From `formatVersion` 7. Default `false`. The instance is a floating marking (see "Floating type").                                                                                                                |
| `appliesTo`       | no       | From `formatVersion` 7. `["marking"]`, `["arrow"]` or both; default `["marking"]` (see "Where the type applies").                                                                                                 |
| `structural`      | no       | From `formatVersion` 15. Default `false`. `true`: the type groups and does not draw (no `component`); the marking does not show the name and the outline appears only on mouse hover or when selected.            |
| `notices`         | no       | From `formatVersion` 10. Notices about the type (see "Notices (notices)").                                                                                                                                        |

### Field

| Property      | Required            | Description                                                                                                                                                                                                     |
| ------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`         | yes                 | Key written to the JSON. `[A-Za-z0-9_]`, **cannot start with `_`** (reserved). Unique within the type.                                                                                                          |
| `label`       | no                  | Displayed label (can have accents). Default: `key`.                                                                                                                                                             |
| `type`        | yes                 | `string`, `number`, `date`, `enum`, `table` or `ref`.                                                                                                                                                           |
| `required`    | no                  | Default `false`. Empty is allowed on save, but the annotation becomes **incomplete**.                                                                                                                           |
| `default`     | no                  | Initial value. Must be valid for the type. Does not exist for `table` or `ref`.                                                                                                                                 |
| `options`     | `enum` only         | Non-empty list of unique strings.                                                                                                                                                                               |
| `linkedRef`   | `string` only       | From `formatVersion` 8. `key` of a `ref` field of the same type (or of a `ref` column of the same `table`): the mapped declarations that the `ref` accepts go into the list (see "Mapped targets in the list"). |
| `suggestions` | `string` only       | From `formatVersion` 8. List of text suggestions (see "Text suggestions"); also valid on a `string` column of `table`.                                                                                          |
| `columns`     | `table` only        | Fields with the same structure, **only** `string`, `number`, `date` or `enum` and, from `formatVersion` 7, `ref` (with `accepts`). `table` inside `table` does not exist.                                       |
| `tags`        | no                  | Tags that make the field a **reference target** (`[a-z0-9-]+`). In `table`, each **row** becomes a target.                                                                                                      |
| `rowLabel`    | `table` with `tags` | Key of a `string` column that names each row as a target.                                                                                                                                                       |
| `accepts`     | `ref` only          | `{ "tags": [...], "free": true\|false, "annotations": [...] }`. Needs at least one tag, `free: true` or `annotations` (see "References and tags").                                                              |
| `description` | no                  | Help text shown in the editor.                                                                                                                                                                                  |
| `sources`     | no                  | From `formatVersion` 3. Source properties of the field, including in columns; in v4, `path` on a system declared in `origins` (see "Sources (sources)").                                                        |
| `notices`     | no                  | From `formatVersion` 10. Notices about the field; also valid on a `table` column (see "Notices (notices)").                                                                                                     |

## Value types

- `string`: text.
- `number`: number, integer or decimal.
- `date`: ISO date `YYYY-MM-DD`.
- `enum`: one of the `options`. Booleans are `enum` (e.g. `["yes", "no"]`). **Component states:** the drawing is a still frame: no animation, animated ripple or state change by the mouse. The **appearance** of an interaction state (hover, focus, pressed, dragged) is drawable and, when the source defines it (state tokens of the design system), it comes in as an optional `enum` field of the type, outside the `code`, like disabled and selected. When listing what stays out in a plan or in Fidelity, separate motion (out) from state appearance (field).
- `table`: list of rows; each row is an object with the keys of the `columns` (plus the internal id `_id`).
- `ref`: **strong reference** to a tuple of another annotation. The value of the field is the reference.

**Reference list: `ref` column in a `table`.** When the type needs to point to several targets (or carry data with each target), declare a `table` with a `ref` column (from `formatVersion` 7; the `accepts` is the same as that of a `ref` field). Each row is a reference and can have other columns beside it; the row has `_id`, is a reference target like any row and takes part in the library migrations (`table.column`) and in the per-row comparison of proposals. The `ref` column is **data**: it does not draw an arrow or link markings (what links one marking to another is the arrow). An empty cell is `null`; in a required column, empty is a pending item; a target that disappeared is `broken-ref`; a target that the column does not accept is `ref-not-accepted`. The type's component reads the cell by the target's label (see `repeat` in `docs/COMPONENT-FORMAT.md`).

**Removed field type: `codeRef`.** Until stage 9 there was the `codeRef` type (the place in the solution where the instance was written, per platform). It left the format: the specialization stores only what helps to **instantiate** the type (the types' `code`, with `symbol` and `path`), never where the instance ended up. An old file with a field `"type": "codeRef"` is still valid: the app's import and `validate_specialization` **read and ignore** the field (it leaves the type, along with the `params` keys of the `code` that cite it) and give a warning with the path (`ignored-field`). No new `formatVersion`; the copies in `specs/` of existing projects keep opening. The JSON Schema ([`spec.schema.json`](spec.schema.json)) describes only the current format and rejects the field. When you find one, remove it from the file.

## Text suggestions

`formatVersion` 8 lets a `string` field (or a `string` column of `table`) offer a **suggested vocabulary** with `suggestions`: while typing, the person sees a list with the suggestions that match the word under the cursor and can pick one. It is meant for **open** text with recurring words, such as the type of a code property (`String`, `Int`, `List`), which also accepts `String?` and `List<Endereco>`.

**`suggestions` does not restrict the value.** Any text is still accepted: what is not in the list is not an error, warning or pending item, and a `default` does not need to be in it. For a **closed** set of values use `enum` (`options`), which locks the value.

```json
{
  "key": "type",
  "type": "string",
  "suggestions": ["String", "Int", "Boolean", "List", "Map"]
}
```

- `suggestions`: non-empty list, up to 200 items, of unique, non-empty texts with no leading or trailing space. Only on a `string` field or column: on `number`, `date`, `enum`, `ref` or `table` the error is `only allowed in a string field or column`, at the path `…fields[n].suggestions`. In a version earlier than 8 the error is `only allowed with formatVersion 8`, at the same path (`…columns[m].suggestions` in a column).
- **Version contract:** adding, changing or removing `suggestions` is compatible and never requires a migration (see "Version contract"); a package can go from `formatVersion` 7 to 8 between versions.

## Mapped targets in the list (`linkedRef`)

Also in `formatVersion` 8, a `string` field (or `string` column of `table`) can carry `linkedRef`: the `key` of a `ref` field **of the same type** (in a column, of a `ref` column **of the same `table`**). While typing, the list shows, before the `suggestions`, the already mapped declarations that this `ref` accepts, each with the name of its type beside it. The inserted text is the declaration's **name** (the value of the target's `name` field, such as `Usuario`). Choosing only replaces the word under the cursor; on confirm (Enter or leaving the field), the app writes the text **and** the sibling `ref` together, in a single undo entry (one Ctrl+Z undoes both), as long as the chosen name is still a word of the text (`List<Usuario>` works). Esc discards both. Typing the name by hand without choosing does not touch the `ref`, clearing the text does not clear the `ref` (it has its own clear button), and a `ref` already filled with another target is replaced by the choice.

`linkedRef` **does not restrict the value** and is independent of `suggestions`: a field can have both, only `suggestions`, only `linkedRef` or neither. In the Catalog and in review (no project or read-only) there are no targets to list.

```json
[
  {
    "key": "type",
    "type": "string",
    "linkedRef": "typeRef",
    "suggestions": ["String", "Int", "Boolean", "List", "Map"]
  },
  { "key": "typeRef", "type": "ref", "accepts": { "tags": ["kotlin-type"] } }
]
```

- `linkedRef`: only on a `string` field or column (on another type the error is `only allowed in a string field or column`) and only from `formatVersion` 8 (before that, `only allowed with formatVersion 8`, at the path `…fields[n].linkedRef` or `…columns[m].linkedRef`). The `key` must exist at the same level (the type's fields, or the columns of the same `table`) and be a `ref` field or column; otherwise the error points at the `linkedRef`.
- **Version contract:** adding, changing or removing `linkedRef` is compatible and never requires a migration (see "Version contract").

## Relations between annotations

Always within the same specialization.

- `allowedChildren`: types that can be linked (via `parentAnnotationId`) to this one. An owner can have N children, including of the same type. The children must be in **another layer** (from `formatVersion` 13, also in the owner's **same layer**: see "Children by layer and group"). Each item is the id of a type or, from `formatVersion` 11, a `{ layer, groups? }` clause that covers a layer or its groups (see "Children by layer and group").
- `requiresOwner: true`: the annotation needs exactly one owner, of a type that lists it in `allowedChildren` (by id or by the clause that covers it).
- `childRoles` (`formatVersion` 11): the roles in which a child links to the owner (see "Link roles (childRoles)").

## Children by layer and group

Up to v10, `allowedChildren` lists the children **one by one**, by id. An events layer with thirty types forces each owner to repeat the thirty ids, and a new type in the layer requires editing all the owners. `formatVersion` 11 lets an item of `allowedChildren` be, instead of the id, a **clause** `{ "layer": "<layer id>", "groups": ["<id>", …] }` (`groups` is optional), and lets the layer declare **groups** (`layers[].groups`) that its types belong to (`annotationTypes[].groups`).

```json
{
  "formatVersion": 11,
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": [{ "layer": "eventos" }],
          "fields": []
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "eventos", "groups": ["navegacao"] }, "submit"],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Events",
      "color": "#E53935",
      "groups": [
        { "id": "navegacao", "name": "Navigation" },
        {
          "id": "dados",
          "name": "Data",
          "description": "Events that read or write data."
        }
      ],
      "annotationTypes": [
        {
          "id": "navigate",
          "name": "Navigate",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": [{ "key": "destino", "type": "string", "required": true }]
        },
        {
          "id": "back",
          "name": "Back",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": []
        },
        {
          "id": "submit",
          "name": "Submit",
          "groups": ["dados"],
          "requiresOwner": true,
          "fields": []
        }
      ]
    }
  ]
}
```

- **The clause.** Without `groups`, it covers **all the types of the layer** (the Button above accepts every event, including ones added later). With `groups`, it covers the types of the layer that are in **any** of the listed groups (the Card accepts `navigate` and `back`, plus the `submit` cited by id). The clause only has `layer` and `groups`; any other property is an error, and so is `groups: []` (for the whole layer, omit `groups`).
- **The resolved set.** The types an owner accepts as children are the **union of the items, in their order**; within a clause, the types come in the layer's order; a type that appears more than once stays in the **first** position. A text id is still a single type, in another layer, as before. Every read of "who can be a child of whom" (the owner's editor, link validation, `requiresOwner`) uses this same set.
- **The groups.** `layers[].groups` is a list of `{ id, name, description? }`: `id` non-empty and unique **within the layer**, `name` non-empty, `description` optional. The order of the list is the order of the headers with which the app presents the types. `annotationTypes[].groups` is the non-empty, duplicate-free list of ids of groups of the **type's own layer** that the type belongs to; a type can be in several groups, and a type without `groups` only gets in through a whole-layer clause or through its own id. A group is just a grouping: it does not change what the type is or where it lives.
- **Another layer, as always (up to 12).** The clause's `layer` must exist and, up to `formatVersion` 12, **cannot be the owner's own layer** (the error is the usual one: `children must be in another layer`); a `group` must exist **in the clause's layer**. Version 13 changes only this rule (see below).
- **`requiresOwner`** is checked against the resolved set: the type must be in the set of some owner, whether by id, by whole layer or by group. The owner must be **another** type: if the only type that lists it is itself (in `formatVersion` 13, which accepts children of the own layer), no annotation could be the owner and the error is `"t" requires an owner, but no other type accepts it as a child (only itself lists it in allowedChildren)`, at the path `…annotationTypes[n].requiresOwner`.
- **Warnings** (`specWarnings`; they do not block): `allowedChildren` with 20 ids or more **as text** warns `N types listed one by one; a { layer, groups } clause covers the layer or the groups` (with 19, it does not); a declared group that no type uses also warns.
- **Outside the version contract:** adding, changing or removing `groups`, and replacing a list of ids with a clause, is compatible and never requires a migration (see "Version contract"). `diffSpecs` produces no difference for `allowedChildren`, as today, nor for `groups`.
- Only from `formatVersion` 11: the clause, `layers[n].groups` and `annotationTypes[m].groups` in an earlier version are the error `only allowed with formatVersion 11`, at the exact path (`layers[0].annotationTypes[0].allowedChildren[0]`, `layers[1].groups`, `layers[1].annotationTypes[0].groups`).

### Children of the layer itself (`formatVersion` 13)

Some types chain **in the same layer**: an event that triggers another (the `send-http-request` call has the Success result and the Failure result, and each one triggers a next event of the same events layer). Up to 12, this forced duplicating the layer or creating fields on the type (`chainedAfter`, `trigger`). `formatVersion` 13 lets `allowedChildren` accept the owner's own layer: the **clause** `{ "layer": "<the type's own layer>" }` (with or without `groups`) and the **id of a type in the same layer**, **including the type's own id**.

```json
{
  "formatVersion": 13,
  "layers": [
    {
      "id": "eventos",
      "name": "Events",
      "color": "#E53935",
      "annotationTypes": [
        {
          "id": "click",
          "name": "Click",
          "allowedChildren": ["send-http-request"],
          "fields": []
        },
        {
          "id": "send-http-request",
          "name": "Send HTTP request",
          "requiresOwner": true,
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [
            { "id": "success", "name": "Success" },
            { "id": "failure", "name": "Failure" }
          ],
          "fields": [{ "key": "url", "type": "string", "required": true }]
        }
      ]
    }
  ]
}
```

In the project, the link tree looks like this (event `e1` owns three children, each in its own role, in the same layer as `Click`):

```text
Click
└── e1  send-http-request          (role: click, in the button's Click)
    ├── e2  send-http-request      (role: success)
    ├── e4  send-http-request      (role: success)
    └── e3  send-http-request      (role: failure)
```

- **What changes in the project.** The **typed** annotation can have an owner in the **same layer** when the owner's type accepts its type (by id or by the own-layer clause); the **free** annotation still only has an owner in **another layer** (the `mapping.json` schema v15 describes the rule). An owner in another layer is still valid as before.
- **No cycle.** The chain of owners never returns to an annotation already visited: a type that accepts itself allows `e1` to own `e2`, but `e2` cannot own `e1`, nor can an annotation own itself (`invalid-annotation-parent`).
- **`requiresOwner`** is checked against the resolved set, also with the owner's own layer: the `send-http-request` above only exists linked to a `Click` or to another `send-http-request`.
- **The "when" is a role.** To chain, the child links to the previous event in a `childRoles` of the owner type (Success, Failure), instead of a `chainedAfter` or `trigger` field on the child (see "Link roles (childRoles)").
- Only from `formatVersion` 13: in an earlier version, the own-layer clause is the error `layer "eventos" is the type's own; children must be in another layer` (at the path `….allowedChildren[k].layer`) and the id of a type in the same layer is `type "x" is in the same layer; children must be in another layer`.

## Roles on the link (childRoles)

An owner sometimes links the same child type at **different points** of itself: the Button has a click event and a press event, and both are of type `navigate`. When the child needs to say **at which point of the owner it links**, that is a **role**, not a field of the child nor a type id (when only the link point changes, do not create a type per trigger, such as `onClick` and `onHold`, nor a `trigger` field on each event). `formatVersion` 11 declares the roles on the **owner**, with `childRoles`, and a name for the selector, with `childRolesLabel`.

```json
{
  "id": "button",
  "name": "Button",
  "allowedChildren": [{ "layer": "eventos" }],
  "childRolesLabel": "Trigger",
  "childRoles": [
    { "id": "click", "name": "Click" },
    { "id": "hold", "name": "Press", "description": "Long press on the button." }
  ],
  "fields": []
}
```

- `childRoles`: **non-empty** list of `{ id, name, description? }`, with `id` non-empty and **unique within the type** and `name` non-empty. The role belongs to the **link** between the owner and the child, not to the child: the same child type can occupy different roles in the same owner (one `navigate` on click, another on press) and in different owners.
- `childRoles` is only valid on a type **with `allowedChildren`** (without children there is no link to carry a role): otherwise it is an error.
- `childRolesLabel`: non-empty text, the name the app uses for the role selector ("Trigger", "Slot", "Position"). Only valid with `childRoles` (otherwise it is an error). Without it, the app uses **Papel** (pt-BR) and **Role** (en-US).
- **In the version contract (every version with roles, from `formatVersion` 11 on; the step that covers the breaking change is from `formatVersion` 12):** the role's `id` is data that annotations store (`parentRole`). **Removing** a role from a type, or giving `childRoles` to a type that had none, is **breaking** and requires a `rename-role`, `remove-role` or `set-role` step in `migrations`; **adding** a role to a type that already had roles is additive (see "Version contract"). The role's `name` and `description`, the order of the `childRoles` and the `childRolesLabel` remain outside the contract.
- Only from `formatVersion` 11 (in an earlier version the error is `only allowed with formatVersion 11`, at the path `layers[0].annotationTypes[0].childRoles` or `….childRolesLabel`). The role migration steps (`rename-role`, `remove-role` and `set-role`) are from `formatVersion` 12.

## Document in an external repository (docRepos)

Up to v10, a type's `doc` is an `.md` file **inside the package**. When the component's documentation lives in the design system's or the contract's repository, and not in the specialization folder, copying it into the package creates a second source that goes stale. `formatVersion` 11 declares the document repositories (`docRepos`) at the root and lets the type's `doc` point to a file in one of them.

```json
{
  "docRepos": [
    {
      "id": "design-docs",
      "url": "https://gitlab.empresa.com/grupo/design-docs",
      "urlTemplate": "https://gitlab.empresa.com/grupo/design-docs/-/blob/main/{path}",
      "ref": "main"
    }
  ],
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "doc": { "repo": "design-docs", "path": "components/button.md" },
          "allowedChildren": [{ "layer": "eventos" }],
          "childRolesLabel": "Trigger",
          "childRoles": [
            { "id": "click", "name": "Click" },
            { "id": "hold", "name": "Press" }
          ],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Events",
      "color": "#E53935",
      "groups": [{ "id": "navegacao", "name": "Navigation" }],
      "annotationTypes": [
        {
          "id": "navigate",
          "name": "Navigate",
          "groups": ["navegacao"],
          "requiresOwner": true,
          "fields": [{ "key": "destino", "type": "string", "required": true }]
        }
      ]
    }
  ]
}
```

- `docRepos`: list of `{ id, url, urlTemplate?, ref? }`, with the **same rules as a platform's `repo`** (see "Platforms and code"): `url` required, `http://` or `https://`, no spaces; `urlTemplate` optional, `http(s)://` and with `{path}`; `ref` optional, non-empty text, informational; any other property is rejected. `id` in the format `[a-z0-9-]+` (that of the platform id) and **unique** in the list.
- `doc` in **two ways**: **text** (`"docs/button.md"`) is the package's `.md` file, as since v4; an **object** `{ "repo": "<docRepos id>", "path": "<path>" }` is a file in the declared repository. The `repo` must exist in `docRepos`, and the object has no other property.
- `path` follows the rules of `code`'s `path`: relative to the repository root, `/` as the separator, no `.`, `..` or leading `/`. In addition it ends in **`.md`** and **has no `#`** (the anchor inside the document is not part of the file path).
- **The package does not carry the document.** The `doc` object does not count as a cited package file: a specialization whose only cited files are external documents is valid as a **standalone file** (see "Library: the package"), and level 1 of package validation does not check the external document (the app does not download it; whoever reads it reaches it through the repository).
- **Outside the version contract:** adding, changing or removing `docRepos`, and switching the `doc` between text and object, is compatible and never requires a migration (see "Version contract"); `diffSpecs` produces no difference.
- **Warning** (`specWarnings`; it does not block): a `docRepos` repository that no `doc` uses.
- Only from `formatVersion` 11 (in an earlier version the error is `only allowed with formatVersion 11`, at the path `docRepos` or `layers[0].annotationTypes[0].doc`, the latter when the `doc` is an object).

## References and tags

A `ref` field points to a **target**. Valid targets are:

- tuples of **free** annotations, if `accepts.free` is `true`;
- fields of typed annotations (any applied specialization) whose `tags` contains some tag of `accepts.tags`; in a `table` with `tags`, each row is a target, named by the `rowLabel` column;
- the **whole annotation** of one of the types in `accepts.annotations` (from `formatVersion` 14).

**`accepts.annotations` (`formatVersion` 14).** Non-empty list of items with the syntax of `allowedChildren`: the id of a type or a clause `{ "layer": "<id>", "groups": ["<id>", …] }` (without `groups`, it covers all the types of the layer), all from the **same specialization**, and the resolver is the same (`resolveTypeItems`). The type's own layer is valid. With `annotations`, the reference points to the annotation, not to a field of it; it can come together with `tags` and `free`. Errors, with the texts of `allowedChildren`: `layer "x" does not exist in the specialization`, `group "g" does not exist in layer "c"` and `type "t" does not exist in the specialization`; `annotations: []` is an error (`cannot be empty`); before 14 it is `only allowed with formatVersion 14`, at the path `layers[i].annotationTypes[j].fields[k].accepts.annotations` (and `….columns[m].accepts.annotations` in a column).

```json
{
  "key": "item",
  "type": "ref",
  "required": true,
  "accepts": { "annotations": [{ "layer": "componentes" }] }
}
```

Recommended tag (reuse it in new specializations): **`data-field`** — attribute of a data model (class, entity, DTO).

## Platforms and code

A type's `code` says how to create an instance of it on each platform: `symbol` is what is called, `path` is the file that defines it, `params` and `values` say how to pass the fields, `notes` gives guidance. The agent reads the file to learn the signature and writes the call in the solution. The mapping stores nothing about the solution: it does not know where it is or what was written in it, and the `code` is not the code generated for an annotation.

A **platform** is a code target where the agent writes the solution: the Android app, the iOS app, the BFF that generates the JSON of an SDUI screen. `formatVersion` 2 declares the platforms and the types' `code`; 5 adds the `repo`, the library's repository on that platform. `formatVersion` 1 is still valid: it is 2 without platforms and without `code`. The app core is generic; platforms, languages and instantiation code come in only through these properties.

| Property    | Where                      | Description                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platforms` | root (optional)            | List of `{ id, name, language, repo? }`: the code targets where the agent writes the solution. `id` in the format `[a-z0-9-]+` and unique in the specialization; `name` is displayed; `language` is informational (it tells the agent which language to write the call in). |
| `repo`      | `platforms` entry (v5)     | Optional, only in `formatVersion` 5. The library's repository on that platform, where the files cited in the `path`s are: `{ url, urlTemplate?, ref? }` (below). Without it, the agent only reaches the file through the local clone that the project reports.              |
| `code`      | annotation type (optional) | Object keyed by **declared platform id**: how to create an instance of the type on each one. Each entry has the properties below.                                                                                                                                           |
| `symbol`    | `code` entry (required)    | What is called to create an instance of the type on that platform: a composable, a view, a class, the BFF function that generates the component's JSON. The agent writes the call to this symbol.                                                                           |
| `path`      | `code` entry (optional)    | The file that defines the `symbol`, **relative to the root of the platform's `repo`** (`/` as the separator, no `.`, `..`, leading `/` or drive letter, no line). The agent reads it to learn the signature before writing the call; without `path`, the `symbol` locates.  |
| `params`    | `code` entry (optional)    | The name each field of the type is passed under in the call: key of a field of the type → parameter name. Fields not in `params` are not passed.                                                                                                                            |
| `values`    | `code` entry (optional)    | How each `enum` value is written in code: key of an `enum` field → (value in the mapping → text in code). A value without a translation is passed as is.                                                                                                                    |
| `notes`     | `code` entry (optional)    | Free guidance for the agent writing the call: what to pass beyond the fields, order, cautions.                                                                                                                                                                              |
| `variants`  | `code` entry (optional)    | From `formatVersion` 9. An `enum` field of the type chooses the code variant, which replaces `symbol`, `path` and `notes` and adds to `params` and `values` (see "Code variants").                                                                                          |

A platform's `repo` has three properties:

| Property      | Required | Description                                                                                                                                                                                                                                                                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | yes      | Address of the library's repository on that platform (`http://` or `https://`, no spaces).                                                                                                                                                                                                                                  |
| `urlTemplate` | no       | Template for the address of **one file**, with `{path}` (e.g. `https://github.com/org/app-android/blob/v3/{path}`). It suits GitHub, GitLab, Bitbucket or an internal server. A `{line}` is accepted and dropped from the link, because the `path` has no line. Without it, the app and the MCP server do not build a link. |
| `ref`         | no       | The revision (tag, branch or commit) of the library that the `code` corresponds to. Informational: the app and the MCP server show it, but do not use it to build the link (whoever wants it in the link writes it in the `urlTemplate`). Non-empty text.                                                                   |

- **How the agent reaches the file.** Through the address: the `urlTemplate` of the platform's `repo`, in the specialization that owns the type, with `{path}` replaced by the `path` (each segment encoded, the `/` kept). The app shows the "Definition" row in the typed annotation's Details with this link right after the specialization is applied, and the MCP server returns the address. Or through the local clone: the project can store where the library is cloned (`platformRepos[<platform>].localPath`, a local overlay; see [`FORMAT.md`](FORMAT.md), "Fields of v11"), and the file's local path is the `localPath` plus the `path`.
- Platforms with the **same `id`** in different specializations are the same code target (the project stores a single local clone for them). Each specialization declares the `repo` of its own library, and they can differ: a type's link uses the `repo` of its specialization.
- `code` is only valid in specializations that declare `platforms`. The ids cited in `code` must exist in `platforms`, and the keys of `params` and `values` must be fields of the type.
- A platform on which some type has a `path` and which does not declare `repo` produces a specialization **warning** (`path-without-repo`), not an error: the file is cited, but the agent does not know which repository to look for it in. The MCP server's use of `code` (`get_code_hints`, `find_by_code`) is in [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

```json
{
  "format": "mapping-spec",
  "formatVersion": 5,
  "id": "sdui",
  "name": "SDUI",
  "version": 3,
  "platforms": [
    {
      "id": "android",
      "name": "Android",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/app-android",
        "urlTemplate": "https://github.com/org/app-android/blob/v3/{path}",
        "ref": "v3"
      }
    },
    {
      "id": "bff",
      "name": "BFF",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/bff",
        "urlTemplate": "https://github.com/org/bff/blob/v3/{path}",
        "ref": "v3"
      }
    }
  ],
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "estilo",
              "type": "enum",
              "options": ["primary", "secondary"],
              "default": "primary"
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSButton",
              "path": "app/src/main/java/com/app/ds/DSButton.kt",
              "params": {
                "id": "testId",
                "estilo": "style"
              },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              },
              "notes": "Call the DSButton composable; the id goes in testId."
            },
            "bff": {
              "symbol": "com.app.bff.sdui.button",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id",
                "estilo": "variant"
              },
              "notes": "The function returns the component node in the screen JSON."
            }
          }
        }
      ]
    }
  ]
}
```

- `android.symbol` is the composable that is called to create a Button; `android.path` is the file that defines it, and the agent reads it to see the signature before writing the call.
- `bff` is a platform like the others: the `symbol` is the **Kotlin function that generates the JSON node** of the Button (`com.app.bff.sdui.button`), with its file in `path`, and not the name of the node (`"button"`) that appears in the JSON.
- `params` says the name of the parameter that receives each field (`estilo` goes in `style` on Android and in `variant` on the BFF); `values` says how the value `primary` is written on Android (`ButtonStyle.Primary`).
- Each platform declares its library's `repo`; the `path` files are relative to the root of that repository.

### Code variants (`variants`)

On some platforms the variant of a component changes **what is called**, not a parameter: in Compose, the filled button is `Button`, the outlined one is `OutlinedButton` and the text one is `TextButton`. `formatVersion` 9 lets a platform's `code` entry declare `variants`: an `enum` field of the type chooses, by the value the annotation has, what changes in the `code`.

| Property         | Where                   | Description                                                                                                                                                                    |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variants`       | `code` entry (optional) | From `formatVersion` 9. `{ field, cases }`: the field that chooses the variant and what changes for each of its values.                                                        |
| `variants.field` | required                | The `key` of an `enum` field of the type, at the top level. A `table` column does not count.                                                                                   |
| `variants.cases` | required                | Object of field value (one of its `options`) → case, with at least one case. The case has `symbol`, `path`, `params`, `values` and `notes`, all optional, and cannot be empty. |

**How the case combines with the base** (the `code` entry without `variants`):

- The case's `symbol`, `path` and `notes` **replace** those of the base (only the ones the case declares; the rest comes from the base).
- The case's `params` and `values` **add to** those of the base, key by key: the case adds or replaces the entry for that key (in `values`, the case's translation for a field replaces the base's for that field).
- When the annotation has a value in the field, that value chooses the case. Without a value, the field's `default` applies; without `default`, the base. A value without a case also uses the base.
- **One level only.** One field chooses the variant and the case has no `variants`. Two dimensions (for example, style and size) become an `enum` that joins them (`filled-large`) or two types, like the FAB and the Extended FAB in Compose.
- The resolved result never carries `variants`: the MCP server (`get_code_hints`, `get_marking`, `get_annotation`, `find_by_code`) and the Details' "Definition" show the code **already resolved** for the annotation's variant; `get_specialization`, `get_component` and the Catalog show the raw JSON (the Catalog also lists the variant → symbol table). The usage detail is in [`AGENT-GUIDE.md`](AGENT-GUIDE.md).

```json
{
  "id": "button",
  "name": "Button",
  "fields": [
    { "key": "label", "type": "string", "required": true },
    { "key": "enabled", "type": "enum", "options": ["true", "false"], "default": "true" },
    {
      "key": "style",
      "type": "enum",
      "options": ["filled", "outlined", "text", "tonal"],
      "default": "filled"
    }
  ],
  "code": {
    "compose": {
      "symbol": "androidx.compose.material3.Button",
      "path": "compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/Button.kt",
      "params": { "enabled": "enabled" },
      "notes": "content = { Text(label) }",
      "variants": {
        "field": "style",
        "cases": {
          "outlined": { "symbol": "androidx.compose.material3.OutlinedButton" },
          "text": { "symbol": "androidx.compose.material3.TextButton" },
          "tonal": {
            "symbol": "androidx.compose.material3.FilledTonalButton",
            "notes": "content = { Text(label) }; the color comes from the tonal theme."
          }
        }
      }
    }
  }
}
```

An annotation with `style = outlined` is instantiated with `OutlinedButton` (the `path` and the `params` are those of the base, because the case only replaced the `symbol`); one with `style = filled` (the `default`, with no case) uses `Button`. The specialization must declare `formatVersion: 9` and the `compose` platform in `platforms`.

**Validation rules:** `variants` only from `formatVersion` 9 (`only allowed with formatVersion 9`, at the path `…code.<platform>.variants`); `field` required, the `key` of an `enum` field of the type (`"x" is not a field of the type` or `"x" must be an enum field of the type`, at the path `…variants.field`); `cases` with at least one case (`declare at least one case`); each key of `cases` one of the field's `options` (`"v" is not in the options of "field"`, at the path `…variants.cases.<v>`); an empty case is an error (`empty case: declare symbol, path, params, values or notes`); the case's `params` and `values` follow the rules of the base's (keys of fields of the type; `values` only for an `enum` field and only with its options); the case's `path`, the same rule as the base's `path`; any other property in `variants` or in the case is rejected.

## Signatures and field models

`formatVersion` 16 links a type's `code` to the **signature** of what it calls. The signature is a `mapping-signature` **sheet** ([`SIGNATURE-FORMAT.md`](SIGNATURE-FORMAT.md)): a JSON in the library package with the component's parameters (name, role, type in the source, default), written by the agent or by an extractor and **derived** from the code. The server never reads the code, only this JSON. With the sheet, Mapping knows what the type does not cover yet (the `unmapped` below) and checks that `params` points to parameters that exist.

The following keys are valid **only in `formatVersion` 16**; in an earlier version each one is the error `only allowed with formatVersion 16`, at the exact path (`…code.compose.signature`, `fieldModels`).

| Key           | Where                                                        | Description                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signature`   | `code` entry and `variants` case; `sources` entry            | Path of the `.json` sheet in the package, relative to the specialization: `signatures/<type>.<platform>.json` (in a case, `signatures/<type>.<case>.<platform>.json`). In `code`, it is the code sheet; in `sources`, the design one.                                                                                                                     |
| `ignore`      | `code` entry and `variants` case; `sources` with `signature` | Names of sheet parameters left out **on purpose** (`modifier`, `interactionSource`): they do not become fields, do not enter the `unmapped` and do not produce a warning. A repeated name is an error. In `sources`, the `ignore` that already existed keeps its usual meaning and, with `signature`, also applies to the parameters left out on purpose. |
| `calls`       | `code` entry and `variants` case                             | Parameter that is filled by a **factory**: `{ "<parameter>": "<factory symbol>" }` (`{ "colors": "androidx.compose.material3.ButtonDefaults.buttonColors" }`). The type's fields reach it by path in `params`.                                                                                                                                            |
| `formats`     | `code` entry and `variants` case                             | How a field's value is written: `{ "<field key>": "<template with {value}>" }`, such as `{ "width": "{value}.dp" }` (the value `16` comes out as `16.dp`). The template must contain `{value}`; the key is that of a field of the type.                                                                                                                   |
| `fieldModels` | root                                                         | The field model of each type in the source (below): platform or system id → type in the source → model.                                                                                                                                                                                                                                                   |

### Target in `params`

In a `formatVersion` 16 specialization, the value of `code.<platform>.params` has three forms:

- **name** (`text`): the parameter of the same name, as always;
- **path** (`colors.containerColor`): the `containerColor` argument of the `calls.colors` factory. The first segment must be in `calls` (otherwise, the error `"colors" is not in calls`, at the path of the field in `params`);
- **positional** (`#0`): the unnamed argument at position 0, Swift's external label `_` parameter (`Text("…")`).

Before 16 the value is opaque text (parameter name, JSON field name…) and nothing changes: `.` and `#0` are not interpreted.

### `variants`: what the case replaces and what it adds

In a `variants` case, `signature` and `ignore` **replace** those of the base (the case points to the sheet of the other symbol, such as `OutlinedButton`). `params`, `values`, `calls` and `formats` **add up**, key by key, and the case's `calls` replaces the base's for the same parameter. The `unmapped` and the `code` that the MCP returns already come out resolved by the case.

### Example

```json
{
  "formatVersion": 16,
  "platforms": [{ "id": "compose", "name": "Compose", "language": "kotlin" }],
  "fieldModels": {
    "compose": {
      "Boolean": { "type": "enum", "options": ["true", "false"] },
      "Dp": { "type": "number", "format": "{value}.dp" }
    }
  },
  "layers": [
    {
      "id": "ui",
      "name": "UI",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "fields": [
            { "key": "title", "type": "string" },
            { "key": "containerColor", "type": "string" },
            { "key": "width", "type": "number" }
          ],
          "code": {
            "compose": {
              "symbol": "androidx.compose.material3.Button",
              "path": "compose/material3/Button.kt",
              "signature": "signatures/button.compose.json",
              "ignore": ["modifier"],
              "calls": {
                "colors": "androidx.compose.material3.ButtonDefaults.buttonColors"
              },
              "formats": { "width": "{value}.dp" },
              "params": {
                "title": "#0",
                "containerColor": "colors.containerColor",
                "width": "width"
              }
            }
          }
        }
      ]
    }
  ]
}
```

(The example shows only the keys of 16; a complete specialization has `format`, `id`, `name` and `version`.)

### Field models (`fieldModels`)

`fieldModels` says how a parameter of a **type in the source** becomes a field of the annotation type. The outer key is the platform `id` (or the `system` of an origin), the inner one is the exact text of the type in the source (`Dp`, `Color`; for the boolean, `boolean`), and the value is a model, with **one** form:

| Form                                         | What it says                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ "like": "<type>.<field>" }`               | Same as the `<field>` field of the specialization's `<type>` type. The field must exist.                                                             |
| `{ "type": "number\|string\|enum", ... }`    | A new field of the given type, with optional `options` (required on `enum`, only there) and `format` (template with `{value}`).                      |
| `{ "expand": { "call?", "params": { … } } }` | The type in the source is composite: it becomes a factory (`call`, optional) with the `params` (name → type in the source), each with its own model. |
| `{ "ignore": true }`                         | This type in the source never becomes a field.                                                                                                       |

### Validation

Validation errors, always with the path:

- `only allowed with formatVersion 16`: any key of the table above, or `signature` in `sources`, in an earlier version;
- `like` that does not find the field: `"<type>.<field>" is not a field of a type in the specialization`;
- `format` (in `fieldModels`) or template (in `formats`) without `{value}`; `formats` with a key that is not a field of the type;
- path in `params` whose first segment is not in `calls`: `"<x>" is not in calls`;
- duplicate or missing form in the model, `options` outside `enum`, repeated `ignore`, `expand` without `params`.

In `validate_library` (which reads the package files), in addition:

- the cited sheet that does not exist (`file not found`) or is invalid (the sheet's errors, with the path inside it);
- the sheet's `source.symbol` or `source.path` different from the `code`'s `symbol` or `path`;
- **warning** `parameter not in the sheet: "<name>"`: the `params` maps a parameter (name, factory argument or positional) that the sheet does not have; the parameter left the code or the name is wrong.

### What is left: `unmapped`

With `signature`, the `code` that the MCP delivers (`get_code_hints`, `get_marking`, `get_annotation`, `get_component`, `find_by_code`) carries `unmapped`: the list, in the sheet's order, of the parameters that **no field links and the `ignore` does not dismiss**, each with `name`, `role`, `type`, `required` and `default?`. A parameter with some factory field linked by path counts as linked. `callback`, `modifier`, `state` and `slot` also enter: that is how the agent knows, for example, that `onClick` is required. The `value`s without a field are the trace of what the screen does not model yet. The server only reads the sheet's JSON in the applied package (`specs/<id>/signatures/…`); never the code. Details in [`MCP.md`](MCP.md).

### The importer and the notices it rewrites

The sheet becomes fields, `code` (or `sources`) and notices through the `plan_signature_import` tool (`planSignatureImport`, pure, in `src/model/signatures/`; flow in [`AGENT-GUIDE.md`](AGENT-GUIDE.md), "Importar parâmetros da assinatura"). The importer does not write a file: it returns the imported specialization and the agent is the one who writes it, validating with `validate_library`.

**What becomes a field** (the library's `fieldModels` takes precedence over the rule):

| Sheet parameter                            | Result                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callback`, `modifier`, `state`            | never become a field; they stay in the sheet and in the `unmapped`                                                                                                        |
| `slot`                                     | no field, unless the `fieldModels` has a model for the exact type (`@Composable () -> Unit` as `string` with a `format`)                                                  |
| `value` `text`                             | `string`                                                                                                                                                                  |
| `value` `boolean`                          | `enum` with the options of the `boolean` model (default `["true", "false"]`)                                                                                              |
| `value` `number`, `integer`, `dimension`   | `number` (the dimension in component units)                                                                                                                               |
| `value` `enum`                             | `enum` with the `options`; the source text that differs from the option goes to `code.values` (or `sources[].values`)                                                     |
| `value` `color`, `opaque`                  | only with a model in the `fieldModels`; without it, the parameter stays out and the type gets a `pending`                                                                 |
| composite parameter (default is a factory) | one **optional** field per factory parameter, each by the same rule; the key is the factory parameter's name or, if it collides, `<param><Name>` (`colorsContainerColor`) |

- **`default`:** the representable literal becomes the field's `default`; a non-literal default (`ButtonDefaults.shape`) stays without `default`, and the argument is not passed.
- **Required:** only on a **new type** (the type still without fields and without a stored sheet). On a type that already has fields, the new field is born **optional** (a new required field is breaking) and the parameter required in code gets `diverges` ("required in code").
- **Field key:** the parameter's name, normalized to `[A-Za-z0-9_]`; the original name (and Swift's external label) goes to `code.params`.
- **Linking to an existing field**, in this order: (a) the `code.params` (or `sources[].name`) that already cites the parameter; (b) the field whose normalized `key` (lowercase, letters and digits only) is equal to that of the name; (c) a new field. In Figma, link (b) is the normal rule (`Style` matches `style`); the options of a `VARIANT` match the `options` by normalized text and go into `sources[].values`, and the one that does not match gets `diverges`. A design target never adds an option to an existing field (it only warns); a code target adds the new option.
- **Idempotent:** importing the same sheet twice gives the same specialization.

**Notices the importer writes.** All carry a `ref` equal to the sheet's path (`signatures/button.compose.json`) and the `message` starts with the platform or system id (`compose: …`, the prefix rule of "Fidelity notices and notice origins"). On each import it **rewrites all the notices with that `ref`** and does not touch the others (the hand-curated ones, with the `ref` of the type's doc, stay):

- `pending` on the type, one per `value` parameter without a field and outside the `ignore` ("compose: the parameter `windowInsets` (WindowInsets) is not a field yet"); on the sheet of a `variants` case the `message` carries the case ("compose: case `outlined`: the parameter `windowInsets` …"), so that the base and the case do not produce the same notice twice, and the re-imported sheet takes the place of the old notices, without reordering the list;
- `removed` on the field whose parameter disappeared from the source (the field stays);
- `diverges` on the field: the parameter's `value.kind` changed; an option of the field no longer exists in the source; the code requires it and the field is optional; probable rename (one parameter left and another came in with the same type and in the same position: the old field's `removed` gives way to `diverges` "probable rename from `a` to `b`").

**Syncing.** With the previous sheet stored in the package, the import compares the two (`changes`: `added`, `removed`, `changed` and `renamed`) and the returned `spec` carries only what is **additive**: a new optional field, a new `enum` option, an updated `default` (only when the sheet changed the default: the first import does not write a `default` on a field that already existed without it) and the links. The `removed` already stored does not come back in `changes` or in `suggestedMigrations` on every re-import. It never removes or renames a field and never writes `migrations`: `suggestedMigrations` (`remove-field`, `rename-field`) is the suggestion, and the agent only writes it if the person asks. `versionBump` is `true` when the contract changed (the `diffSpecs` between the before and after specialization is not empty); an updated `default` or a notices-only change does not bump the version.

## Containers (ready-made sizes)

`formatVersion` 6 lets the specialization offer **preset container sizes**: the canvas's top-level object (an app screen, a panel, a card) created without a file, with just a size and a background color. In the **New container** dialog, the **Preset size** list brings **Custom** and **Selection size** (from the core; the latter is the selected marking's rectangle and is disabled without a selection) and, below, the `containers` of each applied specialization, grouped by its name. Device sizes (phone, tablet, desktop) are domain-specific: they come from the specialization, not from the core. The repository's Material 3 library brings Phone 360 × 800, Large phone 412 × 915, Tablet 800 × 1280 and Desktop 1440 × 900.

```json
{
  "formatVersion": 6,
  "containers": [
    { "id": "phone", "name": "Phone", "width": 360, "height": 800 },
    {
      "id": "tablet",
      "name": "Tablet",
      "width": 800,
      "height": 1280,
      "background": "#FAFAFA"
    }
  ]
}
```

At the root, optional; list of objects with:

- `containers`: the list. Choosing a size fills in the dialog's width, height and background color; the person can still edit them before creating. The agent reads the list in `get_specialization` (`containers` field) and uses it for the sizes in `add_container`.
- `id`: required; in the format `[a-z0-9-]+` and unique in the specialization.
- `name`: required, non-empty; it is the option's text in the list.
- `width` and `height`: required; integers from 1 to 20000 (pixels).
- `background`: optional; `#RRGGBB` color. Without it, the container is born white (`#FFFFFF`).

Version 5 is still accepted: a specialization without `containers` only appears in the list with **Custom** and **Selection size**. The list is outside the version contract (adding, changing or removing sizes is never breaking and never requires a migration).

## Floating type

`formatVersion` 7 lets an annotation type be **floating** (`floating: true`). The instance of a floating type is a **floating marking**: a loose comment, like a sticky note, that lives only on the canvas (`containerId` null, `rect` in canvas units) and stays **outside containment** in both directions: it is never the child of a container or of a marking and is never a parent. It is drawn above everything, including over photos even with **Show components over photos** turned off, and dragging it moves only it: nothing carries it and it carries nothing. **Add** (Palette button) always creates on the canvas, at the center of the view (**Add to canvas**); dragging from the Palette drops it where it lands. The relation to a screen or an element is an arrow, not containment.

Use `floating` only for what is a comment or loose annotation that does not belong to a screen (a note, a message, a business rule); never for interface components, which belong to the screen where they are.

```json
{
  "formatVersion": 7,
  "layers": [
    {
      "id": "notas",
      "name": "Notes",
      "color": "#F5C400",
      "annotationTypes": [
        {
          "id": "nota",
          "name": "Note",
          "floating": true,
          "fields": [
            { "key": "texto", "label": "Text", "type": "string", "required": true }
          ]
        }
      ]
    }
  ]
}
```

- `floating`: boolean, optional; the default is `false`. Only from `formatVersion` 7 (in an earlier version the error is `only allowed with formatVersion 7`, at the path `layers[0].annotationTypes[0].floating`).
- The repository's **notes** library (`libraries/notas/`: **Notes** layer, types `nota` with `titulo` and `texto` and `tabela` with `titulo` and key/value `linhas`, components in the sticky-note style) is an ordinary package, embedded in the app and **applied by default**: the new project is born with it, and a project opened from a schema earlier than 13 gets it on opening. It is removed through **Specializations › Remove**, like any other, and does not come back.
- `string` fields of the type accept multiple lines in the interface (the editor opens in multi-line mode when the text has a line break or exceeds 60 characters, or with Shift+Enter; while the text has no line break, Enter saves and Shift+Enter breaks the line).

## What the type applies to

`formatVersion` 7 says what an annotation applies to with `appliesTo` on the type: `"marking"` (a marking, the default), `"arrow"` (an **arrow**, which links two markings and can have annotations per layer, like a marking) or both. The annotations panel offers, for the selected marking, only the types that apply to markings and, for the arrow, only those that apply to arrows. An **arrow-only** type (`appliesTo: ["arrow"]`) has no `component` or `floating`: the arrow has no component drawing. Source and target restrictions per type (for example, "only links a Screen marking to a Button") are outside the format.

```json
{
  "id": "deep-link",
  "name": "Deep link",
  "appliesTo": ["arrow"],
  "fields": [{ "key": "uri", "label": "URI", "type": "string", "required": true }]
}
```

- `appliesTo`: list of `"marking"` and/or `"arrow"`, optional; non-empty and duplicate-free. Only from `formatVersion` 7 (in an earlier version the error is `only allowed with formatVersion 7`, at the path `layers[0].annotationTypes[0].appliesTo`).
- Through the model API, `typeAppliesTo(type, 'marking' | 'arrow')` answers whether the type applies to the item.

**The "floating that points" pattern.** A data table (fired events, properties) that describes an element of a screen is a **floating** type whose component draws the table (`repeat`, see `docs/COMPONENT-FORMAT.md`). It sits beside the screen and is linked to the element (a button) by an **arrow**; the data lives in the floating table's annotation, and whoever reads the mapping reaches it through the arrows leaving the element. If the relation itself has data (the deep link that the transition opens, the event that it fires), it is a type applied to the arrow. The **notes** library brings the generic **Table** (title and key/value rows) for this, without a specialization.

```json
{
  "id": "tabela-eventos",
  "name": "Events table",
  "floating": true,
  "component": "components/tabela-eventos.json",
  "fields": [
    {
      "key": "eventos",
      "type": "table",
      "columns": [
        { "key": "evento", "type": "string" },
        { "key": "tela", "type": "ref", "accepts": { "tags": ["screen"] } }
      ]
    }
  ]
}
```

## Notices (notices)

`formatVersion` 10 lets the specialization **warn** about a type, a field, or a `table` column with `notices`: a list of short notices, written by whoever generates the specialization, so that the people using it know there is something to consider there. It is the place to record that two sources **disagree** (the contract says one thing and the code another), that something is **pending** in one of them, became **deprecated**, or was **removed** from the contract. The person sees the notice in the app next to the type, the field, or the column; the agent reads it when instantiating the type.

```json
{
  "id": "alert",
  "name": "Alert",
  "notices": [
    {
      "kind": "pending",
      "message": "The contract accepts avatarVariant; the BFF SDK does not have it yet.",
      "since": "2026-11-04",
      "ref": "cross/sdui/all/pe-core/base/plugins/alert.md"
    }
  ],
  "fields": [
    {
      "key": "legacyStyle",
      "type": "string",
      "notices": [{ "kind": "deprecated", "message": "Use variant." }]
    }
  ]
}
```

Each notice is a strict object:

| Property  | Required | Description                                                                          |
| --------- | -------- | ------------------------------------------------------------------------------------ |
| `kind`    | yes      | One of `pending`, `deprecated`, `diverges`, or `removed` (table below).              |
| `message` | yes      | What the person needs to know. Non-empty text that is not only whitespace.           |
| `since`   | no       | Since when the notice applies: a real date in the `YYYY-MM-DD` format.               |
| `ref`     | no       | Where the notice comes from, free non-empty text (the contract page, the code file). |

The four `kind` values have a **fixed severity**, in the order `removed` > `deprecated` = `diverges` > `pending`; the list is shown in the order `removed`, `deprecated`, `diverges`, `pending` and, within the same `kind`, in file order.

| `kind`       | Label (pt-BR / en-US) | Means                                                                                                                                                                     |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `removed`    | Removido / Removed    | Left the contract and must not be used.                                                                                                                                   |
| `deprecated` | Obsoleto / Deprecated | Deprecated; the `message` says what to use instead.                                                                                                                       |
| `diverges`   | Diverge / Diverges    | The sources disagree; the `message` says on what.                                                                                                                         |
| `pending`    | Pendente / Pending    | One source already has it and the other does not yet; the name of the platform or source opens the `message`, as in `compose: …` (the app core carries no platform name). |

- `notices`: a list (it may be empty) on the type (`layers[n].annotationTypes[m].notices`), on the field (`…fields[k].notices`), and on the `table` column (`…fields[k].columns[j].notices`). Two notices with the same `kind` and the same `message` in the list are the error `aviso repetido`, at the path of the second one. A `kind` outside the four, an empty or whitespace-only `message`, a `since` that is not a real date, an empty `ref`, and any other property are errors. In a version earlier than 10 the error is `só é permitido com formatVersion 10`, at the exact path.
- **The notice only informs.** No notice, not even `removed`, prevents importing the specialization, applying it, creating an annotation of the type, or accepting a proposal that uses it. The notice is also not a pending item: the **Incomplete** window and the problem codes of the annotations do not change. The Details show the field's notice even when the field is empty; the Notices window and the count only count the field with a value.
- **Outside the version contract:** adding, changing, or removing `notices` is compatible and never requires a migration (see "Version contract"). `diffSpecs` ignores `notices` and produces no difference, so whoever generates the specialization rewrites all the notices from its source (the same `ref`; see "Fidelity notices and notice sources"), and the notice disappears by itself when the difference between the sources disappears. Updating the specialization only because of notices shows no impact.

### Fidelity notices and notice sources

`notices` also record **fidelity**: where the design or behavior of a library approximates the platform. This subsection applies to any library and platform.

**Criterion.** A divergence in **design** or **behavior** between the library and the platform becomes a notice when it **changes a decision** of whoever marks (how to crop, which type or field to choose, what to expect from the design) or of whoever writes the code (which parameter to pass, which composable or view to swap, what to check on screen). The rest stays **only in the doc** of the component: interactive states that the static design does not show (pressed, focus, hover), literal values instead of tokens, subpixel differences, and the reference of the files used. A parameter that is not a field is not a matter for this rule: it belongs to the signature importer.

- **Example that becomes a notice:** `compose: the children of a slot have no weight; mark the real width of each one`. **Example that stays in the doc:** `without the pressed state`.
- **`ref`:** the path, inside the package, of the document that describes the difference, normally the type's `doc` (`docs/<type>.md`).
- **`kind`:** `diverges`. Use `pending` only when the limit has a **registered request** (an issue, a library ticket), cited in the `message`.
- **Platform prefix (rule):** the `message` of a notice tied to a platform or to a source **starts with its id and a colon** (`compose: …`). `notices` has no platform field and the core does not filter by text: whoever reads it (the person or the agent) ignores the notice whose prefix belongs to another platform.

**Two sources of notices**, told apart by the `ref`:

| Source             | `ref`                                                                                                  | Who writes it                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tool-generated** | The input file of the tool that produces the notice (for example, the signature sheet of an importer). | The tool **rewrites all** the notices with that `ref` on every run and does not touch the others.                                                                                    |
| **Hand-curated**   | Any other `ref`, such as the type's doc.                                                               | The author (or the `spec-author` skill), when writing or reviewing the doc. The tool never deletes it; it only goes away when the author reviews the doc and the difference is gone. |

- Nobody hand-writes a notice with a tool's `ref`: it would disappear on the tool's next run.
- A fidelity notice does not repeat what a tool-generated `pending` already says.

**How the app shows the two (no new control):**

- **Notices window:** fidelity notices and tool-generated ones are `notices` of the specialization and go into the **same list**, grouped by notice and sorted by severity. The `kind` filter separates `diverges` from `pending`, but it does **not** separate the curated `pending` (from a doc) from the generated `pending` (from a sheet): both are `pending`. The group header shows the badge, the place, the message, the `since`, and the count, **not the `ref`**.
- **The source only appears in the Details:** `Source: <ref>`, on the type's notice (`NoticeBlock`, at the top of the annotation) and on the field's and the column's (`NoticeLine`, below the control). Choosing a group's row in the window opens the annotation's Details, where the source is.

## Sources (sources)

`formatVersion` 3 says which elements of an **external system** (a design tool, another component catalog…) each type corresponds to and which source property each field comes from. This is what an import agent uses to know which component becomes which type, without deducing it from the name. The core does not interpret `system` or the names: it only validates the structure and returns the data to whoever asks for it.

```json
{
  "id": "button",
  "name": "Button",
  "sources": [{ "system": "figma", "id": "3f2a9c", "name": "DS/Button" }],
  "fields": [
    {
      "key": "estilo",
      "type": "enum",
      "options": ["primary", "secondary", "text"],
      "sources": [
        {
          "system": "figma",
          "name": "Style",
          "values": { "Primary": "primary", "Secondary": "secondary", "Text": "text" }
        }
      ]
    },
    {
      "key": "texto",
      "type": "string",
      "sources": [{ "system": "figma", "name": "Label" }]
    }
  ]
}
```

| Property  | Where                              | Description                                                                                                                                                        |
| --------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sources` | annotation type (optional)         | List of `{ system, id?, name? }`, each with at least `id` or `name`. A type can correspond to several elements (e.g., old and new variants of the same component). |
| `sources` | field or `table` column (optional) | List of `{ system, name, values? }`: the source property of the value.                                                                                             |
| `values`  | source of a field (optional)       | Only on `enum` fields: source value → one of the `options` (the targets must exist in `options`).                                                                  |

- `system`, `id`, and `name` are non-empty text; comparisons are exact (case matters).
- `sources` only exists from `formatVersion` 3: in versions 1 and 2 the file is rejected with the version message, instead of ignoring the sources.
- In TypeScript code, `findTypesBySource(specs, system, { id?, name? })` (in `src/model/`) returns the types that correspond to a source element: the ones that match by `id` first, then the ones that match only by `name`. Each result carries `executable` (the `system` is in that specialization's `origins`), and `isExecutableSystem(spec, system)` says the same for a system: whoever builds a response reads the `path` of the fields only where it exists. The search never matches by `path`.

### Executable source (`formatVersion` 4)

v4 lets a source be **executable**: the specialization declares in `origins` how to read the JSON of an external system (that of an SDUI backend, for example) and turn it into a screen of components. The core executes the **declaration**, which is data, and never code coming from the specialization; `system` is still just a name. A system is executable when its `system` appears in `origins`. This changes what `sources` ask for:

| Property | Where                                          | Description                                                                                                                                                                                         |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`   | `sources` of a field or column                 | The path of the value inside the `props` of the external node (`a.b[0].c`; no `[*]`). **Required** for a system declared in `origins`; **forbidden** for the others.                                |
| `name`   | `sources` of a field or column                 | Only the **name** of the source property (display). Optional for an executable system; required for the others, as in v3. It is never read as a path: a name with `.` or `[` is not misinterpreted. |
| `name`   | `sources` of the type                          | For an executable system it is the **name of the external type** (the `node.type` key of the node): it is how the node becomes the type. The `id` does not take part in the translation.            |
| `slot`   | `sources` of the type (executable system only) | Name of the component's `slot` node that receives the children of the external node (non-empty; the library validator checks that the component has that slot).                                     |
| `ignore` | `sources` of the type (executable system only) | Props that the external node carries and the design does not use (non-empty texts, no repeats). A prop that is neither a field path nor in `ignore` produces the notice `propriedade desconhecida`. |

```json
{
  "id": "card",
  "name": "Card",
  "component": "components/card.json",
  "sources": [
    {
      "system": "sdui",
      "name": "Card",
      "slot": "ações",
      "ignore": ["contentDescription"]
    }
  ],
  "fields": [
    {
      "key": "headline",
      "type": "string",
      "required": true,
      "sources": [{ "system": "sdui", "path": "headline" }]
    },
    {
      "key": "variant",
      "type": "enum",
      "options": ["elevated", "filled", "outlined"],
      "default": "elevated",
      "sources": [{ "system": "sdui", "path": "style", "name": "Style" }]
    }
  ]
}
```

The declaration is the root `origins` key: a list, one entry per system (unique `system`). It is **strict**: an unknown key is a problem, with the path (`origins[0].screen.roots[1].path: …`).

**Measured source (`kind: "measured"`, v15).** For a screen that already exists and can be measured (a web page open in a browser, the view hierarchy of an app), the source does not read a backend document: the MCP receives the tree `{ type, id?, classes?, rect: { x, y, width, height }, props?, children? }` in the `import_measured` op and creates one marking per node. The `sources` of the types and fields match as follows: on the type, the node's `id` against the source's `id`, then each class against the `name`, then the `type` against the `name`; on the field, the source's `path` is read in the node's `props` (with `values` for `enum`). Belonging comes from the geometry, not from the tree. Example: `{ "system": "dom", "kind": "measured" }`; library in `examples/libraries/medido/`.

| Property    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system`    | Required. The name of the system (the same `system` as in the `sources`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `name`      | Display text, optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `node`      | Required. `{ type, props, children }`: the names of the keys of the external node that hold the type, the props, and the children. All three are required in this version.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `screen`    | Required. Where the screen values live: `width` and `height` (required; without them there is no screen), `id`, `name`, `background`, `direction`, and `roots` (at least one root). Each value is a **literal** or `{ path, values?, default? }`, except `direction`, which only accepts the literal.                                                                                                                                                                                                                                                                           |
| `direction` | In `screen`, optional: the reading direction of the screen, `ltr` (default) or `rtl`. Only the literal (`"direction": "rtl"`): unlike the other screen values, it does not accept `{ path, values?, default? }`, and any other text is an error. In `rtl` the rows, the grids, the logical anchors (`top-start`, `start`, `bottom-start`, `top-end`, `end`, `bottom-end`), the default `font.align`, and the `mirror` nodes are mirrored; `padding` stays physical. See [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Reading direction".                                      |
| `roots`     | In `screen`. List of `{ path, anchor?, margin?, scrim? }`: `path` is the path of the root in the document (`[*]` makes each element become a root; a root that does not exist is ignored, with no notice); `anchor` is one of the nine screen anchors (`top-start`, `top`, `top-end`, `start`, `center`, `end`, `bottom-start`, `bottom`, `bottom-end`), literal or a path relative to the root node; `margin` is the distance from the edges in px; `scrim` is the `id` of a type drawn beneath the root (the backdrop of a modal). Without `anchor` the root enters the flow. |
| `kind`      | `tree` (default: the JSON of a backend, read by `node` and `screen`) or `measured` (`formatVersion` 15: a tree of measured rectangles, imported by the MCP `import_measured` op). The `measured` source accepts only `system`, `kind`, `name`, and `booleans`; `node`, `screen`, and `examples` are errors.                                                                                                                                                                                                                                                                     |
| `booleans`  | `{ "true": text, "false": text }`: how a JSON boolean becomes text in fields without their own `values` (e.g., `yes`/`no`).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `examples`  | List of `{ name, file }`: example screens (the JSON of a whole screen) of the system; `name` non-empty and unique in the source, `file` a `.json` package path.                                                                                                                                                                                                                                                                                                                                                                                                                 |

```json
{
  "origins": [
    {
      "system": "sdui",
      "node": { "type": "type", "props": "props", "children": "children" },
      "screen": {
        "id": { "path": "screen.id" },
        "width": { "path": "screen.device.width" },
        "height": { "path": "screen.device.height" },
        "background": {
          "path": "screen.background",
          "values": { "surface": "#FEF7FF" },
          "default": "#FFFFFF"
        },
        "roots": [
          { "path": "content" },
          { "path": "bottomBar", "anchor": "bottom" },
          {
            "path": "floating[*]",
            "anchor": { "path": "anchor" },
            "margin": { "path": "margin" }
          },
          { "path": "modal", "anchor": "bottom", "scrim": "sdui-scrim" }
        ]
      },
      "booleans": { "true": "yes", "false": "no" },
      "examples": [{ "name": "Settings", "file": "examples/settings.sdui.json" }]
    }
  ]
}
```

How the design is computed (`fill`/`hug` sizes, screen anchors, engine notices) is in [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). **Known limits**: one slot per component; props only inside `props` (there is no source with the props on the node itself); lists in the external JSON that become numbered fields (`items[0].label` becomes `label1`) are fragile, and a table field in their place is a future evolution; only the external → screen direction (there is no output from the screen to the external system).

## Library: the package

With v4, a specialization is a **library**: a **package**, which is the **specialization folder**, with everything it cites. The specialization file sits at the root of the folder.

```
sdui-backend/
  sdui-backend.spec.json       the specialization (formatVersion 9)
  components/sdui-button.json  one file per component (mapping-component)
  docs/sdui-button.md          the type's markdown document
  examples/settings.sdui.json  an example screen of an external system
  fonts/Roboto-Regular.woff2   the design fonts (optional)
```

The folder names (`components/`, `docs/`, `examples/`, `fonts/`) are a convention; what counts is the cited path. **Every path cited** by the specialization is relative to its file, with `/`, **without `..`**, without a leading `/`, and without a drive letter (the same rule as the `path` of `code`), and ends with the expected extension. When reading the library (components, fonts, icons, and `componentPaths`), a `..` that leaves the package folder is a library problem, `caminho fora da biblioteca: <ref>`, at the path of whoever cites it (`<type>`, `fonts[i]`, or `icons`), and is no longer silently discarded. A root of `origins[].screen.roots` with `margin` and without `anchor` is an error: `margin só vale com anchor` (path `…roots[i].margin`):

| Key                         | Where           | Extension                                |
| --------------------------- | --------------- | ---------------------------------------- |
| `component`                 | annotation type | `.json` (one component)                  |
| `doc` (text)                | annotation type | `.md`                                    |
| `examples[].file`           | annotation type | `.json` (the node of an external system) |
| `origins[].examples[].file` | source          | `.json` (a whole screen)                 |
| `fonts[].file`              | root            | `.ttf`, `.otf`, `.woff`, or `.woff2`     |

The format of the component file is in [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md). The new v4 keys:

| Property     | Where           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component`  | annotation type | The component file that draws the type. Optional: a type without a component stays valid, it just has no design.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doc`        | annotation type | The type's markdown document (when to use, variants, usage examples). In `formatVersion` 11 it can also be `{ repo, path }`, a document in an external repository, which is **not** part of the package (see "Document in an external repository (docRepos)").                                                                                                                                                                                                                                                                                                                                                 |
| `examples`   | annotation type | List of examples. `name` (non-empty and unique in the type) and an optional `description`, plus **one** of two modes: `values` (values of the type's fields) or `system` with `file` (the JSON of **one node** of an external system declared in `origins`: a component, not a screen).                                                                                                                                                                                                                                                                                                                        |
| `values`     | example         | Key of a field of the type itself (a column does not count) → value. `null` is always accepted; `string` asks for text, `date` asks for a valid `YYYY-MM-DD`, `number` asks for a finite number, and `enum` asks for one of the `options`. A `table` field accepts **only the list of rows**, in the format of the component's `preview`: column → text, number, or `null` objects, each cell checked against the column's type (`_id` and a key that is not a column are errors; a `ref` column only accepts `null`; the empty list is valid), and the `ref` field does **not** accept a value in an example. |
| `fonts`      | root            | List of `{ family, file, weight?, style? }`. `family` non-empty; `weight` is an integer from 100 to 1000 or a range `"100 900"` (two integers, the first smaller); `style` is `normal` (default) or `italic`. The `family` + `weight` + `style` triple cannot repeat.                                                                                                                                                                                                                                                                                                                                          |
| `origins`    | root            | The declaration of the executable source (see "Sources").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `migrations` | root            | The version contract (see "Version contract").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

```json
{
  "id": "button",
  "name": "Button",
  "labelField": "label",
  "component": "components/button.json",
  "doc": "docs/button.md",
  "fields": [
    { "key": "label", "type": "string", "required": true },
    {
      "key": "variant",
      "type": "enum",
      "options": ["filled", "tonal", "outlined"],
      "default": "filled"
    }
  ],
  "examples": [
    { "name": "Filled", "values": { "label": "Save", "variant": "filled" } },
    {
      "name": "Outlined",
      "description": "Button with a border.",
      "values": { "label": "Cancel", "variant": "outlined" }
    }
  ]
}
```

**Fonts.** The file of a declared font may be missing from the package (fonts have licenses and weight; the example package does not carry the `.ttf` files). The missing font **warns** and the design falls back to the system font; the package stays valid.

**Applying to a project.** Applying a library **copies the whole folder** to `specs/<id>/` (the copy of a v1 to v3 specialization is still the file `specs/<id>.json`). In the app, **Specializations** accepts the folder (`showDirectoryPicker`, Chrome/Edge) or a zip of the package (with or without a single root folder), checks the three levels, and shows errors (they block) and warnings (they let you apply); **Update from folder…/zip…** passes the applied version as `previous` to the version contract (a break without a migration is an error) and rewrites the folder, and **Remove** deletes it. A v4 or v5 specialization that **cites no file of the package** (no type with `component`, text `doc`, or `examples`, and no `fonts`, `origins`, or `icons` at the root; `migrations` does not count, nor does the v11 object `doc`, which is a document in an external repository) is valid as a standalone file, like v1 to v3: the app applies and updates it with the `.json` and the copy is `specs/<id>.json`. A v4 or v5 `.json` that cites files of the package is **rejected** in the app: it asks for the folder (or the zip). When the project is opened, Diagnostics shows the level 1 and 2 problems of the copy. The MCP server tools and the skill that writes the package are also part of B2.

**Built-in package.** `libraries/notas/` (v7 specialization: the Notes layer, the floating type `nota`, and the sticky-note component) is an ordinary package that the app ships inside the build and **applies by default** to a new project and to an open project of a schema earlier than 13 (see "Floating type"). For the rest of the cycle it is a library like the others: the copy goes to `specs/notas/` and the person can remove it.

**Example package.** `libraries/material3-compose/` is Material Design 3 (baseline, light and dark theme) for Jetpack Compose, ready to use: the v15 specialization (library v2) with fifty types, each with `component`, `doc`, and one to three examples, the components, the container sizes, the `tokens` in the `light` and `dark` modes, the icon set in `icons/`, and Roboto in `fonts/`. The executable source (`origins`, `sources`, `migrations`, and the example screen `examples/settings.sdui.json`, an SDUI screen without rectangles, translated by `origins`) is in `examples/libraries/sdui-backend/`. The tests use a frozen copy of an old fifteen-type package, in `tests/fixtures/material3/` (it is not a distributed example).

## Design tokens

`tokens` (`formatVersion` 15, optional, at the root) holds the library's named **design values**: colors, radii, spacings, and font families. Format 4 components read each value with `{ "$token": "name" }` (see `docs/COMPONENT-FORMAT.md`), instead of repeating the literal in each node. Changing the value in a single place changes the whole design.

For color, `{ "$token": "scrim", "alpha": 0.32 }` multiplies the alpha of the token's color (the opacity without duplicating the token in the specialization; `alpha` is a number from 0 to 1 or a number `$token`). The token is also valid in `shadow.x`/`y`/`blur`, in each item of `cornerRadius` and `stroke.dash`, and in `stroke.offset` (see `docs/COMPONENT-FORMAT.md`).

```json
{
  "formatVersion": 15,
  "tokens": {
    "modes": ["light", "dark"],
    "values": {
      "primary": { "light": "#6750A4", "dark": "#D0BCFF" },
      "on-primary": { "light": "#FFFFFF", "dark": "#381E72" },
      "radius-md": 12,
      "space-4": 16,
      "font-sans": "Roboto, sans-serif"
    }
  }
}
```

- `modes`: a **non-empty** list of distinct names in the format `[a-z0-9][a-z0-9-]*`. The convention is `["light", "dark"]`.
- `values`: the token name (`[a-z0-9][a-z0-9-]*`) points to a value, which is **text** (a `#rrggbb` color, `rgba(…)`, or a font family) or a **number** (radius, spacing, size, weight).
- A **simple** value applies in all modes (`"radius-md": 12`). A **per-mode** value is an object with **all** the modes of `modes` (and only them) and all of the **same type**: mixing a color in one mode and a number in the other is an error.
- **Built-in:** `font-sans` and `font-mono` (font families) exist in every library, even without `tokens`, and take the host's font (in the app, the theme's `--font-sans` and `--font-mono`; in the viewer, the app tokens' stack or the `fonts` option; in the MCP, the built-in Mapping Sans). The specialization can redefine them in `values`, and its definition wins over the host's. Text without `font.family` uses `font-sans`.
- **Keys of `tokens`:** only `modes` and `values` exist. Any other key is a validation error, at its path: `tokens.<chave>: chave desconhecida: <chave>`. Since `tokens` was already read by the validator, a library that carried an extra key and passed before is now rejected (the `formatVersion` is still 15).
- **Drawing mode:** the design follows the mode of the project and of the container (`drawingMode`, see `docs/FORMAT.md`); with no mode chosen, it uses the **first** of `modes`, and an undeclared mode falls back to the first, without a notice.
- Validation errors, with the path in `tokens`: `só é permitido com formatVersion 15`, a name outside the pattern, empty `modes` or with a repeated name, a per-mode value missing some mode (or with a mode that does not exist in `modes`), and values of different types across modes. In `validate_library` (level 2), a `$token` with a nonexistent name is `o token "x" não existe nos tokens da especialização` and with the wrong type is `o token "primary" é cor, mas aqui se espera número`.

## Icon set

`icons` (`formatVersion` 15, optional, at the root) is the path of **one** `.json` file of the package, relative to the specialization file (like `component`, `doc`, and `fonts[].file`: no `.`, `..`, or drive, with `/`). The file holds the library's icons; the `icon` node of format 4 components (`docs/COMPONENT-FORMAT.md`) picks one by name. This replaces the `$switch` that repeated all the paths inside each component that shows an icon chosen by the person.

```json
{
  "format": "mapping-icons",
  "formatVersion": 2,
  "viewBox": [24, 24],
  "icons": {
    "check": {
      "paths": [
        {
          "d": "M5 12l5 5L20 7",
          "stroke": true,
          "width": 2,
          "cap": "round",
          "join": "round"
        }
      ]
    },
    "arrow-forward": {
      "mirror": true,
      "paths": [{ "d": "M4 12h14m-6-6l6 6l-6 6", "stroke": true, "width": 2 }]
    },
    "dot": {
      "viewBox": [10, 10],
      "paths": [{ "d": "M5 1a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "fill": true }]
    }
  }
}
```

- `format` is `mapping-icons` and `formatVersion` is `1` or `2` (`2` is `1` plus the per-icon `mirror`; any other is the error `formatVersion: deve ser 1 ou 2`). `1` is still accepted unchanged. `viewBox` (positive `[width, height]`) is required and applies to all the icons that do not carry their own.
- `mirror` (`formatVersion` 2 of the file, per icon, default `false`): the icon **flips horizontally** when the reading direction is `rtl` (an arrow, a chevron, an "undo"; not a clock or a camera). Whoever mirrors is marked once, here, and every component benefits; the `icon` node can override it with its own `mirror` (see [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Reading direction"). `mirror` in a `formatVersion` 1 file is the error `só é permitido com formatVersion 2`, and a value that is not a boolean, `esperava true ou false`.
- `icons`: the icon name (`^[a-z0-9][a-z0-9-_]*$`; `Check` is an error) points to `{ viewBox?, mirror?, paths }`. `paths` is a **non-empty** list of `{ d, fill?, stroke?, width?, cap?, join? }`: `d` is the SVG data; `fill` and `stroke` are `true` (the color of the `icon` node), `false` (nothing), or a color of their own; `width` is the stroke width in `viewBox` units (default 1); `cap` (`butt`, `round`, `square`) and `join` (`miter`, `round`, `bevel`) as in the component's `stroke`. A path with neither `fill` nor `stroke` is filled with the node's color; with `stroke` and without `fill`, only the stroke appears.
- The file is part of the package: the app copies it with the folder (`specs/<id>/`), the specialization that declares `icons` is not valid as a standalone file, and the file pointed to is not an "unreferenced file".
- **Library validation.** Level 1: the file exists (`arquivo não encontrado: <caminho>`, at the specialization's `icons` path) and is a valid `mapping-icons` (each error with the path inside the file, e.g., `icons.Check: nome inválido; use [a-z0-9][a-z0-9-_]*`). Level 2: every **literal** name of an `icon` node exists in the set (`o ícone "nuvem" não existe no conjunto de ícones (icons/set.json)`, at the path of the `name`); without a declared `icons` the literal is an error (`o ícone "check" não pode ser conferido: a especialização não declara icons`). Level 3: an `enum` field read by the `name` of an `icon` node with an `option` that is not in the set produces a warning (`a opção "nuvem" do campo "icon" não está no conjunto de ícones; o desenho cai no reservado`), and the design check warns `ícone desconhecido: <nome>`.

## Version contract

`version` (integer ≥ 1) is the **package version**. Bumping a library's version is a decision that can break the projects that applied it; the contract says what is safe and what requires a declared migration. Two versions of the same package are compared by `diffSpecs(previous, new)` (in `src/model/specVersions.ts`, a pure function) and each difference is **additive** or **breaking**. Type, field, and option are identified by `id`, `key`, and text, never by position; the columns of a `table` count as fields of the type.

**Additive** (only adds; updating loses nothing):

- a new type, a new **optional** field (column included), a new `enum` option;
- a new **role** (`childRoles`) on a type that already had roles (`added-role`: existing annotations keep the role they had);
- a new `component`, `doc`, example, or font, or another component file for the type;
- changing the **design** (the component's template) without changing the fields.

**Breaking** (and only this): removing or renaming a **type**, a **field** (or column), or an **`enum` option**; making a field **required**, including a new field that is born required (existing values become incomplete); changing a field's `type`.

**Role breaks** (comparing the type by the same `id`; applies to every version that has roles, from 11 on):

- `removed-role`: a `childRoles` role that is gone, including a type that loses all of them. Annotations store the role's `id` in `parentRole`, and that `id` ceases to exist.
- `roles-required`: a type that had no `childRoles` and now has them. The children that were already linked are left without a role, and now the owner asks for one.

A v11 that removes a role is rejected until it moves up to `formatVersion` 12 with the step that covers it. **Renamed owner:** when the type was renamed (`rename-type`), the roles are **not** compared between the old and the new type; a role that annotations use and that does not exist in the new type becomes `unknown-role` when migrating, and the author can declare `rename-role` with the new `id`, **after** the `rename-type`.

**Outside the contract**, on purpose: `fieldModels`, `signature`, `ignore`, `calls`, `formats`, and the paths and positionals in `params` (`formatVersion` 16; what a signature import adds, an optional field or an `enum` option, is additive like any other), layers, `labelField`, `allowedChildren` (including the `{ layer, groups }` clause and, in 13, the children of the layer itself), `requiresOwner`, `description`, `tags`, `code`, `platforms`, `containers`, `sources`, `suggestions`, `linkedRef`, `notices`, `accepts.annotations`, `groups` (of the layer and of the type), the `name` and `description` of a role, the order of `childRoles`, `childRolesLabel` and `docRepos`, switching the `doc` between text and object, and removing a `component`, a `doc`, an example, or a font. None of this produces a difference. A rename is indistinguishable from remove + add; whoever renames **declares** it in a `rename-*` step, and that is what sets it apart from a removal.

### `migrations`

Every break needs an entry in `migrations` at the root of the new version. Each entry links two versions of the package and carries **declarative steps**:

```json
{
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [
        { "op": "rename-field", "type": "button", "from": "texto", "to": "label" },
        {
          "op": "map-values",
          "type": "button",
          "field": "variant",
          "values": { "primary": "filled" }
        },
        { "op": "fill-field", "type": "button", "field": "size", "default": "md" },
        { "op": "rename-type", "from": "chip", "to": "tag" },
        { "op": "remove-field", "type": "tag", "field": "legacy" },
        { "op": "remove-type", "type": "badge", "mode": "convert" }
      ]
    }
  ]
}
```

`from` is an integer ≥ 1; `to` is greater than `from` and does not exceed `version`; `steps` is not empty; no `from` repeats. The nine steps and the break each one covers (the last three, for roles, are from `formatVersion` 12):

| Step (`op`)    | Keys                         | Covers the break                                                                                                                                                                                         |
| -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rename-type`  | `from`, `to`                 | removed type (`from` is the type that left; `to` exists in the new version).                                                                                                                             |
| `remove-type`  | `type`, `mode`               | removed type. `mode` (`convert` or `delete`) says the destination of the type's annotations.                                                                                                             |
| `rename-field` | `type`, `from`, `to`         | removed field (`from` is the one that left; `to` exists in the type).                                                                                                                                    |
| `remove-field` | `type`, `field`              | removed field (the type still exists).                                                                                                                                                                   |
| `map-values`   | `type`, `field`, `values`    | removed `enum` option: each key of `values` is an old option and the target is a current `option`.                                                                                                       |
| `fill-field`   | `type`, `field`, `default`   | field that became required, new required field, **or** changed `type`: the `default` (text or number, valid for the field's type) goes in its place; with a changed `type` the old values are discarded. |
| `rename-role`  | `type`, `from`, `to`         | `removed-role`: renamed role (`type` is the **owner** type; `from` is the role that left; `to` exists in the type). If `to` already existed in the previous version, the two roles **merge**.            |
| `remove-role`  | `type`, `role`, `mode`       | `removed-role`: removed role (the type may even have no `childRoles` left). `mode` (`clear` or `unlink`) says the destination of the children that used the role.                                        |
| `set-role`     | `type`, `role`, `childType?` | `roles-required`: type that started having `childRoles`. Gives the role `role` to the owner's children **without a role** (only to those of type `childType`, when present).                             |

- **Roles (v12).** In the three role steps, `type` is the type of the **owner** (the one with `childRoles`), identified by the `id` it has **at that point of the chain**: after a `rename-type` of the owner, the new id. `rename-role` and `set-role` only fill in or swap the role and never remove a child; `set-role` **fills in and never overwrites** (a child that already has a role stays as it is). The `childType` of `set-role` can be an old id when the step comes **before** the child's `rename-type`. Coverage: a `removed-role` of a role `r` of type `T` is covered by `rename-role` with `type: T, from: r` or by `remove-role` with `type: T, role: r`; `roles-required` of `T` is covered by any `set-role` with `type: T` (the children that no step reaches are left with the `missing-role` pending item). A v11 specialization only declares these steps after moving up to 12.
- The field key of a step (`field`, `from`, `to`) is the field's `key` **or** `table.column`: the column of a `table` also stores data, so changing a column (removing it, changing its `type`, making it required) is a break and is covered by the same step.
- The file is checked on its own (validator level 1): the **new side** of the step exists in the version (`rename-type.to` is a type here; the `to`/`field` field exists in the type; the `map-values` targets are in the `options` of an `enum` field; the `default` of `fill-field` is valid for the field) and the **old side** no longer exists (`rename-type.from` and `remove-type.type` are not types of this version; `rename-field.from` and `remove-field.field` are not fields of the type). That the old side existed in the previous version is checked when two versions are compared. In the role steps: `rename-role.type` is a type of this version **with** `childRoles`, `to` is a role of it and `from` is not; `remove-role.type` is a type of this version (it may no longer have `childRoles`), `role` is not a role of it, and `mode` is `clear` or `unlink`; `set-role.type` has `childRoles`, `role` is a role of it, and `childType`, when present, only has its id format checked (a type that does not exist is a no-op). In the comparison (level 2) a `rename-role.from` or `remove-role.role` that was not a role of the type in the previous version (considering the owner's `rename-type`) is a **warning**.
- The **chain** links the entries by `from → to`, from the version the project applied up to the new `version` (`migrationChain`). A broken chain (an entry for some version is missing) leaves **every** break without coverage. `missingMigrations(previous, new)` returns the breaks that no step of the chain covers; an empty list means the contract is fulfilled, and `migrationFor` says which step covers a break.
- The library validator (level 2) uses the contract when it receives the previous version: each break without a step becomes an **error**, and so does a `version` that did not grow.

### Migration execution

When **updating** an applied library (`updateSpecialization`, in the app and in the MCP), the app runs the `from → to` chain over the project's annotations (`runLibraryMigrations`, in `src/model/libraryMigrations.ts`, pure and without browser APIs) and only then swaps the applied copy, the layers, and the version. It is all a single operation: in the app, **Undo** gives back the `specs/<id>/` folder and the data together.

- **Chaining.** The chain starts at the version the project applied and follows the entries by `from → to` up to the new `version`; the steps run in order, and each one operates on the result of the previous one (the type is what the annotation has **at that point**, after the earlier renames). Only the specialization's own annotations are touched. Broken chain (an entry is missing) or no `migrations`: nothing runs. A step that finds nothing is a no-op.
- **Loss × pending item.** **Loss** is a **non-empty** value that the step erased or overwrote: it appears highlighted in the dialog before updating. A **pending item** is data that the migration cannot fix and leaves as it is: after updating it shows up in **Incomplete**, without erasing anything.

| Step           | What it does to the data                                                                                                                                                                                                                                                                        | Loss                                                                                      | Pending item                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `rename-type`  | Swaps the `typeId` of the type's annotations. The layer does **not** change.                                                                                                                                                                                                                    | no                                                                                        | `layer-mismatch` if the new type's layer is another one                                                                   |
| `remove-type`  | `convert`: the annotation becomes **free** (the values become key-value pairs, the link stays). `delete`: deletes the annotation **and those linked to it** (also of other types and free ones).                                                                                                | only with `delete`: each deleted annotation                                               | `layer-mismatch` with `convert` (it stays in the layer)                                                                   |
| `rename-field` | Moves the value from `from` to `to`; on a top-level field it also rewrites the references (`ref`) in the whole project that point to the field or to a row of its table. Between different shapes (field × column, or different tables) there is no way to move: the value of `from` is erased. | `to` already had a value (overwritten) or the shape does not allow moving                 | no                                                                                                                        |
| `remove-field` | Erases the key from `values` (or the column, in each row). An empty value does not count as a loss.                                                                                                                                                                                             | non-empty value                                                                           | no                                                                                                                        |
| `map-values`   | Swaps the old `enum` value for the target in `values`.                                                                                                                                                                                                                                          | no                                                                                        | `unknown-option` for a value that is neither in `values` nor in the current options                                       |
| `fill-field`   | An **empty or missing** value gets the `default`. A value that is **worth nothing** in the field's type (`invalid-value`, like text in a field that became a number) is swapped for the `default`.                                                                                              | only the value swapped because of `invalid-value`                                         | `unknown-option` (value outside the options) stays as it is                                                               |
| `rename-role`  | Swaps the `parentRole` of the owner's children that used the role `from` for `to`. If `to` already existed in the previous version, the two roles merge.                                                                                                                                        | no                                                                                        | no                                                                                                                        |
| `remove-role`  | `clear`: the child stays linked to the owner and is left without a role (`parentRole: null`). `unlink`: the child is unlinked (`parentAnnotationId: null` and `parentRole: null`) and keeps existing.                                                                                           | `clear`: `cleared-role` (the role that was in the value). `unlink`: `unlinked` (the link) | `clear`: `missing-role` if the owner still has roles. `unlink`: `missing-owner` when the child's type has `requiresOwner` |
| `set-role`     | Gives the role `role` to the owner's children that **have no role**; with `childType`, only to those of that type. Fills in and never overwrites.                                                                                                                                               | no (never produces a loss)                                                                | no                                                                                                                        |

The field key of a step is the `key` or `table.column`; on a column the step applies to each row of the table.

**Role steps (v12).** The owner's **children** are the annotations whose `parentAnnotationId` points to an annotation of the specialization whose type, at that point of the chain, is the step's `type`; the child can be of any type, of another specialization, or free. Invariant: a non-null `parentRole` requires a non-null `parentAnnotationId`. In the per-step report, `annotations` counts the changed children and `unlinked` counts the unlinks.

**What is rejected.** With a v4 or v5 specialization and the applied copy available, `updateSpecialization` **rejects** a version with a break without a step that covers it (`spec-missing-migrations`, and in the app the **Update** button is disabled): nothing is changed. Versions 1 to 3 have no `migrations` and are **not rejected**: the update proceeds as it used to (values that stop being valid become pending items). Without the applied copy, nothing is compared.

**What the impact reports.** `specializationUpdateImpact` (in `src/model/specializations.ts`) returns `changes`, `breaking`, `missingMigrations`, `migrations`, and `comparable` and, with the simulated execution over the project, `additive` (no break: the data stays as it is), `refused` (break without a migration), `steps` (the per-step report: annotations, values, converted, deleted, references, and unlinked), `losses` (each value, annotation, or link that the update erases: includes `papel limpo` and `vínculo desfeito`), and `pending` (what becomes a pending item). The update dialog shows this: "Additive update: the data stays as it is.", or **Migration steps** with the counts, the losses highlighted ("This update deletes N value(s) and M annotation(s).", with "and K link(s)" at the end when there is an undone link), and the pending items ("N pending item(s) remain"). After updating with pending items, the **Incomplete** window opens by itself.

### Examples

The excerpts are what changes in the specialization file (`version` and `migrations`); the rest of the file (layers, types, components) follows normal v4.

**(a) Additive evolution, v1 → v2.** A new component and a new optional field: no break, so **no** `migrations`. The project data stays as it is.

```json
{
  "formatVersion": 4,
  "id": "loja",
  "version": 2,
  "layers": [
    {
      "id": "telas",
      "annotationTypes": [
        {
          "id": "botao",
          "component": "components/botao.json",
          "fields": [
            { "key": "texto", "type": "string", "required": true },
            { "key": "nota", "type": "string", "required": false }
          ]
        },
        { "id": "cartao", "component": "components/cartao.json", "fields": [] }
      ]
    }
  ]
}
```

(`nota` and the `cartao` type are new in v2; `texto` already existed.)

**(b) Renaming a field, v2 → v3.** The `botao` field `texto` is now called `rotulo`. Without the step, v3 would be a rejected break.

```json
{
  "version": 3,
  "migrations": [
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "rename-field", "type": "botao", "from": "texto", "to": "rotulo" }
      ]
    }
  ]
}
```

On a `botao` annotation, the `values` changes like this (the other keys stay; a `ref` that pointed to `texto` now points to `rotulo`):

```json
{
  "antes": { "texto": "Sign up", "nota": "primary" },
  "depois": { "rotulo": "Sign up", "nota": "primary" }
}
```

**(c) Chain of two entries, applied to a project on v1.** v3 carries both entries (v1 → v2 and v2 → v3) and the update runs both in order:

```json
{
  "version": 3,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "rename-type", "from": "chip", "to": "etiqueta" }]
    },
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "fill-field", "type": "etiqueta", "field": "tamanho", "default": "md" },
        {
          "op": "map-values",
          "type": "etiqueta",
          "field": "estilo",
          "values": { "primary": "filled" }
        }
      ]
    }
  ]
}
```

Before (project on v1) and after (v3), for a `chip` annotation:

```json
{
  "antes": { "typeId": "chip", "values": { "estilo": "primary" } },
  "depois": { "typeId": "etiqueta", "values": { "estilo": "filled", "tamanho": "md" } }
}
```

An annotation with `"estilo": "outline"` (which is neither in `values` nor in the v3 options) keeps the value and becomes the `unknown-option` pending item, which opens in **Incomplete**. If the project were already on v2, only the second entry would run; if the v1 → v2 entry were missing, nothing would run and the update would be rejected.

**(d) Removing a type: `convert` and `delete`.** The `selo` type leaves in v2. Both forms cover the break; the difference is the destination of the annotations.

```json
{
  "version": 2,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "remove-type", "type": "selo", "mode": "convert" }]
    }
  ]
}
```

With `convert`, the `selo` annotation becomes **free**: `{ "texto": "New" }` becomes the pair `texto` = `New`. Nothing is lost (the dialog shows "1 converted"); the annotation stays in the layer it was in, and if the layer belongs to the specialization it goes into **Incomplete** (`layer-mismatch`).

```json
{
  "version": 2,
  "migrations": [
    {
      "from": 1,
      "to": 2,
      "steps": [{ "op": "remove-type", "type": "selo", "mode": "delete" }]
    }
  ]
}
```

With `delete`, the `selo` annotation is **deleted, and so are those linked to it**. That is a loss: before updating, the dialog warns, highlighted, "This update deletes 0 value(s) and 2 annotation(s)." (one per deleted annotation, with the list of which marking and which name), and **Undo** brings everything back.

**(e) Roles (`formatVersion` 12).** In v3 of the `loja` specialization, `button` renamed the role `tap` to `click` and no longer has the role `legado`, and `card`, which had no roles, now has the role `abrir`. Without the three steps, v3 would be rejected (`removed-role` and `roles-required`). This is a complete file, because `formatVersion` 12 is the one that accepts the steps:

```json
{
  "format": "mapping-spec",
  "formatVersion": 12,
  "id": "loja",
  "name": "Store",
  "version": 3,
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [
            { "id": "click", "name": "Click" },
            { "id": "hold", "name": "Hold" }
          ],
          "fields": []
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "eventos" }],
          "childRoles": [{ "id": "abrir", "name": "Open" }],
          "fields": []
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Events",
      "color": "#43A047",
      "annotationTypes": [
        { "id": "navigate", "name": "Navigate", "requiresOwner": true, "fields": [] }
      ]
    }
  ],
  "migrations": [
    {
      "from": 2,
      "to": 3,
      "steps": [
        { "op": "rename-role", "type": "button", "from": "tap", "to": "click" },
        { "op": "remove-role", "type": "button", "role": "legado", "mode": "clear" },
        { "op": "set-role", "type": "card", "role": "abrir", "childType": "navigate" }
      ]
    }
  ]
}
```

On a project on v2, the update changes only the children's link (`parentRole`), never the child itself:

```json
{
  "antes": [
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "tap" },
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "legado" },
    { "typeId": "navigate", "parentAnnotationId": "<card>", "parentRole": null }
  ],
  "depois": [
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": "click" },
    { "typeId": "navigate", "parentAnnotationId": "<button>", "parentRole": null },
    { "typeId": "navigate", "parentAnnotationId": "<card>", "parentRole": "abrir" }
  ]
}
```

- `rename-role` swaps `tap` for `click` with no loss or pending item. If `click` already existed in v2, the children of both roles would end up occupying the same one: that is how two roles **merge**.
- `remove-role` with `clear` keeps the child linked and erases the role: that is a **loss** (`cleared-role`, the `legado` that was in the value, shown highlighted in the dialog) and, since `button` still has roles, the child ends up in **Incomplete** (`missing-role`) until the person chooses one. With `unlink`, the child would be unlinked from `button` (loss `unlinked`) and, since `navigate` has `requiresOwner`, it would be left pending an owner (`missing-owner`).
- `set-role` gives `abrir` only to the `navigate` children of `card` that **had no role**; a child that already had a role stays as it is, and the step never produces a loss. The `childType` can be the child's **old** id when the step comes before its `rename-type`: giving the role **before** the rename is what preserves the information of a type that is going to be renamed.

## Library validation

`validateLibrary` (in `src/model/library.ts`) validates a package that has **already been read**: it receives the list of files (`{ path, text? }` for `.json` and `.md`, `{ path, binary: true }` for a present font), the path of the specialization (without it, it looks for the single file with `"format": "mapping-spec"`), optionally the previous version (`previous`, which turns on the version contract), and how far to go (`level`, default 3). It is pure: it reads neither disk nor network.

**An error prevents use, a warning allows use.** Each problem is `{ file, path, message, severity }` (`severity` is `error` or `warning`; `file` is the problem's file and `path` the path inside it, both can be empty):

```json
{
  "file": "sdui-backend.spec.json",
  "path": "layers[0].annotationTypes[2].component",
  "message": "arquivo não encontrado: components/sdui-fab.json",
  "severity": "error"
}
```

The report carries `ok` (no errors at all), `issues` (all of them, in level order), `errors`, `warnings`, the `spec` read, and a `summary` (level reached and counts of types, components, documents, examples, and fonts). The levels run in order and each one only runs if the previous one left what it needs: without a readable specialization there is no level 2; an invalid component does not prevent the others from going through levels 2 and 3.

1. **Each file in isolation, strict.** The specialization (`parseSpec`; the warnings from `specWarnings`), each cited component (`parseComponent`, with the path inside the file), each document (an empty `.md` warns). A cited file that is not in the package is an **error** (`arquivo não encontrado`); a `.json` or `.md` in the package that nobody cites is a **warning** (`arquivo não referenciado pela especialização`).
2. **Coherence between files.** The `slot` declared in the type's `sources` exists in the component (error); every field the design uses exists in the type (**error**: the design cannot find the value); a `preview` field that the type does not have, a type field that the design does not use, and two types with the same component file are **warnings**; the external-system example files exist and are JSON (error when not); the `scrim` of the roots is a type of the specialization (error); the file of each font exists (**warning** when missing: the design uses the system font); and, with `previous`, the version contract (error for a break without a step and for a `version` that did not grow; warning for a step that cites something that did not exist in the previous version).
3. **Design check.** Each component is instantiated with the `preview` values (or the fields' defaults) and with **each values example**, at the `size` (the `minSize` is not drawn): each engine notice becomes a package warning with `(aproximado)` at the end, because here the text is measured **approximately** (the real measurement is the browser's). A failure to draw is an error. Each external-system example (the type's, `system` + `file`, and each screen of `origins[].examples`) goes through the source declaration: an error in the result is an error, and unknown property and the source's other warnings are warnings. The list of notices is in [`COMPONENT-FORMAT.md`](COMPONENT-FORMAT.md), "Engine notices".

The three entry points — **the application, the MCP server, and the `spec-author` skill** — call the **same function** and show the same report. This belongs to phase B2 of the Library stage; today the function exists and is covered by tests, but no entry point calls it yet.

The packages `libraries/material3-compose/` and `examples/libraries/sdui-backend/` pass the validator with **zero errors and zero warnings** (`tests/model/material3ComposeLibrary.test.ts` and `tests/examples/sduiBackendLibrary.test.ts` pin the result). The design check only draws the initial size (`size`): the `minSize` is not drawn, because the warning on it would only serve whoever writes the component.

## Validation rules

Error messages carry the path, e.g.: `layers[1].annotationTypes[0].fields[2].type: "numero" inválido; use "string", "number", "date", "enum", "table" ou "ref"`.

- `format`, `formatVersion` (1 to 16), `id`, `name`, and `version` are required; `version` is an integer ≥ 1;
- layer ids are unique; type ids are unique across the whole specialization; `key` is unique in the type and in the columns; no `key` starting with `_`;
- `allowedChildren` only references existing types **in another layer** (from `formatVersion` 13, also in the owner's own layer, including the type itself);
- every type with `requiresOwner: true` appears in the `allowedChildren` of some **other** type (in v11, in the **resolved** set of children of some owner: by id, by whole layer, or by group); a type that only lists itself does not satisfy this (`nenhum outro tipo o aceita como filho`);
- `default` compatible with the type (and present in `options` for `enum`); `ref` without `default`;
- `columns` only with simple types or, in `formatVersion` 7, `ref` (with `accepts`); a `table` inside a `table` is rejected; `rowLabel` is required in a `table` with `tags` and must point to a `string` column;
- `labelField` points to a `string` field of the type;
- `accepts` with at least one tag, `free: true`, or `annotations`; tags in the format `[a-z0-9-]+`;
- **v14, `accepts.annotations`:** only from `formatVersion` 14 (before that, `só é permitido com formatVersion 14`, at the path `…accepts.annotations` of the field or column); a non-empty list of type ids or `{ layer, groups }` clauses of the same specialization; a nonexistent layer, group, or type are the `allowedChildren` errors;
- **v15, `structural`:** only from `formatVersion` 15 (before that, `só é permitido com formatVersion 15`, at the path `…annotationTypes[n].structural`); boolean; `true` with a `component` on the same type is an error;
- **v15, `origins[].kind`:** only from `formatVersion` 15 (before that, `só é permitido com formatVersion 15`, at the path `origins[n].kind`); `tree` (default) or `measured`; `measured` accepts only `system`, `kind`, `name`, and `booleans` (`node`, `screen`, and `examples` are errors, with the path).
- **v15, `tokens`:** only from `formatVersion` 15 (before that, `só é permitido com formatVersion 15`, at the path `tokens`); `modes` a non-empty list of distinct names `[a-z0-9][a-z0-9-]*`; a token name in the same pattern; each value is text or a number, simple or with all the modes (and only them) of the same type (see "Design tokens");
- **v16:** `fieldModels`, `signature`, `ignore`, `calls`, and `formats` (in `code`, for `variants` and, for `signature`, in `sources`) only from `formatVersion` 16 (before that, `só é permitido com formatVersion 16`, at the path of the key); `like` points to an existing `<type>.<field>`; `format` and template have `{value}`; the first segment of a path in `params` is in `calls`; see "Signatures and field models";
- `platforms`: `id` in the format `[a-z0-9-]+` and unique, `name` required, `language` and `repo` optional; `platforms` and `code` from `formatVersion` 2;
- **v5, `repo`:** only in `formatVersion` 5, inside an entry of `platforms` (in an earlier version the error is `só é permitido com formatVersion 5`, at the path `platforms[0].repo`); `url` required, starting with `http://` or `https://`, no spaces; `urlTemplate` optional, also `http(s)://` and with `{path}`; `ref` optional, non-empty text; any other property in `repo` is rejected;
- **v11, children by layer and group:** only from `formatVersion` 11 (in an earlier version the error is `só é permitido com formatVersion 11`, at the path `…annotationTypes[n].allowedChildren[k]` for the clause, `layers[n].groups`, and `…annotationTypes[m].groups`); each item of `allowedChildren` is a type id or a strict `{ layer, groups? }` clause (another property is an error, and so is `groups: []`); errors: a `layer` that is not a layer of the specialization, a `layer` that is the owner's own layer (`filhos devem estar em outra camada`), and a nonexistent group in the clause's layer; `requiresOwner` is checked against the resolved set; `layers[n].groups`: `id` non-empty and unique in the layer, `name` non-empty; `annotationTypes[m].groups`: a non-empty list, without repeats, only of groups of the layer itself (a group that does not exist in the layer is an error); **warnings:** 20 or more ids as text in the same `allowedChildren` (`N tipos listados um a um; uma cláusula { layer, groups } cobre a camada ou os grupos`; with 19, no) and a declared group that no type uses (see "Children by layer and group");
- **v13, children in the layer itself:** the `{ layer }` clause of the type's own layer and the id of a type in the same layer (including the type itself) are only accepted from `formatVersion` 13; in an earlier version the errors are `camada "x" é a do próprio tipo; filhos devem estar em outra camada` (at the path `…allowedChildren[k].layer`) and `tipo "x" está na mesma camada; filhos devem estar em outra camada`; the rest of the `allowedChildren` rules (nonexistent layer and groups, `requiresOwner` in the resolved set) does not change (see "Children by layer and group");
- **v12, role steps in `migrations`:** `rename-role`, `remove-role`, and `set-role` only from `formatVersion` 12 (in a version from 4 to 11 the error is `só é permitido com formatVersion 12`, at the path `migrations[i].steps[j].op`); the message of an invalid `op` lists the nine steps; strict keys (`rename-role`: `type`, `from`, `to`; `remove-role`: `type`, `role`, `mode`; `set-role`: `type`, `role`, optional `childType`); `rename-role`: `type` is a type of this version with `childRoles`, `to` is a role of it and `from` is not; `remove-role`: `type` is a type of this version (it may no longer have `childRoles`), `role` is not a role of it, and `mode` is `clear` or `unlink`; `set-role`: `type` has `childRoles`, `role` is a role of it, and `childType`, if present, only has its id format checked (a nonexistent type is a no-op); **warning** (level 2, with the previous version): `rename-role.from` or `remove-role.role` that was not a role of the type in that version, considering the owner's `rename-type`; contract: `removed-role`, `roles-required`, and `added-role` (see "Version contract");
- **v11, `childRoles` and `childRolesLabel`:** only from `formatVersion` 11 (`só é permitido com formatVersion 11`, at the path `…annotationTypes[n].childRoles` or `….childRolesLabel`); `childRoles` non-empty, of strict `{ id, name, description? }`, with `id` non-empty and unique in the type and `name` non-empty; only on a type with `allowedChildren` (otherwise it is an error); `childRolesLabel` non-empty text and only with `childRoles` (otherwise it is an error); without it the app uses "Papel" / "Role" (see "Link roles (childRoles)");
- **v11, `docRepos` and object `doc`:** only from `formatVersion` 11 (`só é permitido com formatVersion 11`, at the path `docRepos` or `…annotationTypes[n].doc`); `docRepos[n]` with the rules of the platform `repo` (`url` required `http(s)://` without spaces, `urlTemplate` optional with `{path}`, `ref` optional non-empty, no other property), `id` in the format `[a-z0-9-]+` and unique in the list (a repeated id and a `urlTemplate` without `{path}` are errors); object `doc` `{ repo, path }` strict: `repo` must be in `docRepos`, `path` relative (no `.`, `..`, or leading `/`), ending in `.md` and without `#`; the text `doc` stays valid from v4 on; **warning:** a `docRepos` repository that no `doc` uses (see "Document in an external repository (docRepos)");
- **v10, `notices`:** only from `formatVersion` 10 (in an earlier version the error is `só é permitido com formatVersion 10`, at the path `…annotationTypes[n].notices`, `…fields[n].notices`, or `…columns[m].notices`); a list (it may be empty) of strict objects with `kind` (`pending`, `deprecated`, `diverges`, or `removed`) and `message` (non-empty and not only spaces) required, `since` (a real `YYYY-MM-DD` date) and `ref` (non-empty text) optional; two notices with the same `kind` and the same `message` in the list are the error `aviso repetido`, at the path of the second; any other property is rejected; the notice only informs (see "Notices");
- **v9, `variants`:** only from `formatVersion` 9 (in an earlier version the error is `só é permitido com formatVersion 9`, at the path `…code.<platform>.variants`); `field` is the `key` of an `enum` field of the type (top level); `cases` non-empty, with keys in the field's `options` and non-empty cases; `params` and `values` of the cases like those of the base; one level only (the case has no `variants`); any other property is rejected (see "Code variants");
- **v8, `suggestions`:** only from `formatVersion` 8 (in an earlier version the error is `só é permitido com formatVersion 8`, at the path `…fields[n].suggestions` or `…columns[m].suggestions`); only on a `string` field or column; a non-empty list, up to 200 items, of unique, non-empty texts without leading or trailing spaces; it does not restrict the value, and the `default` can be outside the list;
- **v8, `linkedRef`:** only from `formatVersion` 8 (in an earlier version the error is `só é permitido com formatVersion 8`, at the path `…fields[n].linkedRef` or `…columns[m].linkedRef`); only on a `string` field or column; the `key` must be that of a `ref` field of the same type (on a column, of a `ref` column of the same `table`); it does not restrict the value and is independent of `suggestions`;
- **v7, `floating`, `appliesTo`, and `ref` column:** only from `formatVersion` 7 (in an earlier version the error is `só é permitido com formatVersion 7`, at the exact path: `…annotationTypes[n].floating`, `…annotationTypes[n].appliesTo`, `…fields[n].columns[m].type`); `floating` boolean; `appliesTo` non-empty, without repeats, only with `marking` and `arrow`, and a type that does not apply to markings (only `arrow`) cannot have `component` or `floating`;
- **v6, `containers`:** only from `formatVersion` 6 (in an earlier version the error is `só é permitido com formatVersion 6`, at the path `containers`); `id` in the format `[a-z0-9-]+` and unique in the list; `name` non-empty; `width` and `height` integers from 1 to 20000; `background` optional in the format `#RRGGBB`; any other property is rejected;
- `sources` from `formatVersion` 3; a type source with `system` and at least `id` or `name`; a field source with `system` and `name` (or `path`, in v4, for a system in `origins`); `values` only on `enum` fields and with targets that exist in `options`;
- **v4, new keys:** `fonts`, `origins`, `migrations` (root), `component`, `doc`, and `examples` (type) only from `formatVersion` 4: in an earlier version the error is `só é permitido com formatVersion 4`, at the path of the key;
- **v4, package paths:** `component` and `examples[].file` with a `.json` extension, `doc` (text) with `.md`, `fonts[].file` with `.ttf`, `.otf`, `.woff`, or `.woff2`, and `origins[].examples[].file` with `.json`; all relative, normalized, with `/`, without `.`, `..`, a leading `/`, or a drive;
- **v4, `fonts`:** `family` non-empty; `weight` an integer from 100 to 1000 or a range `"100 900"` (the first number smaller); `style` `normal` or `italic`; the `family` + `weight` + `style` triple does not repeat;
- **v4, `examples`:** `name` non-empty and unique in the type; either `values` or `system` with `file`, never both modes and never neither; the keys of `values` are fields of the type, with value `null` or compatible with the type (the `table` field accepts only the list of rows, each row an object column → value with the keys being columns of the table and each cell compatible with the column, and the `ref` column only `null`, without changing the `formatVersion`: an app or MCP prior to the epic rejects the library with today's message; the `ref` field does not accept a value); `system` must be in `origins`;
- **v4, `sources`:** `path` only for a system declared in `origins` (and required for it), with valid syntax (`a.b[0].c`) and without `[*]`; outside `origins`, `name` is required and `path` is forbidden; `slot` and `ignore` only for a system declared in `origins`, and `ignore` without repeats;
- **v4, `origins`:** checked by `parseOrigins`, strict: unique `system`, `node` with `type`, `props`, and `children`, `screen` with `width`, `height`, and at least one root, valid paths and anchors, `booleans` with `true` and `false`, `examples` with unique `name` and `.json` `file`;
- **v4, `migrations`:** `from` an integer ≥ 1 and unique, `to` greater than `from` and at most `version`, `steps` non-empty, known `op`, and strict keys per step; the new side of each step exists in this version and the old side no longer exists (see "Version contract");
- `code` only in specializations that declare `platforms`; the `code` ids must exist in `platforms`;
- `symbol` required in each `code` entry; `path`, if present, non-empty and relative to the root of the platform's `repo` (normalized, with `/`, without `.`, `..`, a leading `/`, or a drive); keys of `params` and `values` must be fields of the type; `values` only for `enum` fields, with keys that exist in `options`;
- `color` in the format `#RRGGBB`;
- unknown properties are rejected (a field's `platforms` only existed on the removed type `codeRef`);
- a field of the removed type `codeRef` (outside `columns`) is not an error: it is read, ignored, and becomes a warning (see "Value types").

**Validate before importing.** The app's import and the MCP server use the same validation (`parseSpecText`, in `src/model/`). The server's `validate_specialization` tool (a `path` inside the roots or the JSON `text`) returns exactly these errors, with the path, without applying to any project, and also warns about what does not prevent the import but is usually an oversight: a declared platform that is not used (`unused-platform`), a type without `code` in a specialization with platforms (`type-without-code`: no platform says how to create an instance of it), a platform in which some type has `path` and that does not declare `repo` (`path-without-repo`), the old `format` (`mapeador-spec`), and the field of the removed type `codeRef`, ignored (`ignored-field`). The app's import shows the warning about the ignored fields.

## Annotated example: SDUI

```json
{
  "format": "mapping-spec",
  "formatVersion": 5,
  "id": "sdui",
  "name": "SDUI",
  "version": 3,
  "platforms": [
    {
      "id": "android",
      "name": "Android",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/app-android",
        "urlTemplate": "https://github.com/org/app-android/blob/v3/{path}",
        "ref": "v3"
      }
    },
    {
      "id": "bff",
      "name": "BFF",
      "language": "kotlin",
      "repo": {
        "url": "https://github.com/org/bff",
        "urlTemplate": "https://github.com/org/bff/blob/v3/{path}",
        "ref": "v3"
      }
    }
  ],
  "layers": [
    {
      "id": "componentes",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "allowedChildren": ["onClick"],
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "estilo",
              "type": "enum",
              "options": ["primary", "secondary"],
              "default": "primary"
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSButton",
              "path": "app/src/main/java/com/app/ds/DSButton.kt",
              "params": {
                "id": "testId",
                "estilo": "style"
              },
              "values": {
                "estilo": {
                  "primary": "ButtonStyle.Primary",
                  "secondary": "ButtonStyle.Secondary"
                }
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.button",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id",
                "estilo": "variant"
              },
              "notes": "The function returns the component node in the screen JSON."
            }
          }
        },
        {
          "id": "input",
          "name": "Input",
          "fields": [
            {
              "key": "id",
              "type": "string",
              "required": true
            },
            {
              "key": "dado",
              "type": "ref",
              "accepts": {
                "tags": ["data-field"],
                "free": true
              }
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.DSTextField",
              "path": "app/src/main/java/com/app/ds/DSTextField.kt",
              "params": {
                "id": "testId"
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.input",
              "path": "src/main/kotlin/com/app/bff/sdui/Components.kt",
              "params": {
                "id": "id"
              },
              "notes": "The function returns the component node in the screen JSON."
            }
          }
        }
      ]
    },
    {
      "id": "eventos",
      "name": "Events",
      "color": "#FB8C00",
      "annotationTypes": [
        {
          "id": "onClick",
          "name": "onClick",
          "requiresOwner": true,
          "fields": [
            {
              "key": "acao",
              "type": "enum",
              "options": ["navigate", "submit"],
              "required": true
            }
          ],
          "code": {
            "android": {
              "symbol": "com.app.ds.OnClick",
              "path": "app/src/main/java/com/app/ds/OnClick.kt",
              "params": {
                "acao": "action"
              }
            },
            "bff": {
              "symbol": "com.app.bff.sdui.onClick",
              "path": "src/main/kotlin/com/app/bff/sdui/Events.kt",
              "params": {
                "acao": "action"
              },
              "notes": "The function returns the event node in the screen JSON."
            }
          }
        }
      ]
    }
  ]
}
```

- Two layers: Components and Events, each with its own types.
- `Button`: `id` is required (without it the annotation is incomplete) and `estilo` comes as `primary` by default (`default`).
- `Button` lists `onClick` in `allowedChildren`, and `onClick` has `requiresOwner`: an `onClick` only exists attached to a `Button`.
- `Input.dado` is a `ref`: it accepts attributes with the `data-field` tag (e.g., the attribute rows of Class, of the Data Model) and also free-annotation tuples.
- `platforms` declares the two code targets in which the agent writes the solution, `android` and `bff`, each with the `repo` of its library (`url`, the `urlTemplate` of a file's link, and the `ref` the `code` corresponds to).
- `code` says how to create an instance of each type: on `android`, the `symbol` is the composable to call (`com.app.ds.DSButton`) and the `path` is the file that defines it, relative to the `repo` root; on `bff`, the `symbol` is the Kotlin function that generates the JSON node (`com.app.bff.sdui.button`), not the name of the node. The agent reads the file to see the signature and writes the call.
- `params` says by what name the field is passed (`estilo` goes in `style` on Android and in `variant` on the BFF) and `values` how the `enum` value is written in code (`primary` becomes `ButtonStyle.Primary`); `notes` guides (the BFF function returns the component node in the screen JSON).

## Complete examples

- [`examples/specs/sdui.json`](../examples/specs/sdui.json) (`formatVersion` 12): `string`, `number`, `enum`, `table`, and `ref`; `required`, `default`, `label`, `description`; `allowedChildren` and `requiresOwner`; reference by tag (`dado`) that also accepts free tuples; platforms `android`, `ios`, and `bff` (the Kotlin function that generates the JSON), each with the `repo` of its library, `code` on all component and event types, and the Screens layer with the `Screen` (without `code`).
- [`examples/specs/modelo-de-dados.json`](../examples/specs/modelo-de-dados.json) (`formatVersion` 1, no platforms): `date`, `labelField`, `table` with the `data-field` tag and `rowLabel` (each attribute becomes a reference target).
