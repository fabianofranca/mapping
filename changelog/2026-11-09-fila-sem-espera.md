# Queue without waiting — 2026-11-09 (épico `epic/fila-sem-espera`, PR #1366, MCP 0.28.15 unchanged, schema v18)

## Alterado

- Queue (`implementar-fila`): the MCP version is provisional when the epic opens and chosen at closing (the next free one on `origin/main`); only the `em andamento` stage takes a `paralelo` slot; a fix that depends on code from another epic becomes a `ready` `bug` with `Depende de`, which the queue itself runs; the "Fim" step checks its own `bug`s; the issues for what was left for later and the closing comment are produced by a subagent during CI (PR #1366).
- New skill on `main` during the queue: a big one (more than 30 lines or rule sections) becomes a session handoff, after checking the lineage; a small one becomes a reread of the whole `SKILL.md` with proof in the panel's `log`.
- `detalhar-backlog`: requires `Depende de` on the `ready` and `in-progress` issues that touch the same files.
- Queue panel: no more "Bugs e roadmaps por etapa" table, `issues` dataset and `painel.py issue` subcommand; in their place, the "Issues criadas pela fila" card with the link to the `Origem: etapa` search.
- `implementar-fila`: with the MCP version changed at closing, the rc of the old number is left loose and the new number gets an rc through the MCP pre-release workflow; without the closing comment id, the Release result goes in a new comment; the "Fim" step stops waiting for the queue's own `bug` that depends on another stage.
- `detalhar-backlog`: does not add `Depende de` when the dependency (direct or transitive) would close a cycle.
- `docs/FLOW.md` and `docs/PROCESS.md`: the session handoff is by context or by a big new skill, and the trigger of the "Versão do MCP" step goes back to saying "what goes in the release".
