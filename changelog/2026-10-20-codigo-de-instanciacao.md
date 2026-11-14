# Instantiation code — 2026-10-20 (PR #190, MCP 0.6.0, schema v11)

## Alterado

- The `code` of the specializations becomes the code used to create an instance of the type.
- `platforms[].repo` stays in the specialization and the project keeps only the local clone (specialization `formatVersion` 5).
