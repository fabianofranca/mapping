# Canvas performance — 2026-11-10 (épico `epic/canvas-desempenho`, PR #1436, MCP 0.30.0, schema v18)

## Alterado

- Faster opening with a large project: the parts of each marking (halo, badge, alert, name) and the component drawings are only created when they appear on screen.

- From afar, the short arrow (less than 24 px on screen) appears with the stroke only, without halo, head or label, and the one linking two invisible markings does not appear; the selected arrow and those linked to a selected marking or under the mouse stay whole. An arrow outside the visible area is also no longer drawn. Zoomed in, nothing changes.

- Large project (2,000 markings, 1,000 arrows, Chromium): editing takes ~10 ms, pan ~21 ms and zoom ~31 ms per frame; opening in Fit all takes ~128 ms. Numbers and targets in `docs/ARCHITECTURE.md`, "Performance".

## Corrigido

- Opening and closing large projects several times in the same tab left canvas shapes in memory and made each opening slower.
- The column of the reference field (e.g. `item`) of the target tables no longer shrinks to 40 px with narrow Details (900 px): the target label fits on one line, without a horizontal bar (the column gets a floor and the table's text fields give up a little).
- Script R12.30 expected `data-arrows` below 1000 at the large project's minimum zoom, but in it every arrow links at least one visible marking; the guide now describes what the app does.
- The tooling test of the panel's slots (`queueSlots`) gained time slack and no longer blows up on timeout in CI under load.
