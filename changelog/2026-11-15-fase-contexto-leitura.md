# Phase sessions read less before the work — 2026-11-15 (épico `epic/fase-contexto-leitura`, PR #2000, MCP unchanged, schema v20)

## Alterado

- **The phase message reads the stage issue through one subagent (for whoever drives the flow, #1996):** item 1 of "For the phase session" in `docs/FLOW.md` has the phase read `CLAUDE.md`, `docs/PROCESS.md` and its own sub-issue with the comments; the stage issue comes through one subagent that returns only the sections and numbered decisions the sub-issue cites plus the stage's "out of scope" section, so the main thread never loads the whole stage issue or its comments.
- **New reading rule under item 3 (for whoever drives the flow, #1996):** a file or doc over ~300 lines is read by range (`grep -n` and `sed -n` or `Read` with `offset`/`limit`), and a `grep` over docs or several files ends with `| head -40`.
- **The handoff lists what was already read (for whoever drives the flow, #1996):** step 3 of "Phase context ceiling" adds the files and sections already read, one line each with what matters in them, and the coordinator's resume line gains a clause not to reread what the handoff gives as read, so a successor does not pay the same reading again.
