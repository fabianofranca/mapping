# Tester runs on Haiku medium by default — [Não lançado] (épico `epic/tester-haiku-default`, PR #0, MCP unchanged, schema v21 unchanged)

## Alterado

- The queue creates every tester on Haiku (`claude-haiku-5-5`) at the Tester column's effort (medium) by default, with no canary: canary C closed with the verdict `pode promover` (US$ 0.099 against 0.142 per tested step, 12 of 12 sessions, zero rework) and the owner promoted it (#2354). Canary C is not added again, and a panel that still lists it gets `canario end C motivo="promoted"`; a `create_session` that refuses Haiku creates the tester on Sonnet medium.
- `docs/PROCESS.md` says the Tester column of the stage table defaults to Haiku medium; phases stay on Sonnet (canary B was not promoted).
