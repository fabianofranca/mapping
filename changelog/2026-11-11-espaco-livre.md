# New piece in free space — 2026-11-11 (epic `epic/espaco-livre`, PR #1565, MCP 0.34.1, schema v18)

## Corrigido

- The Palette (drop, **Add to screen**, **Add to canvas**, **Add inside X**) and the MCP `create_marking` without `rect` no longer put the new piece over existing markings: it is born in the free spot closest to the requested point, without covering or coinciding with others, and does not adopt markings without notice.
