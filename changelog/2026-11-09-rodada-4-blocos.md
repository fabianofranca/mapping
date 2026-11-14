# Full round in 5 blocks — 2026-11-09 (epic `epic/rodada-4-blocos`, PR #1145, MCP 0.28.10, schema v18)

## Adicionado

- `Shift+1` fits everything (the **Fit all** button shows the shortcut and Help lists it), as the pair of `Shift+2` (**Fit selection**), by the physical key, and never with focus in a text field.

## Alterado

- The tester's full round runs in 5 blocks (before, 3), with a 200 thousand character limit on each block's generated guide, checked by a test; the visual pass is in block 4.
- Cloud tester: the `ponto` helper of `cloud.mjs` converts a point in container pixels into a screen point (reading the canvas's `data-viewport`), and the gesture steps of R12, R22 and R23 now use it instead of calibrating by capture.

## Corrigido

- Round test guide: `round-guide.mjs` cuts from the introduction of section 8 and from appendix A the parts that only scripts not requested use, and accepts a step range (`R6.3-R6.7`); `mark`/`tempos` of `cloud.mjs` find the round's support folder by themselves when `APOIO` is not exported.
- Incomplete: an annotation on a layer that does not exist also appears in the list (before, the counter counted it and the list omitted it).
- Details and Incomplete at 900×720: the reasons column of Incomplete gets more width and no longer breaks the word in the middle.
- Components: a literal text run made only of spaces (the gap between a bold word and a chip, for example) no longer vanishes from the layout; the empty or spaces-only field still falls back to the default.
- Components: **Arrange** on a Row with chips (the "Filtros" Row of the example) no longer writes width 1 to the chips: a `hug` component whose content is a frame stretched by anchors measures the content again.
- Canvas, perspectives: the "Came from …" badge of a small root sits 10 px below the corner (clear of the selection handles) and, if that would fall on another root or its name, goes to the side.
