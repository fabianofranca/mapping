# Queue without an idle slot — 2026-11-10 (epic `epic/fila-sem-vaga-ociosa`, PR #1449, MCP 0.30.0 unchanged, schema v18)

## Adicionado

- `painel.py` computes the "Vagas k/N" note on every write (`meta.vagas`), with the reason for each `ready` that did not start (`hold`, `dep`, `arquivo`, `schema`, `começa`, `vagas cheias`), and `show` says which stages start now (`vagas:` and `começar agora:`).
- New commands: `start <folder> --paralelo N`, `merged <folder> '#N'` (dependency already on `main`) and `context <folder> <pct>` (coordinator context; `show` warns above 60%). The queue row gains the `hold` field.
- The "Toca em:" comparison is by script in `docs/TESTING.md` (`docs/TESTING.md#R12`); the block table of `docs/TESTING-NUVEM.md#blocos`, `mcp/version.ts`, `changelog/` and `docs/design-system/` do not count as a conflict.
- The panel page shows the note in the subtitle and the "Por que há vaga livre" card.

## Alterado

- The `implementar-fila` skill uses the slots note: it writes `start --paralelo N` (also on resume), reads `vagas:` and `começar agora:` from `show` and starts each listed stage in the same cycle. "Paralelo" points to `painel.py` instead of repeating the calculation.
- The reserve check starts with the context (`painel.py context`), and above 60% the coordination is handed over right then, without waiting for the end of a stage or phase. The "at every child notice" reading is gone.
- The stage sheet asks for the state of each dependency (`:main`/`:aberta`) and the "Toca em:" by script (`docs/TESTING.md#R12`, `docs/TESTING-NUVEM.md#blocos`); `detalhar-backlog` and `docs/PROCESS.md` write and compare the same way.
- An owner's note that describes a state does not hold a `ready` with its dependencies on `main`: it starts and the coordinator asks ("Proceed"/"Hold"). Fixed restriction, pause and resume go through `hold`.

## Corrigido

- The "Toca em:" of `painel.py` matches a glob (`src/i18n/*`, `src/model/*.ts`) and a folder without a trailing slash with what is underneath; before, they were treated as a literal file and the slot started in conflict.
- A parenthesized annotation after the path (`src/store/session.ts (novo método)`) is discarded instead of sticking to the name.
- Different anchors only separate citations of `docs/TESTING.md` (scripts); in any other file (`docs/ARCHITECTURE.md#X` against `#Y`) they count as the whole file.
- An empty item in the dependency (`dep=#12:main,`) no longer holds the stage forever, and `hold` is cleared when the stage leaves `aguardando`.
- The panel page reads `meta.vagasItens` (one item per piece of the note), so a `hold` with " · " in its text does not split the subtitle; `meta.vagas` is still written, and the `split` stays only for an old panel.
