# Watch conversations in the same chat — [Não lançado] (épico `epic/watch-conversations`, PR #1879, MCP 0.46.0, schema v21)

## Adicionado

- `watch-comments.mjs --emit`: instead of running a command, the watcher prints one `MAPPING_WAKE <json>` line per batch to stdout (`[{ project, thread, path }]`), so a background process can wake the agent in the same chat; the logs stay on stderr. `--emit` with `-- <command>`, or neither, is a usage error (exit 2).
- `watch-comments.mjs --state <file>`: keeps the handled conversation/message pairs between runs (temporary file + rename), so a restart does not repeat a wake and a pair that arrived while the watcher was stopped fires on start. The start log names the root and the number of project folders.
- `.mapping-watch/` (the state folder) in the `.gitignore` of the example workspace and of `mappings-workspace/`.

## Alterado

- The example workspace folders are in English: `projetos/` → `projects/` and `especializacoes/` → `specializations/` (the five client configurations, `.gitignore`, README, the `AGENTS.md` block, the folder READMEs and the stdio client's default).
- `setup.sh` checks each folder pair on its own: when neither name exists it creates the English one; when the old one exists it creates and moves nothing and warns once, pointing to "Renaming the folders" in the workspace `README.md`. It still never edits `.mcp.json` or the other clients' configurations.
- The watcher's default root is `projects/` next to the script; when only `projetos/` exists it uses that one and says so in the start log.
- `mappings-workspace/` follows the same rename (`projects/`, `specializations/`), with no change of content in the moved files.
