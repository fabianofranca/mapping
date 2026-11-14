# Long commands, handover and fast-track label — [Não lançado] (épico `epic/phase-long-commands`, MCP unchanged, schema v20)

## Alterado

- **A long local command in the phase session runs only with `run_in_background` (for whoever drives the flow, #1922):** in item 5 of "For the phase session" of `docs/FLOW.md`, gates, `npm test`, the full suite and the build never go through `nohup`, `&`, `setsid` or `disown`, which the harness does not track (no wake-up, and the turn ends for good); woken without the command's notice, the phase runs it again.
- **The context handover exemption by an open PR holds only for the phase's last PR (for whoever drives the flow, #1922):** a phase that opens several PRs in sequence hands over between a merged PR and the next one when above the 270k trigger. In `implementar-fila`, the hourly check sends a phase above 300k with no switch request and without its last PR open a `send_message` to hand over (the `5 de 5` session does not receive it).
- **Label `via-rapida` (for whoever drives the flow, #1922):** marks an issue planned for the fast track; `detalhar-backlog` skips it, and the `via-rapida` skill removes it when it starts and adds it when a conflict holds the start. `docs/PROCESS.md` ("Workflow") describes it.
- **Spelling rule in `CLAUDE.md` (for whoever writes code and docs, #1922):** American English (`color`, `behavior`, `center`, `canceled`); values of external APIs and formats stay as they come.
