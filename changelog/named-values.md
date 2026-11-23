# Named values v2 in the specialization — [Não lançado] (épico `epic/named-values`, PR #2748, MCP 0.59.0, schema v24, specialization formatVersion 23)

## Adicionado

- Specialization `formatVersion` 23: `tokens` become a real value system. Aliases (`{ "$token": "<name>" }`, with `alpha`/`over` on a color), composite values (a plain object of named fields, read as `name.field`), mode axes (`tokens.axes` and the `{ "$axis": … }` per-axis value; `modes` stays valid), metadata (the `$value` wrapper with `$description`, `$group` and `$notices`) and the `{ "$tokens": "<group>" }` item in `suggestions`, which expands to the text values of a group when the specialization is parsed. Versions 1 to 22 stay accepted unchanged.
- `examples/libraries/analytics` (version 4, `formatVersion` 23): the event names as tokens in the `events` group, one deprecated name, and the `event.name` and `transition.event` fields suggesting them.
- Components read the named values in two new ways (component `formatVersion` 4 unchanged, specialization `formatVersion` 23): a field by dot, `{ "$token": "title.size" }`, wherever a scalar `$token` applies (including `alpha`, `over`, `let` and `provide`), and the whole composite in `font` and in a shadow, `"font": { "$token": "title", "align": "center" }` (the explicit keys next to `$token` win; in a shadow with `$token`, `color` is no longer required). `validate_library` reports, with the node's path, a whole composite where a scalar goes (`the token "title" is a composite; read one field (title.<field>)`), `the token "x" has no field "y"`, `the token "x" is not a composite` and `field "<f>" of the token "x" is not a key of font` (or `of shadow`), and warns, never errors, when a component reads a deprecated or removed token (`the token "x" is deprecated: <message>`). The drawing proof runs one pass per entry of each axis of `tokens.axes` (messages cite `mode light` or `theme=dark`). The viewer's `drawingMode` option takes a string (that entry on every axis that declares it) or a map from axis to entry.

## Alterado

- Version numbers: the stage plan (#1900) was written when `main` was at specialization `formatVersion` 18, schema v20 and proposal `formatVersion` 9; `main` moved on, so the stage takes the next free numbers: specialization **23** (plan: 19), project schema **v24** (plan: v22) and proposal `formatVersion` **12** (plan: 11). Map: 19→23, v22→v24, 11→12.
- The `dist/index.html` ceiling rose 32 KiB, from 2539520 to 2572288, by the budget rule; above the limits, `bug` #2747 for the owner to review
- The `dist/index.html` ceiling rose 16 KiB, from 2572288 to 2588672, by the budget rule; above the limits, `bug` #2753 for the owner to review

## Corrigido

- A library with `tokens.axes` and no other tokens was drawn and proved as if it had no tokens.
- A component that read a whole composite token where a scalar goes validated with no error; `validate_library` now refuses it.
