# Container — 2026-10-22 (PR #213, MCP 0.8.0, schema v12)

## Alterado

- The top-level canvas object is now called a container (`containers` and `containerId` in `mapping.json`; `*_container` tools in the MCP, with the old ones accepted with a notice for one version).
- Device presets come from the specialization (`formatVersion` 6) and the proposal moves to `formatVersion` 2.
