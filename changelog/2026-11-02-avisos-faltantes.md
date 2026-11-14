# Missing notices — 2026-11-02 (epic `epic/avisos-faltantes`, PR #333, MCP 0.13.0, schema v13)

## Adicionado

- Releasing a rectangle drag smaller than the 8 px minimum, with the marking tool, now shows the notice "Each side must be at least 8 px." instead of doing nothing. A simple click, Esc and a valid drag still show no notice.

## Alterado

- MCP 0.13.0: `rect-too-small` in `plan_changes` and `propose_changes` now states the received size and the minimum that applied (8 px or the component's `minSize`, whichever is greater) in the `detail`, with a `hint` to increase `width` and `height`; `image-overlap` states the reference of the other container it overlaps, with a `hint` to change `x`/`y`/`scale` or the size, or to move the other container first.
- MCP: the `detail` of model errors is no longer cut off when it has `: ` inside. When moving several containers together, `image-overlap` cites the container that does not move (before, it cited the moved one).
