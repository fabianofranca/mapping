# Workspace updated — 2026-11-07 (épico `epic/workspace-atualizado`, PR #710, MCP 0.24.1, schema v15)

## Adicionado

- Each MCP release also brings the `setup.sh`, the `spec-author` skill and the workspace rules (the `AGENTS.md` block between `mapping:begin` and `mapping:end`), each with a `sha256`.
- The workspace's `setup.sh` updates itself (`--no-self-update` turns it off) and maintains the `AGENTS.md` rules: it replaces only the block between the markers, preserves your "Para que servem" section and keeps a backup when it migrates an old `AGENTS.md`. Running it again changes nothing.
- The `setup.sh` checks the `sha256` of all the release files before replacing any of them: if one does not match, it stops with an error and nothing in the folder changes.
- Whoever still has the old `setup.sh` updates once with `curl -fsSL https://github.com/fabianofranca/mapping/releases/latest/download/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh`.

## Alterado

## Corrigido

- The workspace's `spec-author` skill comes from the same version as the server, and the copy in `.claude/skills/` (where links do not exist) is now updated on every run of `setup.sh`.
