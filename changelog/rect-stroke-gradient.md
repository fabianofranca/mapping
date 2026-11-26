# A rect stroke gradient follows the inset — [Não lançado] (épico `epic/rect-stroke-gradient`, PR #2894, MCP unchanged, schema v23 unchanged)

## Corrigido

- A linear gradient on the stroke of a frame or rectangle with an `inside` or `outside` stroke, or an `offset`, is no longer shifted by the inset (the component format has no gradient stroke yet, so no library drew it) (#2646).
