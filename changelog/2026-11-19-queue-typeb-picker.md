# Supervisor type B requests through the picker — 2026-11-19 (épico `epic/queue-typeb-picker`, PR #2275, MCP unchanged, schema v21)

## Alterado

- **The coordinator asks the supervisor's type B requests through the question picker (for whoever drives the flow, #2273):** `AskUserQuestion` with `Aprovar SUP-<k>` and `Negar SUP-<k>` replaces the `PushNotification` and the chat line of "Supervisor requests" in `.claude/skills/implementar-fila/SKILL.md`, because the push from queue sessions does not reach the owner's phone and the picker does. Every other in-run question (merge, stuck CI, product decision, hold, incomplete ficha, CI-cycle direction) stays by text. `.claude/skills/supervisionar-fila/SKILL.md` says the owner answers type B in the picker of the queue chat.
