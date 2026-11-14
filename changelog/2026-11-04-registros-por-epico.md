# Records per epic — 2026-11-04 (épico `epic/registros-por-epico`, PR #500, MCP 0.14.0, schema v13)

## Alterado

- **Wide tables of the test guide (`docs/TESTING.md`) and of the DS record (`docs/DESIGN-SYSTEM.md`) without alignment.** Adding or changing a step changes only its row, instead of realigning the whole table; `docs/TESTING.md` shrinks by about 43%.
- **The changelog becomes one file per epic in `changelog/`, and the root `CHANGELOG.md` goes away.** Two epics open at the same time no longer conflict in the changelog; `ls changelog/` lists the entries in chronological order and the first line of each file carries the epic, the PR, the MCP and the schema. The rule is in `changelog/README.md`.
- **The design system record becomes one file per epic in `docs/design-system/`** (`<name>.md` during the epic, `YYYY-MM-DD-<name>.md` after closing). The sync history and the per-epic pending items of `docs/DESIGN-SYSTEM.md` migrated there, without losing text; `docs/DESIGN-SYSTEM.md` keeps the map, the rules and the general pending items.
