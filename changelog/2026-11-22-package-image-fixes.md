# Package image fixes — 2026-11-22 (épico `epic/package-image-fixes`, PR #2630, MCP 0.57.5, schema v23)

## Alterado

- A package image over the limits or not in the format of its extension shows its own drawing warning (`package-image-refused`) instead of the decode one; a missing package image shows no drawing warning (the library check already reports it). The viewer (`mapping-viewer` 0.8.0) exports the new `RenderWarningCode`.

## Corrigido

- A linear gradient on the stroke of an ellipse is no longer shifted by half the box.
- The MCP's `render_marking`, `render_container` and `get_marking_image` only draw a package image of a specialization that the app treats as a package (a loaded spec and a folder package), like the app; any other one gives the placeholder.
