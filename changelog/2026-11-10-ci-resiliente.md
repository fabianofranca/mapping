# Resilient CI — 2026-11-10 (épico `epic/ci-resiliente`, PR #1381, MCP 0.28.15 unchanged, schema v18)

## Adicionado

- `scripts/ci/distBudget.mjs raise`: checks the conditions for the automatic raising of the `dist/index.html` ceiling (excess of up to 16 KiB, an epic with up to 32 KiB more than `main`, raises since the owner's last review up to 64 KiB) and, with `--write`, swaps the `INDEX_HTML_MAX_BYTES` in `ci.yml` and appends the sentence to the comment; outside the limits it prints "chama o dono: <reason>" and does not write.

## Alterado

- Phase (`docs/FLOW.md`, "Para a sessão da fase"): whoever waits for CI never ends the turn without an 8 min `send_later`; the second rerun (after the automatic one from `ci-rerun.yml`) belongs to the phase, and after 2 reruns without success it notifies the coordinator ("CI travado"). With the margin notice below 2 KiB, it tries to slim down before giving up; with the ceiling exceeded, it applies the raise rule of `distBudget.mjs` or sends the numbers to the coordinator.
- Queue (`implementar-fila`): a child with no notice for more than 30 min (`LATE_MINUTES = 30` in `painel.py`; it was 60) that is `review_ready` or `idle` first gets a `send_message` and only at the next check is the session recreated.
- Queue: the coordinator does not rerun CI (the rerun belongs to `ci-rerun.yml` and the phase); on the epic's PR with stuck CI or on receiving "CI travado", it calls the owner. The `dist/index.html` ceiling raises itself within the limits, with the record in the changelog and in the "Orçamento do dist/index.html" `roadmap`.
- `detalhar-backlog`: a phase that touches the flow's infrastructure or something critical (the queue and detailing skills, `painel.py`, rules of `docs/FLOW.md` and `docs/PROCESS.md`, workflows, release, `formatVersion`, writing of `mapping.json`, CSP) is detailed as high with `/code-review high`, and whoever adds a decision to a stage in progress reclassifies the unfinished phases.
- `implementar-fila`, "Fechamento": an epic that touches any of those triggers runs `/code-review high` on the whole diff (base `main`) before the merge, and confirmed defects are fixed in the epic itself.
- `tests/tooling/ciConfig.test.ts`: the `dist/index.html` budget is a multiple of 16 KiB on a single line, without the fixed number.
- `implementar-fila`: a new skill on `main` only becomes a session handoff if it changes more than 60 lines or "Regras desta fila" (it was 30 lines or any rule section); the rest is a reread of the whole `SKILL.md`. The schema version is chosen when creating the epic, reading `origin/main`, like the MCP one.
- `scripts/ci/distBudget.mjs`: rejects an unknown flag and a missing value (before, it swallowed the next argument) and writes a ceiling that is not a multiple of 1 KiB with a decimal (`1.904,5 KiB`), instead of a broken number. `implementar-fila`: the `--size` of the raise comes from a build of the head after bringing in `main`.
