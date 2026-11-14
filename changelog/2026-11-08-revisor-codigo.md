# Code reviewer — 2026-11-08 (epic `epic/revisor-codigo`, PR #985, MCP 0.28.4, schema v18)

## Adicionado

- Automatic code review, for the delivery flow: every epic merged into `main` is reviewed overnight, and the findings become a round issue and one `bug` issue per confirmed high- or medium-severity defect, all with the new `code-review` label. The starting point is the base CR of 2026-11-08, which reviewed the whole `main`. Rules in `CLAUDE.md` ("Revisão de código") and messages in `docs/FLOW.md`.

## Alterado

- `/detalhar-backlog`: the reviewer's issues (`code-review`) enter the detailing without repeating a finding. The round item that already has its `bug` issue stays with it, and the round can be split by area among stages.
