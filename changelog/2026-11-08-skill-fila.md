# Queue implementation skill — 2026-11-08 (epic `epic/skill-fila`, PR #979, MCP 0.28.3, schema v18)

## Adicionado

- Claude Code skill `/implementar-fila` (`.claude/skills/implementar-fila/`), for the delivery flow. A coordinator implements the `ready` issues in sequence, in the order of "Depende de", severity and impact, with up to 2 epics in parallel when the files they touch are disjoint. It creates the phase and tester sessions, runs fixes until the ❌ are zero, does the closing, asks the owner for the merge of each epic into `main` (or merges by itself with `mesclar=auto` written by the owner in the call) and keeps the "Fila de desenvolvimento" panel updated at every step. When the context fills up, it hands the coordination over to a new session.

## Alterado

- `/detalhar-backlog`: the MCP version of each stage comes out as the type of the bump (minor, patch or no change), and the number is fixed only when the epic starts, so stages detailed in parallel do not take the same one. The dependency between stages no longer holds back the detailing, only the order of implementation. The children do not write a PR number that does not exist yet, and the coordinator warns when there are children waiting for an answer from the owner.
