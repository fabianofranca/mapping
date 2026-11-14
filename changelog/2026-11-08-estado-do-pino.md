# Pin state — 2026-11-08 (épico `epic/estado-do-pino`, PR #924, MCP 0.28.2, schema v18)

## Alterado

- The conversation pin on the canvas now shows the state also through a glyph to the left of the label, and not only through color: a person (waiting for you), a four-point spark (waiting for the agent) and a check mark (resolved). A pin with several conversations shows the glyph of the most urgent state; the draft pin (dashed) has no glyph. Label, selected ring, unread dot and dashes stay as before, and the click target grows with the glyph.
- The state badges of the **Comments** window and of the **Conversations** section of Details show the same glyph before the text.
- The `.canvas-host` publishes `data-pin-states` (the states of the visible pins, in drawing order), next to `data-pins`, so the pins can be checked without a screenshot.

## Corrigido

- The three pin states can be told apart without relying on color (accessibility, WCAG 1.4.1): the backgrounds have almost the same luminosity, and now the glyph tells the state apart in shades of gray.
- The R22 script of `docs/TESTING.md` now matches the app: Esc disarms **Comment** but the pins stay on, the active option of `@Entr` is already the **Entrar** marking, and the steps check `data-pin-states` (#737).
