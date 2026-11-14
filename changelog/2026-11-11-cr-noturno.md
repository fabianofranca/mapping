# Nightly CR without repetition — 2026-11-11 (épico `epic/cr-noturno`, PR #1597, MCP 0.34.2 unchanged, schema v18)

## Alterado

- The flow docs (`docs/PROCESS.md` and `docs/FLOW.md`, "Revisão de código") now say what the "CR por épico" schedule already does: the nightly review is only for the epic without a `/code-review high` of the whole epic at closing, decided by `riskTriggers.mjs` (`gatilho:` skips, `nenhum gatilho` enters). The "Como roda" brings the schedule and coordinator ids and how to recreate the coordinator, the "Limitações conhecidas" record the epic closed outside the queue, and the reviewer's message becomes the literal copy of the one stored in the schedule (markers `{nome}`, `{pr}` and `{sha}`). A test in `tests/tooling/` checks the repository side.

## Corrigido

- The nightly CR list no longer stops at the 100 most recent PRs: the schedule lists the epics by the history of `main` since the base CR (with the clone deepened by `--shallow-since`), the six merges before `riskTriggers.mjs` are decided by the closing result (#1381, #1343, #1418 and #1417 skipped, #1373 and #1419 reviewed), and the search for repeated rounds finds the renamed issue by the marker `cr-epic: pr=<n>`. The reviewer also deepens the clone to read the diff of the old merges. The new prompt of the "CR por épico" schedule goes with the PR, and the schedule stays disabled until the owner pastes it and reactivates it.
