# "Call the owner" in the delivery flow — 2026-11-13 (épico `epic/fluxo-chama-o-dono`, PR #1871, MCP unchanged, schema v19)

## Alterado

- For whoever drives the flow: `docs/FLOW.md` defines "Call the owner" once, in the "Orchestrator — step by step" (`PushNotification` with the reason and the link, and the question in the orchestrator's chat through `AskUserQuestion`; the authorization of item 8 stays with the phase, and in the queue rules 1 and 2 of `implementar-fila` apply). Every other "calls the owner" in the file cites that paragraph, and the phase or the tester that does not warn first follows the `implementar-fila` ladder (a resume `send_message`, recreate the session once), instead of calling the owner right away.
- The "Known limitations" of the code reviewer stop repeating the commands of item 6 of the message, and the rule of the `code-review` issues leaves the step list of "## 1. Candidates" of the `detalhar-backlog` skill. The test `tests/tooling/flowOwnerCall.test.ts` checks the text.
