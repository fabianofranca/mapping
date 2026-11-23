# Named values v2 in the specialization — [Não lançado] (épico `epic/named-values`, PR #0, MCP 0.59.0, schema v24, specialization formatVersion 23)

## Adicionado

- Specialization `formatVersion` 23: `tokens` become a real value system. Aliases (`{ "$token": "<name>" }`, with `alpha`/`over` on a color), composite values (a plain object of named fields, read as `name.field`), mode axes (`tokens.axes` and the `{ "$axis": … }` per-axis value; `modes` stays valid), metadata (the `$value` wrapper with `$description`, `$group` and `$notices`) and the `{ "$tokens": "<group>" }` item in `suggestions`, which expands to the text values of a group when the specialization is parsed. Versions 1 to 22 stay accepted unchanged.
- `examples/libraries/analytics` (version 4, `formatVersion` 23): the event names as tokens in the `events` group, one deprecated name, and the `event.name` and `transition.event` fields suggesting them.

## Alterado

- Version numbers: the stage plan (#1900) was written when `main` was at specialization `formatVersion` 18, schema v20 and proposal `formatVersion` 9; `main` moved on, so the stage takes the next free numbers: specialization **23** (plan: 19), project schema **v24** (plan: v22) and proposal `formatVersion` **12** (plan: 11). Map: 19→23, v22→v24, 11→12.
- Teto do `dist/index.html` subiu 32 KiB, de 2539520 para 2572288, pela regra do orçamento; acima dos limites, `bug` para o dono revisar
