# Retest on Haiku and canary C for the tester — [Não lançado] (épico `epic/queue-canary-c`, PR #0, MCP unchanged, schema v20)

## Alterado

- **The queue creates every retest on Haiku (for whoever drives the flow, #2165):** canary A (retest in Haiku medium, #1889) ended with the verdict `pode promover` (owner's decision, 2026-11-19), so `implementar-fila` now creates each retest with `claude-haiku-5-5` at the Tester column's effort, with no `canario usar reteste`. A `create_session` that refuses Haiku falls back to Sonnet medium and the `log` records the case.

## Adicionado

- **Canary C tries the tester on Haiku (for whoever drives the flow, #2165):** the coordinator adds `canario add C papel=testador … n=12 volta=2` when the panel has none, and runs `canario usar testador` right before each tester's `create_session`; with `canario=C` the tester is created on Haiku and registered with `canario=C`. A `create_session` that refuses Haiku ends the canary.
