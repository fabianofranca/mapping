# Watch conversations in the same chat — [Não lançado] (épico `epic/watch-conversations`, PR #1879, MCP 0.46.0, schema v21)

## Adicionado

- `watch-comments.mjs --emit`: instead of running a command, the watcher prints one `MAPPING_WAKE <json>` line per batch to stdout (`[{ project, thread, path }]`), so a background process can wake the agent in the same chat; the logs stay on stderr. `--emit` with `-- <command>`, or neither, is a usage error (exit 2).
- `watch-comments.mjs --state <file>`: keeps the handled conversation/message pairs between runs (temporary file + rename), so a restart does not repeat a wake and a pair that arrived while the watcher was stopped fires on start. The start log names the root and the number of project folders.
- `watch-conversations` skill (`examples/workspace/.agents/skills/watch-conversations/SKILL.md`): from "watch the conversations" it checks the preparation, answers what already waits, starts `watch-comments.mjs --emit --state .mapping-watch/state.json` with Claude Code's `Monitor` or Cursor's shell tool, answers each wake in the same chat and stops on request. The workspace `README.md` (both modes, the limits, the `.mapping-watch/` line for existing workspaces), the skills `README.md`, the `AGENTS.md` block and `docs/AGENT-GUIDE.md` ("Conversations") cite it; `mappings-workspace/` follows.
- `.mapping-watch/` (the state folder) in the `.gitignore` of the example workspace and of `mappings-workspace/`.
- The MCP release publishes `watch-conversations.SKILL.md` (and its `.sha256`) next to the other workspace files, copied from `examples/workspace/.agents/skills/watch-conversations/SKILL.md`; the pre-release and stable jobs check it in their `expected=` lists. Plain `SKILL.md` stays the `spec-author` skill.
- `setup.sh` installs that skill in `.agents/skills/watch-conversations/` and links `.claude/skills/watch-conversations`, with the same rules as `spec-author`, and prints `Watch skill: installed | updated | no change | not updated (release without the skill)`. A release without the file warns and the run goes on.

## Corrigido

- `mappings-workspace/serve.mjs` no longer hangs the MCP client: `setup.sh` runs with a 25 s timeout (below the 30 s Claude Code waits); on a timeout or failure, an installed server still starts, with a warning on stderr, and only without one does it exit 1. A failure to start the server prints `could not start the MCP server: <message>` instead of a stack trace (#1916 items 2 and 3).
- `watch-comments.mjs` no longer stays running after the chat's `Monitor` is stopped: it exits when its stdin pipe ends or its stdout breaks, and writes no wake line once stopping; the `watch-conversations` skill's `## Stop` says what is left (nothing) and how to check (round #2134, R40.5).
- `setup.sh` says `Downloading from <base>...` when `MAPPING_RELEASE_BASE` is set, and `release <tag|latest>` otherwise.
- `docs/TESTING.md`: R40.5 undoes the R40.3 message first and checks `pgrep` after `TaskStop`; R40.3 checks `^MAPPING_WAKE` on stderr; R0.2 lists the `texto` files; R21.1 lists the `Extractor:` line.

## Alterado

- The example workspace folders are in English: `projetos/` → `projects/` and `especializacoes/` → `specializations/` (the five client configurations, `.gitignore`, README, the `AGENTS.md` block, the folder READMEs and the stdio client's default).
- `setup.sh` checks each folder pair on its own: when neither name exists it creates the English one; when the old one exists it creates and moves nothing and warns once, pointing to "Renaming the folders" in the workspace `README.md`. It still never edits `.mcp.json` or the other clients' configurations.
- The watcher's default root is `projects/` next to the script; when only `projetos/` exists it uses that one and says so in the start log.
- `mappings-workspace/` follows the same rename (`projects/`, `specializations/`), with no change of content in the moved files.
- The regenerable outputs of `mappings-workspace/ferramentas/mapping-ds/v9/*/out/` (`preview-*`, `real-*`, `out/dark/preview-*` and `validate.json`) are no longer versioned (`git rm --cached` and `.gitignore`); `preview.mjs` writes the `path` of `validate.json` relative to `ferramentas/mapping-ds`, and the README and `HANDOFF.md` say how to regenerate them (#1916 items 4 to 6).
- `docs/TESTING.md`: new script R40 (watch conversations in the same chat), in block 6 of the full round; R21 also checks the `watch-conversations` skill and the `Watch skill:` line.
