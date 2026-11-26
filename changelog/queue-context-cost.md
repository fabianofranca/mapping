# Where the queue's context and cost go — [Não lançado] (épico `epic/queue-context-cost`, PR #0, MCP unchanged, schema v24)

MCP unchanged.

## Alterado

- The CI is read in one line by `scripts/ci/ciStatus.mjs`: the phase and the fast track no longer load the check runs into their context.
- A phase session hands over above 300 thousand of context even with its last PR open, and starts no new work after the hook notice.
- The tester's main session is held to the batch subagents by the context hook, which refuses the steps it would run itself.
- `painel.py outliers` puts the tester apart and measures its cost per tested step.
- The Testador section of a stage carries `Passos:` (the round's step count) and ranges of long scripts.
