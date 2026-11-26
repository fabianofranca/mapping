# Where the queue's context and cost go — 2026-11-26 (épico `epic/queue-context-cost`, PR #2886, MCP unchanged, schema v24)

MCP unchanged.

## Alterado

- The CI is read in one line by `scripts/ci/ciStatus.mjs`: the phase and the fast track no longer load the check runs into their context.
- A phase session hands over above 300 thousand of context even with its last PR open, and starts no new work after the hook notice.
- The tester's main session is held to the batch subagents by the context hook, which refuses the steps it would run itself.
- `painel.py outliers` puts the tester apart: the cost per planned phase leaves it out, and its cost per tested step is listed on its own (`by phase`, `by step` or `by phase and step`).
- The Testador section of a stage carries `Passos: <n>` (the round's step count) and ranges of long scripts (above 40 steps), with a one-line reason for a long script that comes in whole.
