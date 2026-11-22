# Grayscale on package images in the MCP PNG — 2026-11-22 (épico `epic/package-image-grayscale`, PR #2550, MCP 0.57.0 unchanged, schema v23 unchanged)

## Corrigido

- Checked that `filter: { grayscale }` already turns a package image gray in the MCP PNG (`render_marking`, `render_container`, `get_marking_image`), the same as the app: R = G = B and the alpha unchanged (`PR #2550`). The fix had come with the package images of #1903; this epic adds the end-to-end regression tests (the component through `instantiate` and `paintScene`, and the real `render_marking` path) and changes no code, no MCP version and no format.
