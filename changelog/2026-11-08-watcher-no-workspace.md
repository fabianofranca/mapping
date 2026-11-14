# Watcher in the workspace — 2026-11-08 (epic `epic/watcher-no-workspace`, PR #876, MCP 0.28.2, schema v18)

## Adicionado

- Each MCP release also ships `watch-comments.mjs` (the watcher that wakes the agent when a conversation starts waiting for it), and `setup.sh` installs and updates it at the workspace root, checking the `sha256` like the other files. The `setup.sh` summary gains the `Watcher:` line (`instalado`, `atualizado`, `sem mudança` or `não atualizado (release sem o watcher)`).
- Existing workspaces get the file by running `./setup.sh` again; whoever still has the `setup.sh` from before the "Workspace atualizado" stage uses the transition line in the `README.md` of `examples/workspace/`. Releases before 0.28.2 do not have the file: `setup.sh` warns and keeps the local copy.
