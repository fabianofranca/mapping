# Canvas view for the tester — 2026-11-08 (épico `epic/vista-do-canvas`, PR #1070, MCP 0.28.4 unchanged, schema v18)

## Adicionado

- The `.canvas-host` publishes `data-viewport` (`"x y scale"`: the canvas translation and scale, in CSS px relative to the host's corner) and `data-selection-box` (`"left top width height"`: the box of the primary selection, marking, container or floating, in CSS px relative to the host, with the container already added in). Whoever tests finds on screen where to click or drag without a capture or calibration, including for markings inside a container. They are read-only for testing; nothing is written to `mapping.json`.
- The recipe "Where a marking is on screen" (`docs/TESTING.md`, appendix A) brings a ready-to-copy Playwright snippet: it selects through the **Tree**, waits for a frame, reads `data-selection-box` and the `.canvas-host`'s `getBoundingClientRect()` and returns the marking's center and eight handles, converting a canvas point to the screen through `data-viewport`. The steps of the scripts do not change.
