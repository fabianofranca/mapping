---
name: spec-author
description: Writes, reviews or updates a Mapping specialization (a "mapping-spec" JSON file with layers, annotation types, fields, relations, platforms/code and origins) from a source code base, design system or document, and validates it before delivering. In formatVersion 4 it writes the whole LIBRARY (a folder with the specialization, one component per file, one document per component, examples and fonts) and validates it with validate_library. Use whenever the request involves creating or changing a specialization, spec, "mapping-spec", Mapping annotation types, mapping the components of a design system or of an app to Mapping, or saying which code creates an instance of each type (code with symbol and path, platforms with repo), or linking them to an external origin (sources, Figma) — even if the word "specialization" does not appear.
---

# Mapping specialization and library author

A **specialization** is the JSON file that teaches Mapping to speak the language of a domain: which layers exist, which annotation types each one accepts, which fields each type has, how the types relate to each other and, optionally, which code creates an instance of each type on each platform (`formatVersion` 2; the library's repository on each platform arrives in 5) and which element of an external system it corresponds to (`formatVersion` 3). In `formatVersion` 4 the specialization becomes a **library**: a folder (the **package**) with the specialization, a **component** file per type (the drawing), a markdown **document** per component, named **examples** and the list of **fonts**. The complete format is in `docs/SPEC-FORMAT.md` of the Mapping repository; this skill is the method to produce a file that passes validation on the first try and models the domain well.

The prompt that invokes the skill brings what changes from one specialization to another: id, name, origin of the material, `formatVersion`, platforms, what stays out and, for a library, the output folder and the origin of the components. Everything that does not change is here.

## Model and effort

For whoever dispatches the agent: **Opus 5.5 at high effort** is the default (that model's default effort is medium, and the rules between elements of the specialization are where low effort goes wrong). **Fable 5.1 at high** for the first specialization of a large platform or a `formatVersion` 3 with many origins to match. **Sonnet 5.5** for maintenance (adding a type, renaming a field, fixing a validator error).

## Required reading, in this order

1. `docs/SPEC-FORMAT.md`: the format, the validation rules and the commented example. Read it whole; it is short.
2. `docs/spec.schema.json`: the structure. It validates only the shape; the rules between elements (unique ids, `allowedChildren` in another layer (in 13, also in the owner's own layer), compatible `default`, `values` targets in `options`) live in the app's validator, and it is the one that decides.
3. `examples/specs/sdui.json` (`formatVersion` 12: platforms with `repo` and `code`, clauses, roles, `docRepos`, `migrations`) and `examples/specs/modelo-de-dados.json` (`formatVersion` 1, with `table`, `tags` and `rowLabel`): copy the style, not the content.
4. In `docs/AGENT-GUIDE.md`, the section "Creating specializations: generate, validate, fix" and, if the specialization has `sources`, the item "Specializations with `sources`" of "Re-exports: match by `source` and propose only what changed". For a library (`formatVersion` 4), also read "Writing a library (`formatVersion` 4 package)", the section "Library: the package" and the "Version contract" of `docs/SPEC-FORMAT.md` and **all** of `docs/COMPONENT-FORMAT.md` (template, sizes, expressions).
5. For a library, `libraries/material3-compose/` (the specialization, `components/`, `docs/`, `fonts/` and `icons/`; the named examples are `values` on the type itself; for `origins`, `sources` and external-system examples, see `examples/libraries/sdui-backend/`): copy the style, not the content.

When the agent runs outside the Mapping repository (the normal case: it runs in the repository of the code being mapped), these documents arrive through the MCP server as the resources `mapping-docs://SPEC-FORMAT.md`, `mapping-docs://COMPONENT-FORMAT.md` and `mapping-docs://AGENT-GUIDE.md`; the examples and the schema stay only in the Mapping repository. If neither the MCP nor the repository is within reach, stop and say what is missing: writing a specialization without the format at hand produces a file that does not import.

## What the prompt gives and what to do when something is missing

| The prompt says                                         | If it does not say                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id` and `name` of the specialization                   | Derive them from the domain (`id` in `[a-z0-9-]+`) and record it as a decision.                                          |
| The origin: repository, folder, design system, document | Ask. Without an origin there is nothing to model.                                                                        |
| What to read in the origin and what to ignore           | Read the public catalog (exported components, entities, events); ignore internals and tests.                             |
| Desired `formatVersion`                                 | Use the minimum for what the specialization uses (see "Version"); a library requires 4.                                  |
| (optional) Ready-made container sizes                   | Declare `containers` only if the origin shows sizes (breakpoints, devices); it requires 6.                               |
| Platforms and languages                                 | Declare only platforms that the origin material shows. None, if it is `formatVersion` 1.                                 |
| Where to save the file                                  | `<id>.json` in the working folder; say where it ended up.                                                                |
| (library) The output folder                             | `<id>/` in the working folder, with `<id>/<id>.spec.json` inside; say where it ended up.                                 |
| (library) The origin of the components                  | Figma SVG, code or document: without it there is nothing to draw; ask (see "Library").                                   |
| Apply to a project                                      | **Do not apply.** Deliver the validated file; applying is done through `propose_changes` and the review is the person's. |

On any modeling doubt that changes what the person will see (one more or one fewer type, a required field or not), choose the simplest option, proceed and list the doubt in the delivery. Do not block waiting for an answer on a small detail.

## Method

The order matters because each step depends on the previous one.

### 1. Inventory of the origin

Before writing JSON, list the candidates for annotation types with the **evidence** for each one (file and symbol, or the name in the design system). Separate them by nature: things that appear on screen (components, screens), things that happen (events, actions), things that describe data (entities, fields). That separation becomes the layers. An inventory of twenty lines avoids a specialization that models what does not exist or forgets what does.

### 2. Layers

One layer per nature, not per code module. `id` in `[a-z0-9-]+` and unique; `name` displayed; `color` in `#RRGGBB`, distinct between layers (the color is how the person tells the layers apart on the canvas). Linked children (`allowedChildren`) must be in **another layer** than the owner's, so whoever has component events has at least two layers.

### 3. Annotation types

- `id` unique **in the whole specialization**, not only in the layer. Use the component name in lowercase (`button`, `text-field`).
- `description` with the guidance an implementation agent needs to read later (when to use it, what not to confuse with what). It is the place for domain notes; `code.notes` is only for code details.
- `labelField`: the key of a `string` field whose value names the instance when the annotation has no name. Almost every type has one (button text, screen name, entity name).

### 4. Fields

- `key` in `[A-Za-z0-9_]`, not starting with `_` (reserved), unique in the type and in the columns. `label` may have accents; `key` need not.
- Types: `string`, `number`, `date`, `enum`, `table`, `ref`. A boolean is an `enum` with two options (`["yes", "no"]`).
- `required` only for what the instance makes no sense without. Empty is allowed on save; the annotation becomes **incomplete**, and incomplete ones show up in a list of their own in the app. Marking everything as required turns the list into noise.
- `default` must be valid for the type and, in `enum`, be in `options`. It does not exist for `table` or `ref`.
- `table`: columns `string`, `number`, `date`, `enum` and, from 7 on, `ref` (with `accepts`); `table` inside `table` does not exist. With `tags`, each row becomes a reference target and `rowLabel` (a `string` column) is required.
- `options` of `enum`: unique strings, in the domain's values (the code's values go in `code.values`; those of the external origin, in `sources[].values`).
- **Movement × state appearance.** The drawing is a still frame: no animation, animated ripple or state change by the mouse. The **appearance** of an interaction state (hover, focus, pressed, dragged) is drawable and, when the origin defines it (the design system's state tokens), it enters as an optional `enum` field of the type, outside `code`, like disabled and selected. When listing what stays out in a plan or in Fidelity, separate movement (out) from state appearance (field).
- **`suggestions` versus `enum`** (`formatVersion` 8): `enum` is a **closed** set (the person only picks one of the `options`; booleans, states, styles). `suggestions`, only on a `string` field or column, is an **open** vocabulary: the list appears while typing, but any text is still valid (the type of a code property, `String`, `Int`, but also `String?` and `List<Address>`). Use `suggestions` when the value has recurring words but is not exhausted by them; `enum` when a value outside the list is a domain error. Rules: non-empty list, up to 200 items, unique texts, non-empty and without spaces at the ends; on another field type it is an error; in a version before 8 it is an error (`only allowed with formatVersion 8`). The `default` may be outside the list. Adding, changing or removing `suggestions` is not a break and does not call for a migration.
- **`linkedRef`** (`formatVersion` 8): on a free-text `string` field or column that **sometimes names something already mapped** (the type of a property, which may be another declaration of the mapping), declare a `ref` field next to it (in the `table`, a `ref` column) and set `linkedRef` with its `key`. The mapped targets enter the list and, when one is chosen, the text and the `ref` are filled in together. It does not restrict the value: free text is still valid, and the `ref` stays empty when the text names nothing mapped. It combines with `suggestions` (targets first, then the fixed list). Different from `enum` (closed set) and from `suggestions` (fixed words, with no link to the mapping). Error if the `key` does not exist, is not a `ref`, or the field is not `string`; adding, changing or removing is not a break.

### 5. Relations and references

- `allowedChildren`: ids of types in another layer (in `formatVersion` 13, also in the **same** layer as the owner) that can be linked to this one (one owner, N children). Every type with `requiresOwner: true` must appear in the `allowedChildren` of some **other** type, otherwise the validator refuses it (`requires an owner, but no type lists it in allowedChildren`; if only the type itself lists it, `requires an owner, but no other type accepts it as a child`). A library that passed with this before may be refused now. In `formatVersion` 11 the item may also be a **clause** that covers a layer or groups of it, and the owner may declare **roles** for the children (see step 12).
- `ref` is a **strong** reference to a tuple of another annotation, by **tag**: the target field declares `tags`, and the `ref` field declares `accepts: { tags: [...], free: true|false }`, with at least one tag, `free: true` or `annotations`. Tags in `[a-z0-9-]+`.
- A **field that receives components (or any whole annotation)** becomes a `table` with a `ref` column and `accepts.annotations` (`formatVersion` 14): a list of type ids or clauses `{ layer, groups? }` **of the same specialization**, with the syntax of `allowedChildren`. E.g.: `{ "key": "item", "type": "ref", "required": true, "accepts": { "annotations": [{ "layer": "components" }] } }`. State the rule in the field's `description` (which components enter and why). Do not use a `string`/`json` field to carry this structure, and do not create a tag just to be a target when `annotations` does the job.
- A specialization **never cites another by name**: the link between them is by tags only. Reuse `data-field` for an attribute of a data model (class, entity, DTO); invent a new tag only when no existing one fits, and record it in the delivery.

### 6. Platforms and `code` (`formatVersion` 2; `repo` in 5)

The `code` of a type says how to create an instance of it on each platform: `symbol` is what is called, `path` is the file that defines it, `params` and `values` say how to pass the fields, `notes` guides. The agent reads the file to learn the signature and writes the call in the solution. The mapping keeps nothing about the solution: it is not the code generated for an annotation.

- `platforms` at the root: `{ id, name, language?, repo? }`. A platform is a code target where the agent writes the solution (the Android app, the iOS app, the BFF that generates the JSON of a screen). `id` in `[a-z0-9-]+` and unique. Platforms with the same `id` in different specializations are the same platform; align with the ones already used in the project (`get_project` shows them).
- `repo` per platform (`formatVersion` 5): `{ url, urlTemplate?, ref? }`, the repository **of the library** on that platform, the root that the `path`s refer to. Fill in `url` and `ref` from the repository you read (the `http(s)://` address and the tag, branch or commit at which you read the code), never from memory; `urlTemplate` (with `{path}`) only when you know the format of a file's address on the host. Each specialization declares the repository of its own library. A platform in which some type has a `path` and that has no `repo` generates a validation warning: fill in the `repo`.
- `code` per type, per declared platform id:
  - `symbol` (required): **what is called to create an instance of the type**, with the full name checked in the code: a composable, a view, a class, the BFF function that generates the component's JSON. It is not the name of the output node (`"button"`, `"onClick"`), it is the function or constructor that produces it.
  - `path` (optional): the file that defines the `symbol`, for the agent to read the signature. **Relative to the root of the `repo`**, `/` as separator, with no `.`, `..` or line number. Fill it in when the file is known because you saw it, never invent it.
  - `params` (field key → parameter name; only what is passed), `values` (only `enum` fields; mapping value → text in the code), `notes` (short guidance for whoever writes the call: what to pass besides the fields, order, cautions).
- **Signature and factories** (`formatVersion` 16, inside the `code` entry and of each case of `variants`): `signature` is the path of the `mapping-signature` sheet of the `symbol` in the package (`signatures/<type>.<platform>.json`; format in `docs/SIGNATURE-FORMAT.md`), which **the `symbol` and the `path` of the `code` must equal**; `ignore` lists the parameter names that are left out on purpose (`modifier`), without a warning; `calls` (`{ "colors": "<factory symbol>" }`) says that a parameter is filled by a factory; `formats` (`{ "width": "{value}.dp" }`) writes a field's value with a template that contains `{value}`. In `params`, besides the name, the value may be a **path** (`colors.containerColor`: the `containerColor` argument of the factory in `calls.colors`, which must be in `calls`) or a **positional** (`#0`: the unnamed argument, the `_` label in Swift). **All of this is v16**: in an earlier version each key is an error (`only allowed with formatVersion 16`) and `params` with `.` or `#0` is opaque text, without interpretation. In the case of `variants`, `signature` and `ignore` replace those of the base; `params`, `values`, `calls` and `formats` are added. The MCP returns, in the `code`, the `unmapped` (the sheet's parameters with no field and outside `ignore`).
- **`variants`** (`formatVersion` 9, inside the `code` entry): use it when **the variant changes what is called**, not a parameter. In Compose, `Button`, `OutlinedButton`, `TextButton` and `FilledTonalButton` are four composables; the `Button` type has an `enum` field `style` (`filled`, `outlined`, `text`, `tonal`) and `code.compose` declares `variants: { field: "style", cases: { outlined: { symbol: "…OutlinedButton" }, … } }`. When the variant only changes an argument (`enabled`, `size`), keep using `params` and `values`, without `variants`.
  - `field` is the `key` of an `enum` field of the **type itself** (top level; a `table` column does not count) and each key of `cases` is one of its `options`. The case declares **only what changes**: `symbol`, `path` and `notes` replace those of the base; `params` and `values` are added to those of the base. An empty case is an error. The value with no case (`filled`, for example) uses the base, and an annotation with no value uses the field's `default`.
  - **One level only.** Two dimensions (style and size) become an `enum` that joins them (`filled-large`) or two types (the FAB and the Extended FAB in Compose are separate types). The case has no `variants`.
  - Check each case's `symbol` and `path` in the code, like the base's. `find_by_code` and `get_code_hints` deliver the code already resolved for the annotation's variant.
- **Never create a `codeRef` field** (nor another field to store where the instance was written in the solution): that type left the format. The specialization stores only what helps to **instantiate** (`symbol`, `path`, `params`, `values`, `notes`, `repo`), nothing about the solution. When reviewing or updating a specialization that has a field `"type": "codeRef"`, **remove the field** (and the `params` keys that cite it), raise the `version` and record the removal in the delivery; the validator accepts it only for compatibility, with the `ignored-field` warning.
- The name of a platform, language or framework appears only inside `platforms` and `code`. The rest of the specialization describes the domain, not the technology.

### 6a. Import the signature (`formatVersion` 16)

When the type is instantiated by a component whose **parameters** you can read (a `@Composable` function, the `init` of a SwiftUI view, the properties of a Figma component), **do not model the fields by hand**: import them from the signature. The fields come out the same on every round, what was left out leaves a trace (`pending`, `unmapped`) and the next extraction is compared with the previous one. The server never reads code; it only reads the **sheet** `mapping-signature` (`docs/SIGNATURE-FORMAT.md`, `mapping-docs://SIGNATURE-FORMAT.md`), a JSON derived from the code.

1. **Extract the sheet** from the `symbol`'s file (the same one the `code`'s `path` points to), in the library's clone, with the extractor `mapping-signature.mjs` when there is one for the source. You run the script **in the library's clone**, with `--ref` of the commit pinned in `platforms[].repo`/`code`. Kotlin/Compose: `node tools/mapping-signature.mjs kotlin --file <file.kt> --symbol <name> --path <relative to the repo> --ref <commit> [--also <file.kt>] [--overload <n>] --out signatures/<type>.<platform>.json` (`--also` for the file of the `enum class` and of the `XDefaults.f()` factories). Ambiguous overload: the command lists the candidates and asks for `--overload <n>`; choose the one the `code` calls. SwiftUI: `node tools/mapping-signature.mjs swift --file <file.swift> --symbol <struct> --path <relative to the repo> --ref <commit> [--also <file.swift>] [--init <n>] --out signatures/<type>.<platform>.json` (with more than one `init` the command lists the `init`s and asks for `--init <n>`; with no `init` written, the memberwise one applies; the external label comes out in `label` and `_` is the positional `#0`). Figma: with the node's JSON saved (`id`, `type` and `componentPropertyDefinitions`), `node tools/mapping-signature.mjs figma --file <nodes.json> --node <id> --out signatures/<type>.figma.json`; the sheet is a **design** one, so in step 2 use `system: "figma"` and the import links the type's `sources`, not `code`. **Source without an extractor** (React, Storybook, Flutter, View XML): write the sheet by hand, with `source.extractor: "agent"`. Copy only what is in the code: `name`, `role`, `type` (the type's text in the source), `default` (the text), `required` and, with `role: value`, the `value.kind` (`text`, `boolean`, `number`, `integer`, `dimension`, `enum` with `options`, `color` or `opaque`). A parameter whose `role` you are not sure about is `other`; a `value.kind` you cannot tell is `opaque`. Do not invent a parameter, default or option, and **never** "improve" the signature.
2. **`plan_signature_import({ path, type, platform, signature })`** (or `signatureFile`; `system` instead of `platform` for Figma; `variant` for the sheet of a case of `variants`). It is the preview: nothing is saved. Read `fields`, `links`, `notices`, `unmapped` and `changes`. If the sheet is wrong, the error `signature-invalid` carries the path of the problem; `signature-mismatch` says that the sheet's `symbol` or `path` is not the `code`'s.
3. **Save** the response's `spec` in the specialization file and the sheet, **the same JSON**, in `signaturePath` (`signatures/<type>.<platform>.json`, or `signatures/<type>.<case>.<platform>.json` in the case of `variants`).
4. **You only write by hand** the `label` and the `description` of the new fields (in the library's language; the import proposes a `label` from the name) and the `ignore` (the parameters that are left out on purpose, such as `modifier` and `interactionSource`: names from the sheet). The rest (fields, `code`, `calls`, `formats`, warnings with the sheet's `ref`) belongs to the import: **do not edit it**, because the next round rewrites the warnings and the same sheet gives the same specialization. To change how a source type becomes a field (`Color`, `Dp`, `PaddingValues`), write a model in `fieldModels` (see `docs/SPEC-FORMAT.md`, "Field models") and import again.
5. **`validate_library`** on the folder. It checks the cited sheet and warns about the mapped parameter that it does not have.
6. **Synchronize** when the code changes: extract the sheet again and call the tool with it. `changes` says what came in, went out and changed; the returned `spec` brings only the additive part (a new optional field, a new option, `default`); what went out stays with `removed` and what diverged, with `diverges`. Raise the `version` when `versionBump` is `true` (section 13).
7. **Never write `migrations` unless the person asks.** The import does not remove or rename a field; `suggestedMigrations` is only the suggestion (`remove-field`, `rename-field`), for you to offer. Without the request, the field stays and the warning explains.

Tell the person what was left as `pending` (`value` parameters with no field) and as `diverges`: it is what the library does not model yet.

### 7. Origins (`formatVersion` 3)

- `sources` on the type: `{ system, id?, name? }`, at least `id` or `name`; the `id` is stronger than the `name`, so prefer both when the origin provides them. A type may correspond to several elements (old and new variants).
- `sources` on the field or column: `{ system, name, values? }`, with `values` only on `enum` and each target existing in `options`.
- `system`, `id` and `name` are compared exactly, case counts: copy from the origin, do not type from memory.

### 8. Library (`formatVersion` 4)

Only when the prompt asks for a library (components that the app draws). Do steps 1 to 7 as usual; then, **inside the output folder**:

1. **Package:** the `<id>/` folder holds the specialization at the root and everything it cites, by path relative to its file, `/` as separator, **without `..`**: `components/<type>.json`, `docs/<type>.md`, `examples/*.json`, `fonts/*`. Nothing outside the folder: a `..` that leaves it is refused (`path outside the library: <ref>`, at the path of whoever cites it). At the root of an origin, `margin` without `anchor` is an error (`margin is only valid with anchor`).
2. **One component per type** (`component` on the type, a `mapping-component` file in `components/`): drawing (template), initial `size`, `minSize` and `preview` with example values. **Write the component in logical units (dp, pt, CSS px at 1x), never in pixels of a screenshot; do not multiply by 2 or 3.** `size`, `minSize`, `gap`, `padding`, `font.size` and the rest are units: the container's density (the project's `containers[].density`, schema v19) converts them to the image's pixels (`docs/COMPONENT-FORMAT.md`, "Units and density"). The drawing is a still frame (no animation or animated ripple), but the appearance of an interaction state (hover, focus, pressed, dragged) is drawable: if the origin defines the state tokens, it is an optional `enum` field of the type, outside `code` (rule in "4. Fields"); when listing what stays out, separate movement (out) from state appearance (field). Follow `docs/COMPONENT-FORMAT.md`; the field keys that the template cites (`$field`, `$has`, `$eq`, `$switch`) must exist on the type. Colors, spacing and typography come from the origin (Figma SVG: layers, `fill`, radii and fonts that you saw; code: the theme's tokens; document: the design system's table), never from memory. A type with no drawing (event, entity) has no `component`. **Model with the layout closest to CSS**: Compose's `Box` (SwiftUI's `ZStack`, Flutter's `Stack`) is a `none` frame with alignment (`align`/`justify`); `Row`/`Column` are `row`/`column`; clipping what overflows (`clipToBounds`, `overflow: hidden`, `ClipRect`) is `clip`, on the frame and on the slot (concept map in "Layouts: `none`, `row`, `column` and `grid`" of `docs/COMPONENT-FORMAT.md`).
3. **One document per component** (`doc`, `docs/<type>.md`): when to use it, variants, what not to confuse; simple markdown (headings, paragraphs, lists, tables, code). It is what the agent reads in `get_component`.
4. **Named examples** (`examples` on the type): `values` (keys of the type's own fields, valid values; in a `table` field, the list of rows, as in the component's `preview`: column → value objects, without `_id`, a `ref` column only `null`) with a unique `name`; for an external-system origin (`origins`), `system` + `file` (the JSON of **one node** in `examples/`) and, in the origin, whole screens in `examples[]`.
5. **Fonts:** `fonts` at the root (`family`, `file`, `weight`, `style`). The files have a license and weight: if you cannot include them, leave `fonts/LEIA-ME.txt` saying which files are missing and where to get them (a missing font is a **warning**, not an error).
6. **Design tokens (`formatVersion` 15 on the specialization; `{ "$token": … }` in the format 4 component).** When the origin has a design system (theme tokens, Figma variables, color table), declare it in `tokens` at the root **instead of repeating literals** in each node. The default is `light`/`dark`:

   ```json
   "tokens": {
     "modes": ["light", "dark"],
     "values": {
       "primary": { "light": "#6750A4", "dark": "#D0BCFF" },
       "on-primary": { "light": "#FFFFFF", "dark": "#381E72" },
       "radius-md": 12,
       "space-4": 16
     }
   }
   ```

   - `modes` is a non-empty list of distinct names `[a-z0-9][a-z0-9-]*`; the token name follows the same pattern. **Color goes by mode** (an object with all the modes and only them, all of the same type); **radius, spacing and size** that do not change with the theme are **simple** values (valid in all modes). A value is text (a `#rrggbb`/`rgba()` color or a font family) or a number.
   - In the component, `{ "$token": "primary" }` is valid where a color is expected (`fill`, `color`, `stroke.color`, `shadow.color`, gradient stops, `run.color`/`background`), a number (`gap`, `padding`, `font.size`, `cornerRadius`, `width`, `opacity`…) or a family (`font.family`), including as the result of `$switch` and `$if`. It is not valid in an enum, a boolean or text.
   - **Built-ins:** `font-sans` and `font-mono` exist in every library (the host theme's font) and `{ "$token": "font-mono" }` works in `font.family`. Text without `font.family` uses `font-sans`, **no longer `Inter`**: do not write `Inter` by default and do not count on its width. Redefining `font-sans`/`font-mono` in `tokens.values` wins over the host.
   - In this version the drawing always uses the **first** mode of `modes` (an undeclared mode falls back to the first, without a warning): put `light` first.
   - `tokens` only has the keys `modes` and `values`: another key is refused (`unknown key: x`, at the path `tokens.x`); a library that carried an extra key and passed before may be refused now.
   - `tokens` only with `formatVersion` 15 (before: `only allowed with formatVersion 15`) and `$token` only in the format 4 component (`only allowed with formatVersion 4`). `validate_library` refuses a nonexistent token (`the token "x" does not exist in the specialization tokens`) and one of the wrong type (`the token "primary" is a color, but a number is expected here`), with the node's path. Details in `docs/SPEC-FORMAT.md` ("Design tokens") and `docs/COMPONENT-FORMAT.md`.

7. **Icon set (`formatVersion` 15 on the specialization; `icon` node in the format 4 component).** When more than one component shows an icon, or an `enum` field chooses the icon, **do not repeat the paths in a `$switch`** inside the component: put the icons in a package file (`icons/icons.json`, `"format": "mapping-icons"`, `"formatVersion": 2`, default `viewBox` `[24, 24]` and `icons` by name `^[a-z0-9][a-z0-9-_]*$`) and point `"icons": "icons/icons.json"` at the root of the specialization:

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
       }
     }
   }
   ```

   - **`mirror`** (`formatVersion` 2 of the file, per icon, default `false`): mark with `"mirror": true` **every icon that points or has a reading direction** (arrow, chevron, `arrow-back`/`arrow-forward`, `send`, `undo`/`redo`, `reply`, a speech bubble with a tail, a progress bar with a tip, `format-indent`); leave without `mirror` the ones that do not flip (clock, camera, person, check, trash can, logo, a drawn letter or number). It is what makes the drawing flip horizontally on an `rtl` screen (see item 11). `formatVersion` 1 of the file is still accepted, but `mirror` in it is the error `only allowed with formatVersion 2`; a value that is not a boolean, `expected true or false`.
   - Each icon has `paths` (a **non-empty** list of `{ d, fill?, stroke?, width?, cap?, join? }`) and, if needed, its own `viewBox` and `mirror`. `fill`/`stroke` `true` use the color of the `icon` node; a text is its own color; a path with neither `fill` nor `stroke` is filled with the node's color. The width (`width`) is in `viewBox` units. Use the `d`s of the origin's SVG (Figma, Material Symbols, the app's `icons.tsx`), never from memory.
   - In the component: `{ "type": "icon", "name": { "$field": "icon" }, "color": { "$token": "on-surface" }, "width": 24, "height": 24 }` (`strokeWidth` replaces the stroke width; `hug` measures the `viewBox`). The `name` of the `icon` node is the **icon's** name, not a node name. Bind the `name` to an `enum` field whose `options` are the set's names.
   - `validate_library` checks the file (level 1), refuses a **literal** name outside the set (`the icon "cloud" does not exist in the icon set (icons/set.json)`, with the path of the `name`) and warns, at level 3, about the `enum` `option` that is not in the set. A name coming from a field that does not exist in the set draws the placeholder with the warning `unknown icon: <name>`.
   - `icons` only with `formatVersion` 15 (before: `only allowed with formatVersion 15`) and the `icon` node only in the format 4 component (`only allowed with formatVersion 4`). Details in `docs/SPEC-FORMAT.md` ("Icon set") and `docs/COMPONENT-FORMAT.md`.

8. **Screen size, structural type and minimal marking (`formatVersion` 15 on the specialization; format 4 on the component).**
   - **`screen`** at the root of the component (`{ "anchor": "center" }`, default; or `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`): the drawing has its `size` in **screen pixels** at any zoom, anchored at the point of the marking's rectangle (pin, stamp, badge). It may extend beyond the rectangle without the "does not fit" pending item. `stroke.scale: false` keeps the stroke width in screen px. In format < 4: `only allowed with formatVersion 4`.
   - **`"structural": true`** on the annotation type: the type only groups and does not draw (section, composer); the app does not show its name on the canvas and does not count it as "no component". `structural` with `component` is an error (`a structural type does not draw: it cannot have a component`); `structural` only with `formatVersion` 15.
   - A marking of a type **with a component** is valid from 1 px (items of 1 to 7 px: divider, dot, separator), respecting the component's `minSize`; without a component the minimum is still 8 px. Do not size `size` to 8 px because of the old minimum.
9. **Measured origin (`origins[].kind: "measured"`, `formatVersion` 15).** When the origin screen exists and can be **measured** (a web page open in a browser, the view hierarchy of an app), declare `{ "system": "dom", "kind": "measured" }` in `origins` (only `system`, `kind`, `name` and `booleans`; `node`, `screen` and `examples` are errors) instead of a tree origin. The project's agent then measures and imports with the MCP op `import_measured` (`docs/AGENT-GUIDE.md`, "Importing a measured layout"). The specialization's work is in the `sources` with that `system`:
   - **Type:** `{ "system": "dom", "name": "btn" }` and/or `"id"`. The node matches by `id` against the source's `id`, then each class of the node against the `name`, then the node's `type` (the tag) against the `name`; use a class for what distinguishes (`btn`, `card`) and the tag for the rest (`img`, `input`).
   - **Field:** `{ "system": "dom", "path": "label" }` reads the value in the node's `props`; on an `enum` field, `values` translates the measured text to the `options`. Without `path` the field stays at the default value.
   - Color by the nearest token and icon recognized by its stroke **do not exist**: what the measurement does not bring stays at the default. `kind` in a version before 15 is the error `only allowed with formatVersion 15`. Example: `examples/libraries/medido/`.
10. **Update of an already applied library:** preserve type ids and field `key`s, raise the `version`. **Additive** (needs no `migrations`): a new type, a new **optional** field, a new `enum` option, a new component, document, example or font, changing only the drawing. **Break** (requires an entry in `migrations`, with `from`, `to` and `steps`; `to` ≤ `version`, `from` unique, `steps` non-empty; the chain must connect the applied version to the new one, otherwise every break is left uncovered): removing or renaming a type, field or `enum` option (steps `rename-type {from,to}`, `remove-type {type,mode: convert|delete}` (`delete` also deletes the annotations), `rename-field {type,from,to}`, `remove-field {type,field}` and `map-values {type,field,values}`; the field key may be `table.column`), making a field required (including a new field that is born required: cover it with `fill-field {type,field,default}`), changing a field's `type`, taking a role out of `childRoles` or giving `childRoles` to a type that had none (steps `rename-role`, `remove-role` and `set-role`, from `formatVersion` 12: see section 12). Pass the previous version to the validation (`previous`).

11. **Reading direction (RTL; `formatVersion` 4 of the component).** The same library draws `ltr` and `rtl` (Arabic, Hebrew, Persian): whoever instantiates says the direction (the screen, in `origins[].screen.direction`, or the app), and the component just follows it — there is no component "for Arabic". Write every component thinking of both, even when the origin only shows `ltr`:
    - **Prefer logical over physical.** `anchors.start`/`anchors.end` instead of `anchors.left`/`anchors.right` for everything that follows reading (the chevron at the end of a list item, the stamp at the start of a card), and `font.align` `start`/`end` instead of `left`/`right` (`start` is already the default of `formatVersion` 4: a text without `align` follows the direction). Keep `left`/`right` for what is truly physical (a watermark in the right corner of the screen). `anchors.start` together with `left` is an error (`anchors.start: does not combine with left`), and `anchors.end` together with `right` too.
    - **Row, column, grid and `padding`.** `row`, `wrap`, `grid` and the `align: start` of a `column` flip by themselves in `rtl`: do not invert the order of the children by hand and do not use `reverse` for that (`reverse` **composes** with the direction and cancels the flip). The `padding` is **physical**: an asymmetric inset that follows reading comes from `{ "$if": { "$direction": "rtl" }, "then": [0, 8, 0, 16], "else": [0, 16, 0, 8] }`.
    - **`mirror`.** Mark in the icon set (item 7) the ones that point; in the component, `mirror` on the `path` node (default `false`) flips a path written there (a hand-drawn arrow), and `mirror` on the `icon` node wins over the set's. The `image` node does not flip.
    - **`direction` per node.** `"direction": "ltr"` (or `"rtl"`) on a node fixes the subtree's direction: a phone number, an e-mail, a code snippet, the media controls. Use it sparingly and always with a reason; in `repeat`, `direction` is still the stacking of the rows, so the literal goes on the `template` frame or on a frame around it.
    - **`{ "$direction": "rtl" }`** is valid wherever a condition is valid and reads the node's **effective** direction: use it for what does not flip by itself (an asymmetric corner radius, a different `d`, an inset). Details in `docs/COMPONENT-FORMAT.md`, "Reading direction".

12. **Anchor (tooltip, badge and menu; `formatVersion` 4 of the component).** A piece that sits **next to another** (the tooltip above the button, the badge at the corner of an icon, the menu under the field) is a marking **anchored** to another in the same space (`docs/COMPONENT-FORMAT.md`, "Anchor"). The component does two things:
    - **`anchor` at the root of the file** says how the type prefers to attach: `{ "side": "top", "align": "center", "offset": { "main": 4, "cross": 0 } }` (`side` `top`, `bottom`, `start` or `end`; `align` `start`, `center` or `end`; `offset` in **units**, which the container's density converts to pixels). Everything is optional. Put it on the tooltip (`top`/`center` with the original's spacing), on the badge (the `end`/`start` corner with the original's offsets) and on the menu (`bottom`/`start`); whoever creates the marking with `anchor` and without `rect` already sees it born attached that way, and what the marking says wins over the default. `start`/`end` follow the direction. A key outside the set is an error, and in version 1 to 3, `only allowed with formatVersion 4`. Do not put `anchor` on a type that does not sit next to another (an ordinary button): it gains nothing.
    - **The `$anchor.*` pseudo-fields** read the anchor as a field (`{ "$field": "$anchor.x" }`), in `$field`, `$switch`, `$eq`, `$has` and in the arithmetic. There are **five names** (none is a field of the type and the validator accepts them without declaration; any other `$anchor.*` is the error `field does not exist`): `$anchor.side` (the marking's **logical** side: `top`, `bottom`, `start` or `end`), `$anchor.x` and `$anchor.y` (the anchor's **center**, in units, relative to the instance's box; they may be negative), `$anchor.width` and `$anchor.height` (the anchor's size, in units). **Without an anchor they are all empty** (the `$field` falls back to the `default`, the `$switch` to the `default`, the `$has` is false): the drawing must look good that way too (the `preview` and the drawing proof have no anchor). Use them for what depends on where the anchor is, such as the **tooltip's arrow**: a `$switch` on `$anchor.side` chooses the side where the arrow sits and `"anchors": { "left": { "$sub": [{ "$field": "$anchor.x" }, 8] } }` puts it under the anchor's center (`visible` with `{ "$eq": ["$anchor.side", "top"] }` shows the arrow on one side only). The template chooses by the **logical** side: a single template serves `ltr` and `rtl`.
    - **Writing the code.** The type's `code` says, in the `notes`, how the platform builds the wrapper (`TooltipBox`, `BadgedBox`, `DropdownMenu` in Compose); the agent that writes the solution reads it through `get_code_hints`, which returns `anchor: { marking, side, align }`. Write these `notes` on the type that has `anchor`.

### 9. Containers (`formatVersion` 6)

Only when the origin shows **ready-made sizes** for the canvas's top-level object (a design system's breakpoints, an app's target devices). It is what the **New container** dialog offers, grouped by the specialization's name; the app's core only has **Custom** and **Selection size** and does not bring device sizes. A device size, therefore, is domain: if the specialization covers app screens, declare them here.

- `containers` at the root: a list of `{ id, name, width, height, background? }`. `id` in `[a-z0-9-]+` and unique in the list; `name` non-empty (the option's text, as the origin calls it: "Phone", "Tablet"); `width` and `height` integers from 1 to 20000; `background` optional, `#RRGGBB` (without it, white).
- Example: `"containers": [ { "id": "phone", "name": "Phone", "width": 360, "height": 800 } ]`.
- The ready-made sizes are in **units** (dp, pt, px at 1x), at 1x: they do not get a density (the density belongs to the project's container). The app suggests a screenshot's density from the image's width ÷ the ready-made size's width (1080 ÷ 360 = 3x); do not write 1080 × 2400 as the ready-made size of a 360 dp phone.
- Vocabulary: **container** is the canvas's top-level object (with an image file or only with a size and background color); in the project (`mapping.json`, schema v12) it lives in `containers[]` and the marking points to it by `containerId`. The specialization never cites the project: `containers` here are only the ready-made sizes. "Image" is left for the container's image file.
- Copy the numbers from the origin, do not invent them. Without evidence, omit `containers` (and stay at the `formatVersion` that the rest requires): it is optional and 5 is still accepted.
- In a version before 6, `containers` is an error (`only allowed with formatVersion 6`). The list is outside the version contract: changing sizes is not a break.

### 10. Floating type (`formatVersion` 7)

`floating: true` on the annotation type makes the instance a **floating marking**: a loose comment that lives only on the canvas, above everything, outside ownership (never child nor parent of a container or marking; dragging it moves only it). Use it **only** when the type is a loose comment or annotation that does not belong to a screen (note, memo, business rule); **never** for interface components, which belong to the screen where they are. The example is the repository's notes library (`libraries/notas/`, applied by default by the app). In a version before 7, `floating` is an error (`only allowed with formatVersion 7`). A floating type usually has a free-text `string` field (it accepts several lines in the interface).

#### Where the type applies: `appliesTo` (`formatVersion` 7)

`appliesTo` on the type says what the annotation applies to: `["marking"]` (the default: a marking), `["arrow"]` (an **arrow**, which links two markings and may have annotations per layer, like the marking) or `["marking", "arrow"]`. The annotations panel offers the selected arrow only the types that apply to arrows, and the marking only the ones that apply to markings. Validator rules: the list is non-empty, without repetition and only with `marking` and `arrow`; an **arrow-only** type has no `component` or `floating` (the arrow has no component drawing). In a version before 7, `appliesTo` is an error (`only allowed with formatVersion 7`). Use `["arrow"]` for data that describes the **relation** (the deep link that a transition opens, the event that it fires); not for what describes an element. Source and target restrictions per type do not exist in the format: do not invent them.

#### The "floating that points" pattern (data tables linked by an arrow)

Data in the form of a table that describes an element of a screen (a button's analytics events, a call's properties) is **not** an annotation of the button: it is a **floating** type whose component draws the table, placed beside the screen and **linked to the button by an arrow**. The data lives in the floating table's annotation; whoever reads the mapping reaches it through the arrows that leave the button. Write it like this:

1. The type: `floating: true`, `component` and `doc`, and a `table` field with the columns the domain asks for (event, property, value…). A column may be `ref` (`accepts` like the `ref` field; formatVersion 7) when the row points to a piece of project data (a data-model field, another screen): it is **data**, it does not draw an arrow.
2. The component (`formatVersion` 2 of the component): a `repeat` node with `field` = the key of the `table` field and `template` = the drawing of **one** row; inside the `template`, `{ "$field": "<column>" }` reads the row's column. Copy the mold from `libraries/notas/components/tabela.json` (title, one line per record, key on the left and value on the right) and swap the columns. The `preview` brings 2 or 3 example rows (a list of objects, one key per column). The marking's height does **not** grow with the rows: size `size` so that the `preview` fits (the drawing proof warns `content larger than the box` only at `size`; check the `minSize` by hand).
3. If the **relation** has data of its own, a second type with `appliesTo: ["arrow"]`.
4. In the type's document (`doc`), say that the link to the target is an arrow and how the agent finds it (`arrows` in `get_marking`).

A specialization **does not cite another**: the notes library already brings the generic **Table** type (`tabela`: title and key/value rows), but a specialization with typed columns writes its own type and its own component from the same mold.

#### Remote image: the `image` node (component `formatVersion` 3)

Use `image` when the drawing shows a photo whose URL comes from the data (avatar, photo, logo). Bind the `src` to a `string` field of the type, `{ "$field": "photo" }` (in `repeat`, the `string` column of the `table`). Rules:

- `src` is only the literal (an absolute `https://...`) or the bare `$field`: **never `$concat`**, `$switch` or `$if`; never `http:`, `data:` or a relative path.
- `fit`: `cover` (default), `contain` or `fill`; in `formatVersion` 4 also `fill-width`, `fill-height` (occupy the width or the height, centered and cropped), `scale-down` (like `contain`, without enlarging) and `none` (natural size). In a lower version: `template.children[0].fit: only allowed with formatVersion 4`. The MCP's PNG still draws the placeholder. Give it a fixed size, `fill` or `%`; **never `hug`** (it is an error). `fill` (color) serves as a background behind the image and `cornerRadius` makes a round avatar.
- A component with an `image` node uses `formatVersion` 3 of the component. The specialization does not change (no declaring an origin) and the `preview` brings an `https://` URL only if you saw it in the origin.

#### Compute instead of enumerating (component `formatVersion` 4)

In `formatVersion` 4 of the **component** the expressions do arithmetic: `$add`, `$sub`, `$mul`, `$div`, `$mod` (remainder with the divisor's sign), `$round`, `$floor`, `$ceil`, `$abs`, `$min`, `$max`, `$clamp` and `$sin`/`$cos` (in degrees), and the conditions `$gt`, `$gte`, `$lt` and `$lte`. **Do not write a `$switch` of dozens of cases, nor an `$eq` per value, on a `number` field**: use the arithmetic. Example: the progress bar with `width: { "$mul": [{ "$field": "progress" }, 200] }` in place of 101 cases; the minute's leading zero, with `{ "$if": { "$lt": [{ "$field": "minute" }, 10] }, "then": "0" }` inside a `$concat`. An empty operand, non-numeric text (a comma does not count) or a division by zero make the operation **produce no value** (the place's default applies, without a warning), and a non-integer number in `$concat` comes out with up to 6 decimal places (`0.1 + 0.2` becomes `0.3`). The validator refuses a literal operand that is not a number (`template.width.$add[1]: must be a number`), the wrong arity (`template.width.$sub: needs 2 operands`) and the keys in a `formatVersion` lower than 4 (`template.width.$mul: only allowed with formatVersion 4`). Also in `formatVersion` 4: `{ "$rows": "<table field>" }` (the number of rows; the validator refuses a field that is not a `table`), `{ "$size": "width" }` or `"height"` (the instance's width or height, which follows the marking's resizing; in the drawing proof and in `hug`, the component's `size`), the **counted** `repeat` (`count` in place of `field`, exactly one of the two; `max(0, floor(count))` rows, up to 1000, with the warning `repeat limited to 1000 rows: <node>`) with `{ "$field": "$index" }` for the row's index (0, 1, …; it is also valid in the `repeat` by `field`, it is not a field of the type and outside a `repeat` it is an error) and the **anchors by expression** (`left`, `right`, `top` and `bottom` as a number; `centerX` and `centerY` as a condition; without a number it counts as an absent anchor). Example: the numbers 1 to 31 of a calendar, without 31 fields or 31 cases: `{ "type": "repeat", "count": 31, "template": { "type": "frame", "children": [{ "type": "text", "text": { "$add": [{ "$field": "$index" }, 1] } }] } }`; a mark in the middle of the width: `"anchors": { "left": { "$mul": [{ "$size": "width" }, 0.5] } }`. **Rotation:** `rotation` (degrees, clockwise, accepts an expression) rotates any node around the center of its box, in the drawing only (layout, measurement and `hug` do not change); the children and the `clip` of a frame rotate along, and at the root it is an error (`template.rotation: not valid on the root`). Use it for a needle, a handle or an indicator instead of a table of positions: `"rotation": { "$mul": [{ "$field": "fraction" }, 360] }`; the 40 × 10 `rect` with `rotation` 90 becomes a 10 × 40 bar at the same center. In a `formatVersion` lower than 4 each of these keys gives `only allowed with formatVersion 4`, at its path. Details in `docs/COMPONENT-FORMAT.md` ("Math and comparisons", "`repeat`", "Anchors" and "Rotation").

**Variables instead of repeating the subexpression (`let` and `$var`, component `formatVersion` 4).** When the same long subexpression appears in several places (the width of a carousel's large item, an arithmetic expression on `$size`, a state's color), declare it **once** in a `let` of the `frame` and use `{ "$var": "name" }` where an expression or condition is valid: `"let": { "big": { "$mul": [{ "$size": "width" }, 0.73] } }`, `"width": { "$var": "big" }`. The `let` is valid in the frame and in the descendants (including the `template` of a `repeat`; the inner one hides the outer one; the order inside the same `let` is free). The name follows `[a-z][a-zA-Z0-9]*`. `parseComponent` replaces each `$var` with its content, like a macro, and returns the component without `let`; so `$index`, the `repeat` columns and `$size` inside a variable are those of the place of use, and the content is checked where it is used (the error carries `$var(<name>)` in the path: `template.children[1].width.$var(big).$mul[0]: must be a number`). An unused variable is not checked. Errors: `undefined variable: <name>`, `variable cycle: a → b → a`, `expected a variable name ([a-z][a-zA-Z0-9]*)`, `unknown key: let` on a node that is not a frame and `only allowed with formatVersion 4` in a lower version. It is not a function (no parameter) and does not work between components. An MCP before 0.38.0 refuses `unknown key: let`. Details in `docs/COMPONENT-FORMAT.md` ("Variables: `let` and `$var`").

#### Stroke with cap, join and sides (component `formatVersion` 4)

The drawing's `stroke` accepts, only in `formatVersion` 4 of the **component**, `cap` (`butt` default, `round`, `square`), `join` (`miter` default, `round`, `bevel`) and `sides` (a non-empty list, without repetition, of `top`, `right`, `bottom`, `left`; absent = all four). All accept an expression (`sides` through a `$switch` that returns the list). Use `sides` for a divider on the bottom only or a partial border: the stroke stays straight, with no arc at the corner, even with `cornerRadius`, and the requested sides have the same color, width, `align` and `dash` (different values per side require two nodes). `sides` is only valid on `frame` and `rect` (on `ellipse` and `path`: `only valid in frame and rect (this is <type>)`). In a component `formatVersion` lower than 4, the three keys are an error: `template.children[0].stroke.cap: only allowed with formatVersion 4`. The specialization does not change. There is no inner shadow.

#### Format 4 extensions: token in shadow and radii, dashes, alpha, offset, outline gap, shadows as a list, inherited color, `justify` and `reverse` (component `formatVersion` 4)

Only in `formatVersion` 4 of the **component**; the specialization does not change. In a lower version, each key is the error `only allowed with formatVersion 4`, at its path (e.g.: `template.children[0].stroke.offset: only allowed with formatVersion 4`).

- **Number `$token` in `shadow.x`, `shadow.y`, `shadow.blur` and `shadow.spread`** and **in each item of the `cornerRadius` list** (`[{ "$token": "corner-extra-small" }, 0, 0, { "$token": "corner-extra-small" }]`; the list still has 4 items): use it in place of a literal when the origin has the value as a token (elevation, shapes). Only `$token`, no other expression. A resolved negative `blur` counts as 0, with the warning `invalid value in shadow.blur: <value>`.
- **`stroke.dash` by expression** (`$switch`/`$if`/`$field` that return the list of numbers ≥ 0) and number `$token` in each item. Invalid resolved value: no dashing, with the warning `invalid value in stroke.dash: <value>`.
- **`alpha` on the color `$token`:** `{ "$token": "scrim", "alpha": 0.32 }` multiplies the alpha of the token's color (use it on the scrim, the handle, the transparent stop of a gradient with `alpha: 0`), instead of declaring a token per opacity. `alpha` is a number from 0 to 1 or a number `$token`. On a non-color: `alpha is only valid on a color $token` (at the path `…$token`); outside 0 to 1: `expected a number between 0 and 1`.
- **`over` on the color `$token`:** `{ "$token": "on-surface", "alpha": 0.38, "over": "surface" }` composes the color (already with the `alpha`) over the `over` one and makes it **opaque over an opaque base** (Compose's `compositeOver`; use it on the disabled state that must not stack transparency). `over` is the name of a color token (unknown name: the usual token error) or a literal color; `none` stays `none`. On a non-color: `over is only valid in a color $token` (at the path `…$token`); an `over` that is not text: `expected a token name or a color`.
- **`font.align: "justify"`:** the text fills the box's width and the last line of each paragraph stays on the left (`TextAlign.Justify`); accepts an expression. In a lower version: `template.children[0].font.align: only allowed with formatVersion 4`. Rich text (`runs`) still draws `left`.
- **`stroke.offset`** (px ≥ 0, literal or `$token`; only on `frame`, `rect` and `ellipse`: on the others, `only valid in frame, rect and ellipse (this is <type>)`): moves the stroke away from the shape, like CSS `outline-offset`, and the root's clip counts the offset. It is the key to the focus ring that goes beyond the box (`outside` with `offset` 2). The ring grows `offset` on each side and the radius of each rounded corner adds `offset`; the app, the viewer and the MCP's PNG draw it the same. `sides` with all four sides counts as an absent `sides` (the whole outline with the radius).
- **`shadow.spread`** (px, literal or number `$token`; negative is valid): grows (or shrinks) the shadow's shape on each side, with the radii + `spread` (a square corner stays square), as in CSS. Valid on `frame`, `rect` and `ellipse`, in the app, in the viewer and in the MCP's PNG; on other node types it is ignored. The root's clip counts the `spread` (reach = `blur` + `spread`, plus the offset).
- **`shadow` as a list of 1 to 4 shadows** (each item is an object with the same keys as a shadow): the first one is on top, as in `box-shadow`, and the root's clip counts all the outer ones (the one that reaches furthest applies). An empty list or one with more than 4: `shadow: expected 1 to 4 shadows`. In a lower version: `…shadow: only allowed with formatVersion 4`, at the path of `shadow`. On a type that is not `frame`, `rect` or `ellipse` the list draws only the first shadow (known limit). The drawing warning `only the first outer shadow of each node was drawn` no longer exists.
- **`stroke.gap`** (`{ "node": "<name of a template node>", "padding": 4 }`, only on `frame` and `rect`, `padding` default 0; number expression): the outline is the usual one (with each corner's radius), but the side that the named node's box crosses stays **without a stroke over the stretch it covers, plus the `padding` on each side**; it is the cut in the `OutlinedTextField` outline, which follows the measured width of the minimized label. The first node with that name in the template's order applies (a node's default name is its type); an invisible node, or one that crosses no side, opens no gap; the gap stays only on the straight part of the side (the corners with a radius are never cut) and the box used is the unrotated one. Errors: `template.children[0].stroke.gap.node: node not found: <name>`, `template.children[0].stroke.gap: gap is not valid with sides`, `…stroke.gap: only valid in frame and rect (this is <type>)`, `…stroke.gap.node: required field` and `…stroke.gap: unknown key: <key>`. Model a text field's outlined contour as **one** node with `stroke.gap` over the minimized label (`padding` 4), not with loose straight sides.
- **Inherited color: `provide` on the slot and `$provided` on the child.** The `slot` accepts `"provide": { "<name>": <text or number expression> }` and any **color** position of the child (text color, icon, background, outline, shadow) accepts `{ "$provided": "<name>", "default": <expression> }`; in a position that affects geometry (size, space, text) it is the error `$provided is only valid where a color is expected`, and the `image`'s `src` is still only a literal or `{ "$field" }` (`src only accepts literal text or { "$field": "<field>" }`). The name is free (no platform name) and cannot be empty (`template…provide: empty name`); each value is resolved **in the parent** (its fields, tokens and mode), and a value that produces nothing (an empty field with no `default`) does not provide. In `provide`, `$token` is only valid for colors; the numeric operations are valid. The **nearest** ancestor that provides the name applies, through the ownership tree (`parentId`), like Compose's `CompositionLocal`: one that does not provide the name is crossed, and with both parent and grandparent providing, the parent's applies. With no ancestor that provides it (a floating marking, a canvas marking without a parent, an instance at screen level, the drawing proof of the examples, the Catalog), the `default` applies; without a `default`, the place's default. **When to use:** the container (surface, scaffold, card) provides the content color (for example `content-color`) and the text, the icon and the icon button read it with a `default` (the place's default, `on-surface`), instead of a color field on each child or the same color repeated. Only the component's first `slot` provides. It is drawing only: the `code` does not change and there is no code parameter; changing the parent's field that changes the value redraws only the children that read it. `$provided` without a name (empty or not text): `…$provided: expected the name of the provided color (non-empty text)`; another key alongside: `unknown key`. In a lower version, `provide` and `$provided` give `only allowed with formatVersion 4`, at the key's path (`…provide`, `…color.$provided`). An MCP before this key refuses `provide` and `$provided` as an unknown key.
- **`layout.justify`** gains `space-around` and `space-evenly`, as in flexbox (with a single child, they center), and **`layout.reverse`** (boolean or expression) inverts the order of the children on the main axis and makes `start` become the end (`row-reverse`/`column-reverse`, Compose's `reverseLayout`). A `justify` value outside the set: `expected one of: start, center, end, space-between, space-around, space-evenly`.

#### Faithful layout: wrapping text, equal rows, limits (component `formatVersion` 4)

In `formatVersion` 4 of the **component** the layout gains four features; the specialization does not change. In any version, measurement is in two passes (like flexbox): a **`fill` (or `%`) text in a `hug` column or frame** is measured within the limit that the frame receives from its parent and **wraps into lines of words**, and the frame has their height. Write the card as `hug` with the `fill` text; **a fixed height is no longer needed** to keep the text from breaking letter by letter. Only `fill` on the **main** axis of a `hug` frame still counts as 0 (warning `fill inside hug becomes 0`).

- **`distribute: "fill"` on `repeat`** (a list that fills the parent's space, rows of equal heights): the `repeat` occupies the parent's axis and the rows divide the axis equally, minus the `gap`s. Without it, the rows are `hug` and a `fill` in the `template` counts as 0.
- **`minWidth`, `maxWidth`, `minHeight`, `maxHeight`** (px, accept an expression) on any node: the `fill` that hits the `max` freezes and the surplus goes to the other `fill`s of the same parent (flexbox); a `hug` text cut by `maxWidth` wraps at the cut width. A literal `min` greater than the `max` is an error (`template.children[1].minWidth: cannot be greater than maxWidth`); by expression, the `min` applies. At the root, the limits only apply when the component is measured (`hug`).
- **Expression** in `layout.type`, `layout.align`, `layout.justify`, `width` and `height` (in frame and in slot): a `$switch` on an `enum` field chooses `row` or `column`. A resolved value outside the set falls back to the default with the warning `invalid value in <key>: <value>`; pure numeric text (`"120"`) counts as px. Literals are still checked in the validation.
- In a component `formatVersion` lower than 4, `distribute`, the four limit keys and an expression in those layout keys are an error: `template.children[0].maxWidth: only allowed with formatVersion 4`.
- **Aligned overlay** (`formatVersion` 4 of the component only): `layout: { "type": "none", "align": "center", "justify": "end" }` aligns the children without `anchors` (`align` is the **vertical** axis, `justify` the **horizontal**; `start` default, `center`, `end`, `stretch`; literal or expression): it is `Box(contentAlignment)`, CSS Grid's `place-items` and `ZStack(alignment:)`. The child's `anchors` win on the axis where they exist (the per-child `Modifier.align` / `place-self`). `stretch` makes the child with no size occupy the content and a `hug` becomes `fill`. `baseline` and `space-*` are not valid in `none`, nor are `gap`, `padding`, `reverse` and `wrap`; in a version from 1 to 3 it is the error `only allowed with formatVersion 4`, at the key's path.
- **Grid and weights** (`formatVersion` 4 of the component only; the specialization's version does not change). Model with the layout closest to CSS: `LazyVerticalGrid` is `layout: { "type": "grid", "columns": 2 }` (or `minColumnWidth` for `GridCells.Adaptive`; `rows` and `minRowHeight` for the horizontal grid), with `gap` between the columns and `lineGap` between the rows; `span` (an integer ≥ 1, only on a child of `grid`) occupies neighboring columns and the child that does not fit at the end of the row goes to the next one leaving the hole. Equal segments are a `hug` grid: `repeat` with `layout: { "type": "grid", "columns": { "$rows": "options" } }` and `width: "hug"` (equal columns by the largest, `IntrinsicSize.Min`). `weight` (a number > 0) on a `fill` child of `row`/`column` is `Modifier.weight` (`flex-grow`): it shares the surplus in proportion to the weights. The grid is also valid in the slot (each child occupies a cell). To choose between `GridCells.Fixed` and `GridCells.Adaptive` by a field, write `columns` and `minColumnWidth` together, both by expression (the first one that has a value applies; an `$if` without `else` does not provide the key): `columns: { "$if": { "$not": { "$has": "minColumnWidth" } }, "then": { "$field": "columns", "default": 2 } }` and `minColumnWidth: { "$field": "minColumnWidth" }`. `Box(contentAlignment)` is a slot `layout: { "type": "none", "align": …, "justify": … }` (Arrange aligns the children in the slot's box); `LazyColumn`'s `clipToBounds` is `clip: true` on the slot. Errors: `layout: give exactly one of columns, minColumnWidth, rows and minRowHeight`, `span: only valid on a child of a grid layout`, `weight: only valid on a fill child on the main axis of a row or column`, `repeat.layout: does not combine with direction or gap`, `distribute: not valid with a grid layout`; by expression, an invalid value warns `invalid value in layout.columns|span|weight: <value>`. In a version from 1 to 3, `only allowed with formatVersion 4`.
- **Intrinsic size** (`formatVersion` 4 of the component only; the specialization's version does not change): a node's `width`/`height` and `sizing.width`/`sizing.height` accept `"max-content"` (the content without wrapping: the `row` that does not wrap, the text on one line, `IntrinsicSize.Max`) and `"min-content"` (the largest unbreakable piece: the widest word, `IntrinsicSize.Min`), literal or by expression. Use `max-content` on the label, the chip and the row that must have the width of what it carries even if it goes beyond the parent (the warning `content larger than the box` comes out as usual), and `min-content` for the narrow column that wraps at every word. `hug` is still the fit limited by the parent's space; on the height, the two count as `hug`. A `hug` text in a `min-content` `row` does not shrink by itself: give the text `fill`. The `image` node does not accept them. In a version from 1 to 3, `only allowed with formatVersion 4`.
- **`clip` on the slot and by expression** (`formatVersion` 4 of the component only): `"clip": true` on a `slot` crops the child markings by the slot's box (a child outside the box disappears); the `frame`'s `clip` now accepts an expression. It does not scroll. A child that goes beyond the slot still warns `content larger than the box: slot`.
- New drawing-proof warning: `text measured with width 0: <node>` (a text with `fill` or `%` width and no width to come from; give the parent a width).
- **Single-line text, ellipsis and maximum lines** (`formatVersion` 4 of the component only): the `font` of the `text` node accepts `wrap` (`"word"` default, `"none"` = one line per paragraph, without wrapping), `ellipsis` (`true`: text that does not fit the width, with `wrap: "none"`, or beyond `maxLines`, ends in `…`) and `maxLines` (an integer ≥ 1; the last allowed line carries the `…` with `ellipsis` or is cut). Use it for a cell, title and subject of a single line (`wrap: "none"` + `ellipsis: true`, in a box of defined width) and for an N-line paragraph (`maxLines` + `ellipsis`). They accept an expression (`maxLines: { "$field": "lines", "default": 2 }`). In a `formatVersion` lower than 4 they are an error: `template.children[0].font.wrap: only allowed with formatVersion 4`; `maxLines` 0 or fractional: `expected an integer greater than or equal to 1`. The specialization does not change.
- **`wrap: "none"` without `ellipsis` in a fixed-width box** clips the line by pixel at the box (the letter that goes beyond comes out cut in the middle); a line only wraps when it exceeds the width by more than 0.5 px.
- **The drawing proof runs in each mode** of the specialization (`light`, `dark`…) with the mode's tokens: the warning cites the mode (`type "card", the preview, mode dark, initial size 300×120: …`), and a text whose `size` comes from a token is measured with the token's size. A case that only does not fit in `dark` warns only there; fix the size or the token and validate again.
- New drawing-proof warning: `text larger than the box: <node>` (the wrapped lines exceed the node's height, or a word wider than the box, and nothing cuts them; give more height or width, let the text wrap, or use `maxLines`/`ellipsis`). Tolerance of 1 px per text node; the warning enters the "the component does not fit" pending item. Line height follows CSS: `lineHeight` in px (above 3) is the line's height as it is, the multiple does not round.

#### Rich text: runs and an inline chip in the middle of the line (component `formatVersion` 4)

When the drawing shows **bold, another color or a box with a background in the middle of a sentence** ("Invoice for **March** `overdue`"), use `runs` on the `text` node, in place of `text`: a non-empty list of runs `{ "text", "weight"?, "italic"?, "color"?, "decoration"?, "family"?, "size"?, "background"?, "radius"?, "padding"? }`. The specialization does not change (its `formatVersion` stays as it is). Rules:

- **Centering by the capital letter** (`formatVersion` 4 of the component only): `font.verticalAlign: "cap-middle"` centers the block that goes from the top of the first line's capital letter to the last line's baseline in the node's box (accepts an expression: a `$switch` may return it). Use it on the **one-line label** of a button, chip, tab and field, where the visual center must be the letter's in any font; keep `middle` in a paragraph, or when the drawing must match the DOM line by line. In a version lower than 4 it is an error: `template.children[0].font.verticalAlign: only allowed with formatVersion 4`; a value outside the set: `expected one of: top, middle, bottom, cap-middle`. With runs (`runs`) larger than the node's, the center may be slightly off. The specialization does not change.
- **Baseline** (`formatVersion` 4 of the component only): `baselinePadding` on the `text` node (`{ "top"?, "bottom"? }`, px ≥ 0, accepts an expression) is Compose's `paddingFromBaseline`: `top` is the distance from the top of the node's box to the first baseline, `bottom`, from the last one to the bottom; in `hug` the node measures `max(top, the font's) + what is between the lines + max(bottom, what is left)`. Use it on the snackbar, the tab, the supporting-text `list-item` and the bar with a title, in place of an estimated vertical position for Roboto 14/20. `layout.align: "baseline"` (only on `row`, a row `repeat` and a `row` slot) aligns the children by the first baseline. Errors: `baselinePadding.top: does not combine with verticalAlign` (the `top` with a literal `font.verticalAlign`), `layout.align: baseline is only valid in row` (on a `column`), and `only allowed with formatVersion 4` in a lower version; an `align` coming from an expression that gives `baseline` on a `column` falls back to `start` with the warning `invalid value in layout.align: baseline`. In rich text (`runs`) the baseline of the node's base font applies.
- **Row wrapping** (`formatVersion` 4 of the component only): `layout.wrap` (`"none"`, `"wrap"` or `"wrap-reverse"`, accepts an expression) on a `row`/`column` frame and on the slot wraps the children into lines, like CSS's `flex-wrap` and Compose's `FlowRow`/`FlowColumn`: a child that does not fit in what remains of the main axis goes to the next line. `layout.lineGap` (px, `verticalArrangement = spacedBy`), `layout.maxPerLine` (`maxItemsInEachRow`) and `layout.maxLines` (integers ≥ 1; the children beyond the last line are not drawn, with the warning `<n> children outside maxLines: <node>`) only apply **with `wrap`** (without it: `layout.lineGap: only valid with wrap`). `justify` and `reverse` apply on each line; `align` applies within the line; `"wrap-reverse"` puts the new line above (`AlertDialogFlowRow`). In `repeat`, the four keys sit on the node itself (`wrap`, `lineGap`, `maxPerLine`, `maxLines`), because it has no `layout`. In `hug` with no width the frame measures a single line; on the cross axis, the sum of the lines. In the slot, **Arrange** puts the child markings into lines and the new child enters the next line when it does not fit. In a version lower than 4: `only allowed with formatVersion 4`.
- **Height from content** (`formatVersion` 4 of the component only): `{ "$lines": "<text node>" }` is the number of **measured** lines of the `text` node with that `name` (at most `maxLines`; empty text, 0), where a number is valid and in comparisons: the snackbar uses `minHeight: { "$if": { "$gt": [{ "$lines": "msg" }, 1] }, "then": 68, "else": 48 }` with `sizing.height: "hug"` (1 line 48, 2 lines 68, 3 lines their height). The engine arranges in two passes (one with 1 line, another with the measured ones); if the number changes from one to the other, the warning is `$lines unstable: <node>`. Errors: `text node "<name>" does not exist`, `more than one text node "<name>"`, `text node "<name>" is inside a repeat` (a node inside the `repeat` can only be cited from inside the same row) and `the node cannot depend on its own lines` (the `$lines` on the cited node itself), at the path of the `$lines`. `sizing` accepts an expression that gives px, `"fill"` or `"hug"` (`{ "$switch": "style", "cases": { "small": 64, "medium": 112, "large": 152 } }` on the top bar's height); a value that is none of them falls back to the axis's `size` with the warning `invalid value in sizing.height: <value>`. `$size` and `$lines` inside `sizing` are an error (`sizing.height: $size is not valid in sizing`). Declare `sizing` `hug` (or by expression) on the axis that follows the content: it is what the drawing proof uses to draw the case also at the **fitted size** (the warning says `fitted size W×H`) and what the marking's **fit to content** uses: the new instance (without `rect`) is already born at the measured size, the app's **Arrange** on a marking without a slot and the MCP's `fit_marking` op take the `hug` axis (or the expression's px) to the content's size, between the `minSize` and the root's `minWidth`/`maxWidth`/`minHeight`/`maxHeight`. **When to declare:** `sizing` `hug` (or an expression) on the axis that must **follow the content** (the height of a long-label button, the width of a chip); a fixed-size axis (px or absent) and `fill` do not change in the fit, and a component with no such axis refuses the fit (`not-fittable`). The fit never runs by itself when editing a value: the `minSize` is the floor, and the agent that changes a value calls `fit_marking` afterward (guide rule). In a version lower than 4: `only allowed with formatVersion 4`.
- **The node is the base; the run overrides.** The node's `font` and `color` apply to all; the run overrides only `weight`, `italic`, `family`, `size`, `decoration` and `color`. `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`, `ellipsis` and `maxLines` belong only to the node and apply to the runs (on the run they are an unknown key). Each key accepts an expression; the run's `text` accepts `$field` (`{ "text": { "$field": "label" }, "weight": 700 }`).
- **The chip is a run with `background`.** `background` plus `radius` and `padding` (a number or `[vertical, horizontal]`) make an inline, unbreakable box: the width is the text plus 2 times the horizontal padding and the height is the run's line plus 2 times the vertical. If it does not fit in the rest of the line, it goes whole to the next one. `radius` and `padding` without `background` do nothing.
- **Wrapping by word, as a single text.** It breaks at the spaces of the runs without a background and at the edges of a chip; `\n` in a run without a background breaks and in a chip becomes a space. A space at the start of a line is dropped outside the chip and kept inside it. Prefer the space between the text and the chip in the run without a background (`"Invoice "`, then the chip): a space inside the chip enlarges its box.
- **Use `runs` instead of replacing the label with spaces and drawing the chip on top** with another node: the chip on top does not follow the text when it wraps or changes width. A library component inside the line does not exist (the chip is a run, not a node), and the pieces are centered on the line, not aligned by the baseline.
- `text` and `runs` on the same node is an error (`template.children[0]: text and runs together: use one or the other`); `runs: []`, `expected a non-empty list of runs`; an unknown key in the run, `template.children[0].runs[1].bogus: unknown key: bogus`. In a component `formatVersion` lower than 4: `template.children[0].runs: only allowed with formatVersion 4`. In the MCP, `render_marking` and `render_container` (and `get_marking_image` of a container without a file) draw the rich text with real letters, with the chip, using the embedded free font or the library's `fonts`.

### 11. Notices (`formatVersion` 10)

`notices` (a list, optional) on the type, the field or the `table` column records a **short notice** for whoever uses the specialization. Write one when **two sources you read disagree** (the contract says one thing and the code another) or when what you saw calls for care: never invent a notice without having seen the difference in the sources.

```json
{
  "id": "alert",
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

- `kind` (required): `pending` (one source already has it and the other does not yet; **the platform's or origin's name opens the `message`**, such as `compose: …`, it does not go anywhere else; and cite the registered request, the library's issue or ticket, when there is one), `deprecated` (obsolete; the `message` says what to use instead), `diverges` (the sources disagree; the `message` says on what) or `removed` (left the contract; must not be used). `message` required, non-empty and not only spaces; `since` (a real `YYYY-MM-DD` date) and `ref` (free text: the contract's page, the code file) optional. Do not repeat the same `kind` with the same `message` in the list (error `repeated notice`).
- **Rewrite all the notices of your origin, not those of others.** There are two origins, told apart by the `ref`: a **tool-generated** notice has the tool's input file as its `ref` (the tool rewrites all those with that `ref` on each round and does not touch the others); the **hand-curated** one (yours) has another `ref`, such as the type's doc, and the tool never deletes it. You rewrite yours when reviewing the doc, from what the sources show today: the notice is a snapshot of the difference, not a history. A curated notice only goes away when you review the doc and the difference is gone; do not carry it "just in case" after that, and do not delete what has a tool's `ref`. **Never hand-write a notice with a tool's `ref`** (it would vanish on the tool's next round) nor a fidelity notice that repeats what one of its `pending` already says.
- **Fidelity notices, for any library.** When writing or reviewing a component's doc, pass each item of the differences section through the criterion: only a divergence in **drawing** or **behavior** that **changes a decision** of whoever marks (how to crop, which type or field to choose, what to expect from the drawing) or of whoever writes the code (which parameter to pass, which composable or view to swap, what to check on screen) becomes a notice. What passes becomes a `notices` entry on the type (or on the field, when the difference is a field's) with `kind` `diverges`, the doc's `ref` (`docs/<type>.md`) and the `message` with the platform prefix; the rest stays only in the doc (interactive states that the static drawing does not show, a literal value instead of a token, subpixel, the reference of the files used). Use `pending` only when the limit has a registered request, cited in the `message`. A parameter that is not a field belongs to the importer, not here.
  - Good (becomes a notice): `{ "kind": "diverges", "message": "compose: a slot's children have no weight; mark each one's real width", "ref": "docs/row.md" }`.
  - Bad (stays in the doc): `"without the pressed state"`; and also bad, any notice with a tool's `ref` (`signatures/…`).
- **Informs only.** No notice, not even `removed`, prevents importing, applying, creating an annotation or accepting a proposal, and it does not become a pending item. That is why a field that must be **required** keeps `required`, and a type that can no longer exist still needs a migration, not a notice.
- **Outside the version contract:** adding, changing or removing `notices` never calls for a migration nor raises the `version` by itself (`diffSpecs` ignores them); updating the specialization only for notices shows no impact.
- **Only raise to `formatVersion` 10 if something uses `notices`.** In an earlier version, `notices` is an error (`only allowed with formatVersion 10`, at the exact path).

### 12. Children by layer and group, roles and external documents (`formatVersion` 11)

Three optional features, each for a modeling problem. Use what the origin asks for and **do not raise to 11 just in case**: without any new key, the specialization stays at the version that the content requires.

**A clause instead of a long list.** When an owner accepts **a whole** layer (every event) or a coherent part of it, write `allowedChildren: [{ "layer": "events" }]` or `[{ "layer": "events", "groups": ["navigation"] }]` instead of listing the ids. A new type in the layer becomes valid for the owner without editing it. Text items and clauses may be mixed in the same list; the list of ids is still right for a few specific children. With 20 or more ids in text, the validator warns that a clause covers the layer.

- **`groups`** (`layers[].groups`: `[{ id, name, description? }]`, `id` unique in the layer, the order is that of the headers; `annotationTypes[].groups`: a non-empty list, without repetition, of ids of the **same** layer; a type may be in several groups). Declare only the groups that the origin shows (the contract's sections, the folders, the design system's categories); a group that no type uses is a warning. A type without `groups` only enters through a clause for the whole layer or by id.
- The clause only has `layer` and `groups`, points to **another** layer (the owner's own is an error up to 12; 13 accepts it) and its `groups` exist in the cited layer (`groups: []` is an error; for the whole layer, omit it). `requiresOwner` is checked on the **resolved** set: the child must be in the set of some owner, by id, by layer or by group.

**Roles on the link.** If the child needs to say at which point of the owner it links, that is a role, not a field nor a type id. Declare on the **owner** `childRoles: [{ id, name, description? }]` (non-empty, `id` unique in the type; only on a type with `allowedChildren`) and, if the default name ("Papel" / "Role") does not serve, `childRolesLabel` ("Trigger", "Slot"; only with `childRoles`). The role belongs to the **link**: the same child type may occupy different roles in the same owner.

**`docRepos`: the document lives in another repository.** When a component's documentation lives in the design system's or the contract's repository, do not copy it into the package (the copy becomes a second source that ages): declare the repository at the root, `docRepos: [{ id, url, urlTemplate?, ref? }]` (the same rules as a platform's `repo`: `url` and `ref` of the repository you read, never from memory; `urlTemplate` with `{path}` only when you know the format of a file's address on the host), and point the type's `doc` at it: `"doc": { "repo": "design-docs", "path": "components/button.md" }`. The `path` is relative to the repository's root, ends in `.md`, with no `#`, `.`, `..` or leading `/`; the `repo` must be in `docRepos`. The external `doc` is **not a package file**: a library in which it is the only cited file counts as an isolated file, and the package's validation does not check it. The text `doc` (the package's `.md`) is still valid; write the document in the package when **you** are the one writing it. A declared repository that no `doc` uses is a warning.

**Children of the same layer (`formatVersion` 13).** When a type chains **in the same layer** (an event that fires another: `send-http-request` with the results Success and Failure, each firing a next event), 13 lets `allowedChildren` accept the clause `{ "layer": "<the type's own layer>" }` and the id of a type in the same layer, **including the type's own**. The pattern is to **chain by role**: the owner declares `childRoles` (`success`, `failure`) and accepts itself in `allowedChildren`; each following event is a **child** of the previous one in the role it links through, in the same layer. In the project, the typed annotation may have an owner from the same layer when the owner's type accepts it; the **free-form** one still only has an owner from another layer, and the cycle is still barred (`invalid-annotation-parent`). Before 13, the layer or a type of the own layer in `allowedChildren` is the error `children must be in another layer`. Only raise to 13 if some type uses this.

**Three anti-patterns** that 11 exists to avoid:

1. **The trigger in the type's id:** two types `onClick` and `onHold` that are the same event and only differ in the point of the button where they link. Make one type (`navigate`) and two roles on the owner (`click`, `hold`).
2. **A `trigger` field on each event:** the link point is data of the link, not of the child; the field repeats on every event type and nothing ties it to what the owner offers. Use `childRoles`.
3. **Pairwise `allowedChildren`:** the same thirty ids copied on each owner, so that the whole layer (or a group) is accepted. Use the clause `{ layer, groups? }`.

An owner with roles and events in groups:

```json
{
  "docRepos": [
    {
      "id": "design-docs",
      "url": "https://gitlab.example.com/group/design-docs",
      "urlTemplate": "https://gitlab.example.com/group/design-docs/-/blob/main/{path}",
      "ref": "main"
    }
  ],
  "layers": [
    {
      "id": "components",
      "name": "Components",
      "color": "#1E88E5",
      "annotationTypes": [
        {
          "id": "button",
          "name": "Button",
          "doc": { "repo": "design-docs", "path": "components/button.md" },
          "allowedChildren": [{ "layer": "events" }],
          "childRolesLabel": "Trigger",
          "childRoles": [
            { "id": "click", "name": "Click" },
            { "id": "hold", "name": "Hold" }
          ],
          "fields": [{ "key": "label", "type": "string", "required": true }]
        },
        {
          "id": "card",
          "name": "Card",
          "allowedChildren": [{ "layer": "events", "groups": ["navigation"] }],
          "fields": []
        }
      ]
    },
    {
      "id": "events",
      "name": "Events",
      "color": "#E53935",
      "groups": [
        { "id": "navigation", "name": "Navigation" },
        { "id": "data", "name": "Data" }
      ],
      "annotationTypes": [
        {
          "id": "navigate",
          "name": "Navigate",
          "groups": ["navigation"],
          "requiresOwner": true,
          "fields": [{ "key": "destination", "type": "string", "required": true }]
        },
        {
          "id": "submit",
          "name": "Submit",
          "groups": ["data"],
          "requiresOwner": true,
          "fields": []
        }
      ]
    }
  ]
}
```

The Button accepts every event (and, in it, the same `navigate` may be linked on click and on hold); the Card only those of the `navigation` group. **Outside the version contract:** adding, changing or removing `groups`, `childRolesLabel`, `docRepos` and the format of the `doc`, and changing the `name` or the `description` of a role or the order of `childRoles`, never calls for a migration nor raises the `version` by itself. **Inside the contract** are the roles' `id`s (see the next section). In a version before 11, each of these keys is an error (`only allowed with formatVersion 11`, at the exact path).

#### Role migration (`formatVersion` 12)

The role's `id` is data that the annotations store (`parentRole` on the child's link). Therefore, when **updating** an already applied library, touching a type's roles is a break and requires a step in `migrations` (the three steps only exist in `formatVersion` 12; the keys are strict, `type` is the **owner** type):

- **A role that left `childRoles`** (`removed-role`, including the type that loses all of them): `rename-role { type, from, to }` when the role only changed `id` (the `to` exists on the type) or `remove-role { type, role, mode }` when it ended. **Use `rename-role` also to merge two roles** into one (the `to` already existed in the previous version): the children of both come to occupy the same one. `mode: "clear"` keeps the child linked and erases the role (loss `cleared-role`; the child stays in Incomplete, `missing-role`, if the owner still has roles); `mode: "unlink"` unlinks the child (loss `unlinked`; pending item `missing-owner` if its type has `requiresOwner`). Choose `clear` when the child still makes sense linked to the owner, `unlink` when the role was what linked it.
- **A type that had no `childRoles` and now has them** (`roles-required`): `set-role { type, role, childType? }` gives `role` to the owner's children that **have no role**; with `childType`, only to those of that type. It fills in and **never overwrites**, and never generates a loss; a child that no step reaches stays in Incomplete (`missing-role`). Declare a `set-role` for each initial role that the origin shows, with `childType` when the role depends on the child's type.
- **A new role on a type that already had roles** (`added-role`) is additive: it needs no step.

**Renamed owner or child (the SDUI case).** The step's `type` is the owner's `id` **at that point of the chain**: after a `rename-type` of the owner, the new `id`; the roles are not compared between the old and the new type, so a role that the new type does not have becomes `unknown-role` and is resolved with a `rename-role` declared **after** the `rename-type`. The `set-role`'s `childType` may be the child's **old** `id`: **write the `set-role` BEFORE the child's `rename-type`** to give the role while the type still has the old name and not lose the information about what is going to be renamed (in SDUI, the `onClick` event that becomes `action` in `examples/specs/sdui.json` gets the `click` role before the rename; the JSON below is only an illustration and uses `navigate`).

```json
{
  "from": 2,
  "to": 3,
  "steps": [
    { "op": "set-role", "type": "button", "role": "click", "childType": "onClick" },
    { "op": "rename-type", "from": "onClick", "to": "navigate" }
  ]
}
```

- **Only raise to `formatVersion` 12 if the specialization declares some role step.** Whoever uses neither `rename-role`, `remove-role` nor `set-role` stays at the version that the content requires (11, with roles). In a `formatVersion` from 4 to 11, the step is an error (`only allowed with formatVersion 12`, at the path `migrations[i].steps[j].op`). The converse holds: a v11 that removes a role or gives `childRoles` to a type without the step is refused on update; raise to 12 and declare it.
- **Anti-pattern: removing a role (or renaming it) without the step.** The children are left with a `parentRole` that the type no longer has and the version contract refuses the update (`removed-role`). Also do not use the step to fix what the origin does not show: without evidence of the role, do not invent a `set-role`.

### 13. Version

`formatVersion` is the **minimum** for what the specialization uses. What each version adds:

- `formatVersion` 1: the basics, without platforms and without `code`.
- `formatVersion` 2: platforms and `code` (how to create an instance of each type).
- `formatVersion` 3: `sources`, the link to elements of an external system.
- `formatVersion` 4: the library (folder): `component`, `doc`, `examples`, `fonts`, `origins` or `migrations`.
- `formatVersion` 5: `repo` on some platform.
- `formatVersion` 6: `containers`, the ready-made container sizes.
- `formatVersion` 7: `floating` or `appliesTo` on some type, or a `ref` column in a `table`.
- `formatVersion` 8: `suggestions` or `linkedRef` on some `string` field or column.
- `formatVersion` 9: `variants` in the `code` of some type.
- `formatVersion` 10: `notices` on some type, field or column.
- `formatVersion` 11: a clause in `allowedChildren`, `groups` (on the layer or the type), `childRoles`, `childRolesLabel`, `docRepos` or `doc` as an object.
- `formatVersion` 12: `rename-role`, `remove-role` or `set-role` in `migrations`.
- `formatVersion` 13: the clause `{ layer }` of the type's own layer, or the id of a type in the same layer (including the type's own), in `allowedChildren`.
- `formatVersion` 14: `accepts.annotations` on a `ref` field or column (the whole annotation as the target).
- `formatVersion` 15: `tokens` at the root (design tokens per mode, read by `{ "$token": … }` in the format 4 components) or `icons` at the root (the icon set read by the `icon` node) or `structural` on a type or `origins[].kind: "measured"` (the measured origin).
- `formatVersion` 16: `fieldModels` at the root; `signature`, `ignore`, `calls` or `formats` in the `code` of a platform (or in a case of `variants`); a path (`colors.containerColor`) or a positional (`#0`) in `params`; or `signature` in `sources`.

The current format version is 16. **Only raise to 9 if some type uses `variants`, to 10 if some type, field or column uses `notices`, to 11 if something uses a key from the list above (the text `doc` does not count), to 12 only if it declares a role step, to 13 only if a type accepts children of its own layer, to 14 only if a `ref` uses `accepts.annotations`, to 15 only if it declares `tokens`, `icons`, `structural` or `kind: "measured"`, and to 16 only if it declares `fieldModels`, `signature`, `ignore`, `calls`, `formats` or a path or positional in `params`**: the rest of the library stays at the version that the content requires (the notes library stays at 7, the Kotlin one at 8 and the Material 3 one at 9). The **component** has its own version: `formatVersion` 1, 2 when it uses `repeat`, or 3 when it uses `image` (1 is still accepted; `repeat` in a 1 is an error). A version greater than necessary prevents importing into old apps with no gain.

- `version` is an integer ≥ 1. New specialization: `1`. Update of an already applied one: one more than the applied one (`update_specialization` requires a greater version). Never change the `id` in an update: it is the identity.

## Validate before delivering

The validation is the same as the app's import, with the exact path of the error (`layers[0].annotationTypes[2].fields[1].default: …`). **Library (v4):** validate the **whole folder** (see "Validate the library" below), not only the file. Run it, fix the pointed-out part, run again, until **zero errors**. For each **warning** (a declared and unused platform, a platform with `path` and without `repo`, a type without `code` in a specialization with platforms, an old `format`), either fix it or explain in the delivery why it stays; the `ignored-field` warning (`codeRef` field) is always fixed, by removing the field.

1. **With the MCP server** (the normal path): `validate_specialization({ text })` with the JSON, or `validate_specialization({ path })` if the file is inside the roots. It applies to no project.
2. **Without MCP, with the Mapping repository within reach**: a disposable test in `tests/model/`, run with `npx vitest run tests/model/spec-draft.test.ts` and deleted afterward. It gives no warnings, only errors.

   ```ts
   import { readFileSync } from 'node:fs';
   import { expect, test } from 'vitest';
   import { parseSpecText } from '../../src/model/spec';

   test('the draft specialization is valid', () => {
     const result = parseSpecText(readFileSync('/path/to/<id>.json', 'utf8'));
     if (!result.ok) console.log(result.errors.join('\n'));
     expect(result.ok).toBe(true);
   });
   ```

3. **With neither of the two**: deliver saying that you did not validate. Do not claim that it passes.

### Validate the library

Generate, `validate_library`, fix, repeat until **zero errors**. An error prevents use; a **warning lets it be used**, but each one is either fixed or explained in the delivery (a font missing from the package and content larger than the box are expected when the drawing is faithful to the origin). The three levels are always the same: (1) each file, (2) the coherence between them (and the version contract, with the previous version) and (3) the drawing proof, which instantiates each component and passes the external-system examples through the declaration. Each problem comes with `file`, `path`, `message` and `severity`.

1. **With the MCP server:** `validate_library({ path: "<folder>" })`, with `previous: "<previous version's file>"` in an update. The folder must be inside the roots. Use `level: 1` or `2` to iterate and close with the default (3).
2. **Without MCP, with the Mapping repository within reach:** a disposable test in `tests/model/`, run with `npx vitest run tests/model/library-draft.test.ts` and deleted afterward. It calls the same `validateLibrary` function as the app.

   ```ts
   import { readFileSync, readdirSync } from 'node:fs';
   import { join } from 'node:path';
   import { expect, test } from 'vitest';
   import { validateLibrary, type LibraryFile } from '../../src/model/library';

   const DIR = '/path/to/<id>'; // the package's folder

   function readPackage(dir: string): LibraryFile[] {
     return readdirSync(dir, { recursive: true, withFileTypes: true })
       .filter((entry) => entry.isFile())
       .map((entry) => {
         const full = join(entry.parentPath, entry.name);
         const path = full
           .slice(dir.length + 1)
           .split('\\')
           .join('/');
         return /\.(json|md)$/i.test(path)
           ? { path, text: readFileSync(full, 'utf8') }
           : { path, binary: true };
       });
   }

   test('the draft library is valid', () => {
     const report = validateLibrary({ files: readPackage(DIR) });
     for (const i of report.issues)
       console.log(`${i.severity} ${i.file} ${i.path}: ${i.message}`);
     expect(report.errors).toEqual([]);
   });
   ```

   In an update, also pass `previous` (the previous version's `Spec`, read with `parseSpecText` from `src/model/spec`).

3. **With neither of the two**: deliver saying that you did not validate.

**The person applies:** deliver the validated folder. The agent only applies through a proposal (`propose_changes` with `apply_specialization` or `update_specialization` and `file` = the folder; beforehand, `plan_library_update` shows the impact) if the request says so; the review and the acceptance are the person's, in the app.

Besides the validator, reread the file with these questions: is each type of the inventory there, or is it listed as out of scope? Did any type enter without evidence in the origin? Does every `description` say something that the name does not? Do the `code` `symbol`s really exist, and does each `path` point to the file that defines them?

## Delivery

**Final review, before delivering:** is each `symbol` what is called to create the instance (and not the output node's name), and does each platform with `path` have `repo`?

1. The JSON file at the agreed path, formatted with two spaces, keys in the order of the commented example in `docs/SPEC-FORMAT.md` (`format`, `formatVersion`, `id`, `name`, `version`, `description`, `platforms`, `containers`, `layers`). Library: the whole **folder** (specialization, `components/`, `docs/`, `examples/`, `fonts/`), with the files formatted with two spaces.
2. A short summary, in this order:
   - a layer → types table, with the origin evidence for each type;
   - the modeling decisions that were not in the prompt (required field or not, what was left out, new tags);
   - the open doubts, each with the chosen option and the alternative;
   - the validation result (zero errors; warnings and what was done with each); in a library, the `validate_library` result (or the caveat that it did not run) and, for each component, where the drawing came from.

Do not apply the specialization to a project or create a proposal, unless the prompt asks. Applying changes the person's project; they decide when.

## Frequent pitfalls

- A child's position resolved with a `$switch` of `anchors` (left, center, right, by field) just to align, or `px` computed by hand to center and snap to the end: use the aligned `none` (`layout: { "type": "none", "align": …, "justify": … }`, also by expression) and leave the `anchors` only for the child that breaks the rule.
- A grid imitated with a `repeat` in a `column` of `row` lines, or with a `$switch` of positions (`anchors`) per cell: use `layout: { "type": "grid", … }` (or `repeat.layout` `grid`) and `span`; to split the width into unequal parts, `weight` instead of a computed `%`. The keys `grid`, `columns`, `minColumnWidth`, `rows`, `minRowHeight`, `span`, `weight` and `repeat.layout` belong only to `formatVersion` 4 of the component.
- The width of a label, chip or non-wrapping row computed by hand (fixed px, or `hug` inside a narrow parent that wraps): use `width: "max-content"` (`IntrinsicSize.Max`); for the narrow column that wraps at every word, `"min-content"`. In a `min-content` `row` give the text `fill`, because the `hug` text is the whole line and does not shrink. Only in `formatVersion` 4 of the component.
- A root component `layout: none` with the `minSize` smaller than the content: the drawing proof now warns `content larger than the box: <frame>` also in the `none` parent (a child's extent, with the anchors, goes beyond the content area), so the `minSize` must cover the content. A badge that must overflow on purpose is not a node of the component: it is an anchored marking.
- The same long subexpression (more than about 100 characters) copied in several places in the template, instead of a `let` on the frame and `{ "$var": "name" }` at the uses: the file bloats and a fix must be made in every copy. A variable with a name outside `[a-z][a-zA-Z0-9]*`, `$var` with another key alongside, `let` on a `rect`, `text` or another node that is not a `frame`, a variable that uses itself or that closes a cycle (`a → b → a`), a `$var` whose name no `let` above declares, or `let` and `$var` in a component `formatVersion` lower than 4 (`only allowed with formatVersion 4`).
- A `$switch` with dozens of cases (or an `$eq` per value) on a `number` field, for a position, size or text: the file bloats and the drawing is only valid for the listed values. Compute with `$mul`, `$add`, `$mod`, `$clamp`… (component `formatVersion` 4), for example `width: { "$mul": [{ "$field": "p" }, 200] }`; for a list of N equal items, `repeat` with `count` and `$index` instead of N copied nodes.
- A component `font.family` with an unclosed quote, an empty item in a stack (`Roboto, , serif`) or a quote in the middle of the name: it is a **warning** in the validation and the text falls back to `sans-serif`. The family accepts a CSS stack (`system-ui, "Segoe UI", Roboto, sans-serif`) or a single generic name (`system-ui`); do not put quotes around the whole stack.
- Bold, color or a chip in the middle of a sentence drawn with several `text` nodes side by side or with a space in the label and a rectangle on top: use `runs` (component `formatVersion` 4). `runs` together with `text`, or in a component `formatVersion` lower than 4, is an error.
- A layer per code module instead of per nature: the events end up in the same layer as the components and `allowedChildren` does not validate.
- A repeated type `id` in different layers (`button` in Components and `button` in Screens): the id is unique in the whole specialization.
- A boolean as `string` with `default: "true"`: use `enum`.
- `enum` for a text that is not exhausted by the list (the type of a property): it blocks legitimate values; use `string` with `suggestions`. And the reverse: `suggestions` for a closed set, which does not prevent the wrong value.
- `default` outside `options`, or `default` on `ref`.
- A hand-curated `notices` carried from one round to the next after you reviewed the doc and the difference is gone (those with a tool's `ref` are not yours: it rewrites them), a hand-written notice with a tool's `ref`, a platform notice's `message` without the `<platform>: ` prefix, a fidelity notice for what stays only in the doc (pressed state, literal value), or a notice invented without having seen the divergence in the sources; `notices` in a specialization that stayed at `formatVersion` 9 or lower.
- A `codeRef` field (where the instance was written): it left the format; remove it.
- A `symbol` with the output node's name (`"onClick"`, `"image"`) instead of the function or class that generates it.
- A platform with `path` on some type and without `repo` (warning): fill in `url` and `ref` of the repository you read.
- `requiresOwner: true` with no type listing the child in `allowedChildren` (in 11, neither by id nor by a clause that covers it), or with the type itself as the only owner (`requires an owner, but no other type accepts it as a child`).
- Chaining events with type fields, `chainedAfter` and `trigger` (the previous event and the trigger as the child's data): the "when" is a **role** of the link, also between events. Declare `childRoles` on the owner event, make it accept itself in `allowedChildren` and use `formatVersion` 13.
- A `{ layer }` clause of the own layer (or an id of a type in the same layer) in a `formatVersion` below 13: the error is `children must be in another layer`. Raise to 13, or change the modeling.
- A `string`/`json` field with the structure of a list of components, or a tag created just so the `ref` has a target, when `accepts.annotations` (`formatVersion` 14) points to the types directly. `accepts.annotations: []` is an error; in a version below 14 the error is `only allowed with formatVersion 14`.
- In `formatVersion` 11: the trigger in the type's id (`onClick` and `onHold` as types), a `trigger` field on each event or pairwise `allowedChildren` with a whole layer listed id by id: use roles (`childRoles`) and the clause `{ layer, groups? }`. A clause for the owner's own layer, `groups: []` or a group that does not exist in the cited layer; `childRoles` on a type without `allowedChildren`; `childRolesLabel` without `childRoles`; a `doc` object with a `repo` outside `docRepos` or a `path` with `#`; 11 declared in a specialization that uses none of these keys.
- `code` referring to an undeclared platform, or `params` with a key that is not a field of the type.
- `sources[].values` on a field that is not `enum`, or a target that is not in `options`.
- `formatVersion` 3 in a specialization without `sources`, just "to be safe".
- A framework name outside `platforms`/`code`, or a specialization citing another by name.
- An example of a type with a `table` field (`items`, `options`) without the rows: in the Catalog it comes out without the content (without destinations, without options). Put the list of rows from the component's `preview` in `values`; an example that does not bring the field does not inherit the `preview`.
- Library: a path with `..` or outside the folder; a component, document or example file that nobody cites (it becomes a warning); a template citing a field key that the type does not have; an example with a value outside the `options`; `fonts` declared without the file (warning; by convention leave `fonts/LEIA-ME.txt` saying what is missing).
- A library update that removes or renames a role in `childRoles` (or gives roles to a type that had none) without `rename-role`, `remove-role` or `set-role`; a `set-role` written after the child's `rename-type`, when the information depended on the old type; 12 declared in a specialization with no role step.
- Library: validating only the file (`validate_specialization`) and assuming the package passes; renaming a field or type in an update without `migrations`; proposing to apply the package without the request saying so.

## Prompt that invokes this skill

The prompt only needs to specify. Template:

> /spec-author
>
> Specialization **`<id>`** ("<Name>") for Mapping, `formatVersion` <1|2|3|4|5|6|7|8|9|10|11|12>.
>
> **Origin:** <repository, folder or design system>, reading <what to read: components folder, exported catalog, document>. Ignore <what to ignore>.
>
> **Platforms:** <`id` → name, language, library repository (`url` and `ref`)>, <…>; for each one, what is called to create an instance of a type (composable, view, class, BFF function). (Omit in `formatVersion` 1; the repository only in 5.)
>
> **External origin:** `system` = <exact name>, ids/names in <where to get them>. (Only in `formatVersion` 3.)
>
> **Containers:** <ready-made sizes (name, width × height, background color) and where they come from>. (Only in `formatVersion` 6; omit without evidence.)
>
> **Floating types:** <types that are loose comments, outside any screen, and the data tables linked to the element by an arrow>. (Only in `formatVersion` 7; omit without evidence.)
>
> **Arrow types:** <annotation types that describe the relation between two markings (`appliesTo: ["arrow"]`)>. (Only in `formatVersion` 7; omit without evidence.)
>
> **Notices:** <differences between the sources (contract × code) to record in `notices`, with the `kind` of each>. (Only in `formatVersion` 10; omit without evidence.)
>
> **Children, roles and external documents:** <owners that accept a whole layer or groups, the child's link roles (`childRoles`) and the repositories where the types' documentation lives (`docRepos`)>. (Only in `formatVersion` 11; omit without evidence.)
>
> **Role migration:** <roles that left or changed `id` in this update and the ones a type came to have, with the children's destination (`clear` or `unlink`)>. (Only in `formatVersion` 12; omit without a role step.)
>
> **Out:** <what not to model>.
>
> **Output folder:** <path of the package folder>. (Only in `formatVersion` 4, which writes the whole library.)
>
> **Origin of the components:** <Figma SVG (files or frames), code (folder and theme) or document (which)>. (Only in `formatVersion` 4.)
>
> **Save to:** <file path; in `formatVersion` 4, the output folder>. Validate before delivering. Do not apply to any project.

In a library, the prompt also says whether there is a **previous version** (the file, for the version contract). When the specialization is an **update** of an already applied one, the prompt says which (`get_specialization` gives the current JSON) and what changes; keep the `id`, raise the `version` and preserve existing type ids and field `key`s, because already created annotations point to them.
