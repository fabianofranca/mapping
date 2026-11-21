# `painel.py` prints `começar agora:` after a write — [Não lançado] (épico `epic/apply-starts-now`, PR #PRNUM, MCP unchanged, schema v22 unchanged)

## Corrigido

- For whoever runs the queue: `painel.py apply`, a lone `row` that writes `stage` or `status`, and `merged` now print the `começar agora:` line of `show` (computed on the state just written, only when it is not `nenhuma`). A stage that becomes eligible for an early start (`#E (cedo: #S)`) is listed by the same command that made it eligible, so the coordinator no longer loses the cycle by forgetting a second `show` (#2480, regression of #2427). The "Early start in the same cycle" paragraph of `implementar-fila` says it. The `toca` comparison, the slots, the exclusive stages and the draining do not change.
