# Conversation state color — 2026-11-09 (épico `epic/cor-do-estado`, PR #1304, MCP 0.28.12, schema v18)

## Alterado

- The conversation state badge has the same color as the canvas pin in the **Comments** window and in the **Conversations** section of Details: orange for "waiting for you", cyan for "waiting for agent" and gray for "resolved", in the light and dark themes, with text above 4.5:1 over the badge background.

## Corrigido

- Script R22.6 (`docs/TESTING.md`): the **Comment** click goes on an empty point that does not depend on zoom, and the step says that **Comment** on an item anchors the conversation to it, with no dashed pin and no `draft`.
- The options of the **Drawing mode** selector (**Settings** and the container's **Details**) appear as "Claro" and "Escuro" in pt-BR (and "Light" and "Dark" in en-US), instead of `light` and `dark`; the value saved in `mapping.json` stays the same.
