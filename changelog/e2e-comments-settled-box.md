# The e2e comments test waits for the settled selection box — [Não lançado] (MCP unchanged, schema v23 unchanged)

## Corrigido

- The e2e test "with no identity…" of `tests/e2e/comments.spec.ts` waits for the frame that publishes the selection box, so a tool window that resizes the canvas no longer makes it click next to the marking (flaky in CI on 2026-11-20, failing locally) (#2330).
