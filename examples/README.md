# Examples

This guide says **what you can see in each example** of the repository and how to open it. It is for people who use the app and the MCP server: to learn a feature, pick the example that shows it and open it.

The examples live in three places:

- `libraries/`: the real, ready-to-use libraries. They are the first source of examples for any feature.
- `examples/`: only what the libraries do not cover, plus the projects and ready-made zips for the test scripts.
- `tests/fixtures/`: files that only the tests read. They are not examples and are not in this guide.

The test `tests/examples/featureCoverage.test.ts` guarantees that every feature of the specialization and component formats has at least one example. The test `tests/examples/examplesReadme.test.ts` guarantees that every example on disk has a section here and that no section points to something that no longer exists.

Button and menu names are the app's English texts. On the home screen: **Open folder**, **Open zip** and **Open library**. Under **Specializations**: **Apply specialization…**, **Apply folder…** (Chrome and Edge only), **Apply zip…** and **Update from folder…**. The **Catalog** opens with `Ctrl+Shift+9`. The `R…` scripts are in [`docs/TESTING.md`](../docs/TESTING.md).

## Ready-made libraries (`libraries/`)

### `libraries/notas/`

**What it is.** Loose notes on the canvas: the text sticky note (**Note**) and the key-value table (**Table**). Two types, both floating.

**How to open.** It ships with the app and is applied by itself to every new project. To see the design and the documentation without a project: **Open library** on the home screen and pick the folder. With a project open: **Catalog** (`Ctrl+Shift+9`), **Components** tab, **Notes** library; in the **Palette** tab, **Add**.

**What you can see.**

- The floating marking: the note and the table sit on top of everything, belong to no screen and do not move with it (`floating` on both types).
- The note (`nota`): fields `titulo` and `texto` (required), a yellow card with a shadow.
- The table (`tabela`): a `linhas` field of the table type (columns `chave` and `valor`) drawn row by row by the `repeat` node, with the `preview` already in table form.
- One document per type (`docs/nota.md`, `docs/tabela.md`) and one named example on each type.
- Simple sizing: `size`, `minSize` and `sizing` with `fill`; conditions with `$has` to hide the empty title.

**Scripts.** R10.8, R11.5, R12.13 to R12.16.

### `libraries/kotlin/`

**What it is.** Kotlin declarations as annotation types: class, data class, sealed class, enum class, value class, annotation class, object, data object, interface, sealed interface and fun interface. Each one is a class-diagram card.

**How to open.** It is not embedded. **Specializations** › **Apply folder…** (or **Apply zip…** with a zip of the folder). Without a project: **Open library**. Already applied and with data: `examples/suggestions-kotlin.zip`.

**What you can see.**

- Two layers (`kotlin-classes` and `kotlin-interfaces`) with eleven types, each with a component, a document and an example.
- Multi-column tables: **Properties**, **Functions**, **Supertypes** and **Constants** (enum class), drawn by `repeat`, with the height measured by the number of rows.
- References between declarations: the `outer` field (**Declared in**) and the `typeRef` column (**Mapped type**) are `ref` fields that accept the `kotlin-type` tag. Each **Properties** row is a reference target with the tags `data-field` and `kotlin-property`, named by the `name` column (`rowLabel`).
- Text suggestions: the **Type** column of **Properties** has `suggestions` (`String`, `Int`, `List`…), which do not restrict the value.
- Mapped targets in the list: `linkedRef` links the **Type** column to the **Mapped type** column; choosing a declaration saves the text and the reference together, in one undo entry.
- `enum` with a default value (visibility, modality) and components with `$switch`, `$if`, `$concat`, `$has` and `$field` with `default`, italic text and opacity.

**Scripts.** R14.

### `libraries/material3-compose/`

**What it is.** Material Design 3 for Jetpack Compose: 50 types in three layers (layout, content and components), pinned to `androidx.compose.material3` 1.4.0, with the Roboto font in the package.

**How to open.** It is not embedded. **Specializations** › **Apply folder…**, or **Apply zip…** with `examples/material3-compose.zip`. Without a project: **Open library**. Through the MCP: `validate_library` and `apply_specialization`.

**What you can see.**

- The Button, with the variants table in the Catalog (`variants` in `code`): the `style` field switches the composable (`Button`, `OutlinedButton`, `TextButton`, `FilledTonalButton`, `ElevatedButton`). Twenty-six types have variants.
- The complete `code` of each type on the Compose platform: `symbol`, `path` in the androidx repository (with `repo` pinned to a commit and `urlTemplate`), `params`, `values` (the translation of the options into the code expression) and `notes`.
- The four ready-made container sizes (`containers`): Phone, Large phone, Tablet and Desktop, in the **New container** dialog.
- The Roboto 400 and 500 fonts as `.woff2` (`fonts`), so the texts come out in Roboto and validation gives no warnings.
- Components with room for children (the `slot` node): Scaffold, Surface, Box, Row, Column, LazyColumn, LazyRow, LazyVerticalGrid, FlowRow, HorizontalPager and PullToRefresh.
- Drawn tables (`repeat`, in the column and in the row): Navigation bar, Navigation rail, Navigation drawer, Tabs, Segmented button, Dropdown menu, Bottom sheet, Carousel and Short navigation bar.
- Remote image (the `image` node with `fit` `cover`, `contain` and `fill`): Image, Card (`media`), List item (`leadingImage`) and Carousel. Without the origin's consent, the gray placeholder appears.
- Icons and shapes: the `path` node (most types), `ellipse` (Switch, Radio button, Slider, Progress indicator) and `rect`.
- Official minimum size (`minSize`) only where Compose defines it on both axes: Button 58 × 40, Text field 280 × 56, FAB 40 × 40 and others.
- Text suggestions on the icon fields (`suggestions`: `Home`, `Search`, `Add`…).
- Sizing with percentages (Slider, Short navigation bar), anchors (`anchors`, including `centerX`), gradient (Carousel), dashed stroke and `outside`, `$and`, `$or` and `$not` in conditions.
- All 50 types have a component, a document and one to three examples.

**Scripts.** R17.

## Libraries that stay (`examples/libraries/`)

### `examples/libraries/analytics/`

**What it is.** Analytics events on the canvas: the **Event** (a loose table with a name and properties) and the **Transition** (the annotation of an arrow).

**How to open.** **Specializations** › **Apply folder…** and pick the folder. Or **Open library** to only see the Catalog.

**What you can see.**

- The type that only applies to an arrow (`appliesTo: arrow`): the **Transition** only shows up when an arrow is selected, with the **Condition** and **Event** fields. No other library has an arrow-only type.
- The **Event** is a floating marking with a component: a purple header with the event name and one row per property, drawn by the `repeat` node (the `properties` field).
- One document per type (`docs/event.md`, `docs/transition.md`) and one named example on each.

**Scripts.** R12.19 and R12.20.

### `examples/libraries/sdui-backend/`

**What it is.** The example of the **executable origin**: a fictional external system (an SDUI backend) describes screens in JSON and the `origins` declaration translates them into components. Six types: **Column** (with a slot), **Button**, **FAB** (floating), **Bottom sheet** (modal), **Scrim** and **Endpoint** (a marking-only annotation, with no component). Version 3, no fonts.

**How to open.** **Specializations** › **Apply folder…** and pick the folder. Or **Open library** to only see the Catalog (no errors or warnings).

**What you can see.**

- The origin (`origins`): `booleans`, `background.values`, screen roots with `anchor`, `margin` and `scrim` (the `sdui-scrim` type) and the example screen `examples/settings.sdui.json`.
- The matches with the external system (`sources`): `slot` and `ignore` on the type, the `id` of a non-executable system (`figma`), `path` and `values` on the fields and on a table column, and the example of an external-system node (`examples/button.sdui.json`, in the Button gallery).
- The version contract (`migrations`): a migration from version 1 to 2 with the six steps (`rename-type`, `rename-field`, `map-values`, `fill-field`, `remove-field`, `remove-type` in `convert` and in `delete`).
- The **Endpoint** type: `appliesTo: marking`, `linkedRef` (the response type text saves the link together), and a table with `number`, `date`, `enum` with an origin and `ref` that accepts `free` columns.
- A container with `background` (`containers[].background`).
- Component features: `font.decoration` (underline and strikethrough in the Button), `verticalAlign` `top` and `bottom` and `layout.align` `end` (Bottom sheet), `fillRule` `nonzero` and `evenodd` (FAB) and an image with a literal `src` (Bottom sheet).

**Scripts.** R10.10 and R10.11.

### `examples/libraries/measured/`

**What it is.** The example of the **measured** origin (`origins[].kind: "measured"`): the rectangle tree of a page (measured in a browser) becomes markings, matching each node to a type through the `sources`. Two types: **Card** and **Button** (fields `label` and `tone`). The example tree is `examples/page.measured.json`, next to the library folder.

**How to open.** **Specializations** › **Apply folder…** and pick the folder. The import is only through the MCP: the `import_measured` op of the batch, with `file` pointing to `examples/page.measured.json`.

**What you can see.**

- The `measured` origin (`system`, `kind`, `name`): the type comes from the node's `id`, class or `type` against the `source`'s `name`.
- Fields read through the `props` `path`, with `values` on the enum (`danger` becomes `error`).
- The root node and the `x-mysterious` node have no type: they become a warning and are ignored, and the children carry on.
- Membership comes from geometry: the buttons end up inside the card because their rectangle fits inside it.

**Scripts.** R25.58 and following.

## Single-file specializations (`examples/specs/`)

To apply a loose file: **Specializations** › **Apply specialization…**. The two main ones also come from the app itself, in **Help** (F1) › **Downloads**. Through the MCP: `validate_specialization` and `apply_specialization`.

### `examples/specs/sdui.json`

**What it is.** The SDUI specialization, `formatVersion` 12: components of a server-described interface (Button, Input, Text, Image), events (Action, Feedback and Validation) and screens. The event trigger (Click, Press, Change) is its **role** on the component, not a type.

**What you can see.**

- Three platforms (Android, iOS and BFF), each with `repo`, `urlTemplate` and `ref`, and the `code` of each type on them (`symbol`, `path`, `params`, `values` and `notes`). In Details, the **Definition** row has **Open in repository** and **Copy path**.
- Relations between layers: the Button accepts as children the events of the Interaction group, by **clause** (`allowedChildren: [{ "layer": "events", "groups": ["interaction"] }]`), and the Input accepts those of the Data group; the events require an owner (`requiresOwner`) and the Events layer has `groups`.
- Roles on the link: `childRoles` (Click and Press on the Button, Change on the Input) with `childRolesLabel: "Trigger"`; the child annotation stores the role (`parentRole`) and the owner's "+ Link…" creates the event already in the role.
- Document in an external repository: `docRepos` and the Button's `doc` as an object (`{ "repo", "path" }`).
- Version contract: v4 swaps `onClick`, `onHold` and `onChange` for `action`, `feedback` and `validation` (`migrations`, three `rename-type`) and gives a role to the links that came without one (four `set-role` with `childType`: `click`, `hold` and `change`). Whoever updates from v3 to v4 gets the links with a role and no pending item; whoever is already on v4 keeps the `missing-role` pending item, fixed by hand.
- Strong reference: the `data` field of the Input and of the Text is a `ref` that accepts the `data-field` tag or a free annotation (`accepts`).
- The value types `string`, `number`, `enum` (with a default value) and `table` (the `parameters` of the Action), and required fields.
- A file without a library: it has no component and no document.

**Scripts.** R1.3, R1.16, R3 (R3.1 to R3.9), R8, R19 and R20.

### `examples/specs/roles-migration.json`

**What it is.** A small specialization, `formatVersion` 12, at version 2, only to show the role steps that SDUI does not use: what changed in the `childRoles` from version 1 to 2 and how the migration covers each change. Two components (Button and Slider) with the Interaction event type as a child.

**What you can see.**

- `rename-role`: the Button's `tap` role becomes `click` (which already existed in version 1, so the two **merge**).
- `remove-role` with `mode` `clear`: the Button's `hold` role goes away and the children stay linked, with no role (loss `cleared-role` and pending item `missing-role`).
- `remove-role` with `mode` `unlink`: the Slider's `drag` role goes away and the children are unlinked (loss `unlinked` and pending item `missing-owner`).

**How to open.** **Specializations** › **Update version…** on a project that has version 1 (written in R19), or `plan_library_update` through the MCP.

**Scripts.** R19 (role update steps).

### `examples/specs/data-model.json`

**What it is.** The Data model, `formatVersion` 1, the simplest format: two layers, Classes and Endpoints.

**What you can see.**

- The `date` type (`reviewedAt`, a `YYYY-MM-DD` date) and the `number` with a default value (`version`, `timeoutMs`).
- The `attributes` table with the `data-field` tag and `rowLabel`: each row becomes a reference target, which the SDUI `data` field accepts.
- A specialization without platforms, without `code` and without a library: it is `formatVersion` 1.

**Scripts.** R1.3 and R8.

## Ready-made projects and zips (`examples/`)

### `examples/full-example/` and `examples/full-example.zip`

**What it is.** The app's example project, with four screens, and the source of the interactive guide. The folder and the zip have the same content; the zip is what the guide links to.

**How to open.** Download `examples/full-example.zip` from the repository and use **Open zip** on the home screen (it only saves a copy **On this device**, nothing in a folder), or **Open folder** on the folder (on a fresh clone, run `npm run build:example` first: it materializes `specs/`, which is not versioned). The app does not embed the example. The guide: the **Interactive guide** link on the home screen and in **Help**. The guide is bilingual (en-US and pt-BR) and is published at `guide/` (`public/guide/`; the old `guia/` address redirects).

**What you can see.**

- Four screens side by side: Sign up and Login (with a photo), Settings and Order details (a container without a photo, with `material3-compose` components drawn with the annotations' texts).
- Ten layers and four applied specializations: SDUI, Data model, `material3-compose` (one layer for the layout, with Row and Column, and another for the components) and Notes. There are annotations of all the main types (Button, Input, Text, Action, Feedback, Validation, Screen, class and endpoint; the events already linked by role) and free ones (Model and Questions).
- Editing cases: a locked marking (**Title**), one with a position to review (**Age**, in **Incomplete**), a floating note from the notes library and the nested markings in the **Tree**.
- An open proposal, **Profile screen and Sign up tweak**, with ten changes to practice the review (the types are from `material3-compose`: `top-app-bar`, `list-item` and `button`): accept, reject with a note and apply.
- Three **conversations** in `comments/` (made-up names and emails, `example.com`): one opened by the agent on the **style** field of the **Register** button, which waits for you and cites other markings; one on the **Save** marking, which waits for the agent; and a resolved one, on **Manage plan**. Open the **Comments** window (`Ctrl+Shift+0`) and turn on the **Conversations** button to see the pins. The guide has a text step about them.
- **Arrange** (`Alt+Shift+A`) on a Row with chips and the **Preferences** Column with the two Switches and the Checkbox inside, the **Catalog** with the **Palette** and **Diagnostics**.

**Scripts.** R11 and R22.

### `examples/proposal-example.zip`

**What it is.** The **Shop** project with an agent's proposal to review.

**How to open.** **Open zip** with the file. Then **Proposals** (`Ctrl+Shift+7`) › **Review**.

**What you can see.**

- The proposal **Checkout from Figma**: creates the Events layer and the **Confirmation** image (with the **Success message** marking), swaps the Cart image, renames the **Header**, moves the **Pay button**, creates the **Coupon field** (with an Input annotation), removes the **Promotion banner** and touches annotations.
- The **Current** × **Proposed** view, the decision marks, the name conflict (rename before reviewing), the lock on the locked **Pay button**, the note to the agent, **Apply accepted** and the one-step undo.
- **Export** with the proposal open and **Delete proposal…**.

**Scripts.** R4, R6 and R8.

### `examples/proposal-components.zip`

**What it is.** The **Screens** project (a blank 360 × 800 screen with `material3-compose` applied) and an open proposal that creates `button` components. The zip carries the applied package (`specs/material3-compose/`) and a copy of it, with another id (`m3new`), in the proposal's package.

**How to open.** **Open zip** with the file; **Proposals** › **Review** on **New components**.

**What you can see.** In the **Proposed** view, the components the proposal creates, drawn with the created mark, in each review case: the changed **Existing** (the Label `Old` becomes `New value`), **Pending**, **Accepted**, **Rejected** (only the dotted ghost, in both views), **Invalid** (a 3 × 3 rectangle), **Unlabeled** (a required field is missing) and **From the package** (a type that only exists in the proposal's package, which is not written to `specs/`). Also the legend of the marks, in both languages.

**Scripts.** R13.

### `examples/suggestions-kotlin.zip`

**What it is.** The **Kotlin suggestions** project: a plain image and two data classes from the Kotlin library, **User** and **Address**.

**How to open.** **Open zip** with the file. Select **User** and open **Details** (`Ctrl+Shift+3`).

**What you can see.**

- The suggestions list when typing in the **Type** column of **Properties** (24 types such as `String`, `Int` and `List`), which does not restrict the value: `String?` and `List<Address>` are accepted.
- The `active` property with an empty **Type**, to practice.
- The mapped targets in the list: **Address** shows up before the fixed suggestions, and choosing it saves the text and the **Mapped type** together, undone with one `Ctrl+Z`.

**Scripts.** R14.

### `examples/material3-compose.zip`

**What it is.** The `libraries/material3-compose/` package zipped, with the content at the root of the zip. It is for people who cannot pick a folder.

**How to open.** **Specializations** › **Apply zip…**; or **Open library** (the button opens the zip picker when there is no folder); or `validate_library` through the MCP.

**What you can see.** The same as `libraries/material3-compose/`, described above, in a single file. A test checks that the zip equals the folder.

**Scripts.** R17.

### `examples/workspace/`

**What it is.** The skeleton of a central folder of mappings to work with an AI agent: the MCP server, the roots, the `spec-author` skill and the instructions (`AGENTS.md`) for any MCP client.

**How to open.** Copy the folder wherever you want, run `./setup.sh` (to update an old workspace, the transition line is in the folder's `README.md`) and open the folder in the agent (Claude Code, Cursor, Gemini CLI, Copilot or Codex). The projects live in `projetos/` and the specializations in `especializacoes/`.

**What you can see.**

- The `setup.sh`, which downloads `tools/mapping-mcp.js`, the `spec-author` skill and the `AGENTS.md` rules block (between the `mapping:begin` and `mapping:end` markers) from the latest release, checks the `sha256` of everything before replacing any file and updates itself (`--no-self-update` turns it off). Running it again updates, without touching `projetos/`, `especializacoes/` or what you wrote outside the block.
- One configuration file per tool (`.mcp.json`, `.cursor/mcp.json` and the others), all pointing to the same command with the two roots.
- The `AGENTS.md` with the "What these mappings are for" section for the person to fill in, and the `CLAUDE.md` that imports it.
- How to work from the code's repository (`get_code_hints`, `find_by_code`).

**Scripts.** None. Section 6 of the tester's guide sets up the MCP server separately, without this folder.

## Where to see each feature

When one exists, the example is from `libraries/`. The features of the executable origin, of `sources` and of migration are in `sdui-backend`; the ones that depend on a font file and on italics (`fonts[].style`) have no example, by the owner's decision (the font is fixed in the mobile client, outside SDUI; they are in `EXCEPTIONS` of the test `tests/examples/featureCoverage.test.ts`, which says which example covers each key and each value).

### Specialization

| Feature                                                         | Where to see it                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `string`                                                        | Note: `texto` (`notas`); Class: `name` (`kotlin`)                                                                         |
| `number`                                                        | `surface.tonalElevation` (`material3-compose`); `endpoint.timeoutMs` (`data-model.json`)                                  |
| `date`                                                          | `class.reviewedAt` (`data-model.json`); `since` column of `endpoint.params` (`sdui-backend`)                              |
| `enum` and boolean as `enum`                                    | `button.enabled` and `button.style` (`material3-compose`); class visibility (`kotlin`)                                    |
| `table`                                                         | Table: `linhas` (`notas`); Properties and Functions (`kotlin`); `action.parameters` (`sdui.json`)                         |
| `ref` and `accepts`                                             | `outer` and **Mapped type** (`kotlin`); `input.data` with `free` (`sdui.json`)                                            |
| Tags (`tags`) and `rowLabel`                                    | Properties with `data-field` and `kotlin-property` (`kotlin`); `class.attributes` (`data-model.json`)                     |
| `suggestions`                                                   | **Type** column of Properties (`kotlin`); icon fields (`material3-compose`)                                               |
| `linkedRef`                                                     | **Type** columns of Properties and Supertypes (`kotlin`); `examples/suggestions-kotlin.zip` shows the use                 |
| Relations: `allowedChildren` and `requiresOwner`                | `button` and `action` (`sdui.json`)                                                                                       |
| References between types                                        | **Declared in** and **Supertypes** (`kotlin`); `input.data` points to the Data model (`sdui.json` with `data-model.json`) |
| `platforms` and `repo` (`url`, `urlTemplate`, `ref`)            | `compose` pinned to a commit (`material3-compose`); `android`, `ios` and `bff` (`sdui.json`)                              |
| `code`: `symbol`, `path`, `params`, `values`, `notes`           | All types (`material3-compose`); `button` and `input` on three platforms (`sdui.json`)                                    |
| `variants` in `code`                                            | `button.style` and 25 other types (`material3-compose`); the variants table in the Catalog                                |
| `containers` (ready-made sizes)                                 | Phone, Large phone, Tablet and Desktop (`material3-compose`); `background` on Phone (`sdui-backend`)                      |
| `fonts`                                                         | Roboto 400 and 500 as `.woff2` (`material3-compose`)                                                                      |
| Floating type (`floating`)                                      | Note and Table (`notas`); Event (`analytics`)                                                                             |
| `appliesTo`                                                     | Transition, arrow only (`analytics`); Endpoint, marking only (`sdui-backend`)                                             |
| `component`, `doc` and `examples` (library package)             | All the folders in `libraries/` and `analytics`                                                                           |
| `origins`, `sources` and a screen example of an external system | `sdui-backend`                                                                                                            |
| `origins[].kind: "measured"` (measured layout)                  | `measured`                                                                                                                |
| `migrations`                                                    | `sdui-backend`; `sdui.json` and `roles-migration.json` (role steps)                                                       |
| `formatVersion` 1                                               | `data-model.json`                                                                                                         |
| `formatVersion` 4 and 5                                         | `sdui-backend` (4); `sdui.json` (5)                                                                                       |
| `formatVersion` 6 to 9                                          | `notas` and `analytics` (7); `kotlin` (8); `material3-compose` (9)                                                        |
| `formatVersion` 2 and 3                                         | No example of its own: the app accepts them, and a specialization 1 is a 2 without platforms                              |

### Component

| Feature                                         | Where to see it                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frame` and `text`                              | All components                                                                                                                                    |
| `rect`                                          | Divider and Checkbox (`material3-compose`); the class card (`kotlin`)                                                                             |
| `ellipse`                                       | Switch, Radio button, Slider and Progress indicator (`material3-compose`)                                                                         |
| `path`                                          | Icons of the Button, the Checkbox, the Chip and others (`material3-compose`)                                                                      |
| `image`                                         | Image, Card, List item and Carousel (`material3-compose`)                                                                                         |
| `slot`                                          | Box, Column, Row, Scaffold and others (`material3-compose`)                                                                                       |
| `repeat`                                        | Table (`notas`); Properties (`kotlin`); Event (`analytics`); Navigation bar, Tabs and Carousel (`material3-compose`)                              |
| Layout `row`, `column` and `none`               | `row` and `column` in all libraries; `none` in the Box (`material3-compose`)                                                                      |
| `gap`, `padding` (number, pair and four sides)  | Number in all; pair and four sides (`material3-compose`)                                                                                          |
| `align` and `justify`                           | `align` `start`, `center` and `stretch`; `justify` `start`, `center`, `end` and `space-between` (`material3-compose`: Tabs, Alert dialog, Slider) |
| Node size: px, `fill`, `hug` and `%`            | px, `fill` and `hug` in all; `%` in the Slider and the Short navigation bar (`material3-compose`)                                                 |
| `size`, `minSize` and `sizing`                  | All components; official `minSize` only in the Button, FAB, Text field and others (`material3-compose`)                                           |
| Anchors (`anchors`)                             | `left`, `right`, `top`, `bottom`, `centerX` and `centerY` (`material3-compose`: FAB, Pull to refresh)                                             |
| Screen anchors and scrim                        | `sdui-scrim` and the roots with `anchor` and `margin` (`sdui-backend`)                                                                            |
| Expressions `$field`, `$if`, `$switch`          | `kotlin` and `material3-compose`; `$field` with `default` in both                                                                                 |
| `$concat`                                       | Class header (`kotlin`); Box, Column and Image (`material3-compose`)                                                                              |
| Conditions `$has`, `$eq`, `$not`, `$and`, `$or` | `$has` in `notas`; all in `material3-compose`                                                                                                     |
| `visible`, `opacity`, `clip`                    | `visible` in `notas`; `opacity` in `kotlin` and Surface; `clip` in the Box (`material3-compose`)                                                  |
| `fill`, gradient, `stroke`, `shadow`            | Color in all; gradient in the Carousel; `stroke` with `dash` and `align`; `shadow` in `notas` (`material3-compose`)                               |
| `cornerRadius`                                  | Number in all; four corners (`material3-compose`)                                                                                                 |
| Text font: `size`, `weight`, `italic`           | All; `italic` in `kotlin` and Text (`material3-compose`)                                                                                          |
| `preview`                                       | All; in table form in `notas`, `kotlin` and `analytics`                                                                                           |

For a feature this table does not mention, run the coverage test (`npx vitest run tests/examples/featureCoverage.test.ts`): it says which example covers each key and each value.
