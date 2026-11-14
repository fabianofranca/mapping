# CI stuck in the queue: close and reopen the PR with the owner's "yes" — 2026-11-11 (épico `epic/ci-preso-na-fila`, PR #1674, MCP unchanged, schema v18)

## Corrigido

- Automated flow: the CI run of a PR that stays `queued` with no jobs at all (`ci-rerun.yml` does not see it, because it only acts on a run that has finished) is no longer read as "the CI is still running" forever. The criterion is measured by `node scripts/ci/ciRerun.mjs queued` (most recent `ci.yml` run on the PR's commit, `queued`, without jobs, for more than 15 min), and not by the impression of whoever reads the CI.
- The phase notifies the coordinator ("CI preso na fila: <link>") and keeps waiting, without closing, reopening or rerunning. The coordinator asks the owner, in the queue chat, "Fecho e reabro o PR #<n> para criar uma execução nova do CI?"; with the "yes" it closes and reopens the PR once per commit and goes back to reading the CI. If the new run also gets stuck, it is GitHub instability: the owner is notified and nothing is repeated. The empty commit remains forbidden, and "the coordinator does not run the CI again" holds outside this case.
- `docs/FLOW.md` ("Para a sessão da fase", item 6, and "CI e preview") and the `implementar-fila` skill ("Por etapa") describe the case; the prohibition of "closing and reopening a PR to run the CI" gains the exception of the run stuck in the queue.
