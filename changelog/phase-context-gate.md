# Phases cannot open their PR above the context trigger — [Não lançado] (épico `epic/phase-context-gate`, PR #0, MCP unchanged, schema v23)

## Alterado

- The context hook (`scripts/ci/contextGuard.mjs`) refuses to open a PR in a phase or fix session above the 270 thousand trigger (`create_pull_request`, `gh pr create` or a POST `gh api …/pulls`), except in session `5 de 5`: the phase hands over and the successor opens the PR. The phase notice also says that the `/code-review` of item 10 and the fixes of its findings are not the PR open.
- The tester gets its own context notice from 250 thousand, repeated every 10 thousand: from then on every remaining batch runs in a subagent and the round goes on, with no step marked "not executed" for context.
