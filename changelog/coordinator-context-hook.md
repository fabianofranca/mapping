# Context hook for the queue coordinator — [Não lançado] (MCP unchanged, schema v21)

## Alterado

- **The context hook also warns the queue coordinator, from 320 thousand (for whoever drives the flow, #2228):** `scripts/ci/contextGuard.mjs` recognizes the `/implementar-fila` prompt (`MARCADOR_COORDENADOR`) and, above `GATILHO_COORDENADOR` (320 thousand, repeating every +10 thousand), injects a one-line notice that counts as "above 35%" of "Session switch" in `.claude/skills/implementar-fila/SKILL.md`. The phase trigger (270 thousand) and its notice stay as they were; the tester, `/supervisionar-fila` and `/via-rapida` stay silent. The hook state gains `papel`.
- **The coordinator's switch no longer rereads a changed `SKILL.md` (for whoever drives the flow, #2228):** with the context above 35% or the hook's notice, "Session switch" › "New skill on `main`" skips the fetch, the pull and the reread, and the successor reads the new skill.
