# Image header reader split into small helpers — 2026-11-22 (épico `epic/image-header-complexity`, PR #0, MCP 0.57.1, schema v23)

## Alterado

- The image header reader (format and size from the first bytes, in the app and the MCP) is split into small helpers with the same results; the MCP version only moves because the model is part of its bundle (#2546).
