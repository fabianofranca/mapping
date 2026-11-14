# Green CI read correctly and coordinator with an alarm clock — 2026-11-10 (épico `epic/ci-verde-e-espera`, PR #1484, MCP 0.30.0 unchanged, schema v18)

## Alterado

- Editing a PR (title, body or base) no longer runs CI, and the fully `skipped` run of the same commit no longer appears. For whoever runs the flow: you do not change the base of an open PR; with the wrong base, open a new PR with the right base (the `opened` runs CI) and close the old one, without reopening and without an empty commit.
- The green CI rule lives in a single text, the **Leitura do CI** of item 6 of "Para a sessão da fase" (`docs/FLOW.md`): `check`, `e2e` and, on the epic PR, `epic` at `success`, nothing `queued` or `in_progress`, no failure, only the CI workflow, only the current commit; the Merge subagent points to it. The phase and the fix merge their own PR into the epic, and the coordinator gets a `send_later` per PR that it waits for and now records in the `log`, in the same turn, the notice that arrives in the middle of another cycle. The summaries in `FLOW.md` (`Depende de`, `paralelo=N` and the hourly check) were corrected.
- The queue panel stores the PR whose CI the coordinator is waiting for (`ciWait`, `ciWaitAt`): `show` gains the `CI esperando o coordenador:` line, the page shows `<step> · CI: PR #p`, and the hourly check verifies each one, so a lost `send_later` is found within ~60 min.

## Corrigido

- In the queue panel, `row ... ciWait=<PR>` without `ciWaitAt` writes the current time (before, it inherited that of the previous PR or was left blank), and `ended=` clears a forgotten `ciWait`, like `concluída` and `falhou`.
- The CI reading looks only at the most recent run of each job: a `cancelled` left by `cancel-in-progress` on the same commit does not make a green PR look stuck; `ciWait` is also cleared on moving to `esperando dono`, and the pending `send_later` of an already merged PR just ends the turn.
