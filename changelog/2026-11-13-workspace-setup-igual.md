# mappings-workspace identical to examples/workspace — 2026-11-13 (épico `epic/workspace-setup-igual`, PR #1820, MCP unchanged, schema v19)

## Corrigido

- For whoever drives the delivery flow: cloud sessions no longer end with `mappings-workspace/setup.sh` modified (content and mode). The versioned copy is now identical to that of `examples/workspace/`.
- `mappings-workspace/serve.mjs` runs `setup.sh` with `--no-self-update`: the session's `setup.sh` never replaces itself with the release's. The server, the skill, the `AGENTS.md` block, the watcher and the extractor still come from the latest stable release.
- A test (`tests/tooling/mappingsWorkspaceSync.test.ts`) checks the workspace copy (`setup.sh`, `watch-comments.mjs` and the managed block of `AGENTS.md`) against `examples/workspace/` and fails saying what to copy.
