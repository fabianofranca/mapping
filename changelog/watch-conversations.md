# Watch conversations in the same chat — [Não lançado] (épico `epic/watch-conversations`, PR #1879, MCP 0.46.0, schema v21)

## Alterado

- The example workspace folders are in English: `projetos/` → `projects/` and `especializacoes/` → `specializations/` (the five client configurations, `.gitignore`, README, the `AGENTS.md` block, the folder READMEs and the stdio client's default).
- `setup.sh` checks each folder pair on its own: when neither name exists it creates the English one; when the old one exists it creates and moves nothing and warns once, pointing to "Renaming the folders" in the workspace `README.md`. It still never edits `.mcp.json` or the other clients' configurations.
- The watcher's default root is `projects/` next to the script; when only `projetos/` exists it uses that one and says so in the start log.
- `mappings-workspace/` follows the same rename (`projects/`, `specializations/`), with no change of content in the moved files.
