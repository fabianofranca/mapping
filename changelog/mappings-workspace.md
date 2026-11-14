# Mappings workspace in the repository — [Não lançado] (épico `epic/mappings-workspace`, PR #1063, MCP 0.28.4, schema v18)

## Adicionado

- The `mappings-workspace/` folder brings the Mapping projects used to design and evolve the app itself (screens, flows and components mapped as markings and annotations): `projetos/`, `especializacoes/`, `AGENTS.md`, `setup.sh`, `watch-comments.mjs` and the Mapping DS pipeline scripts (`ferramentas/mapping-ds/`). It is isolated from the app code: eslint and prettier ignore it and no build reads it.
- The root `.mcp.json` starts the `mapping` server through `mappings-workspace/serve.mjs`. The server keeps the repository root as its working directory, so `find_by_code` and `get_code_hints` see the app code. In a Claude Code session in the cloud (or if the server is not installed yet), `serve.mjs` runs `setup.sh` first, so the session always has the server and the skills of the latest release.
- `ferramentas/mapping-ds/paths.mjs` computes, from the location of the files, the paths of the workspace and of the repository; the pipeline scripts work in any clone.

## Alterado

- `ferramentas/mapping-ds/HANDOFF.md` and `v9/README.md` describe the new location (the old absolute paths are gone from the scripts).
- `.claude/settings.json` enables the `mapping` server and `CLAUDE.md` gains a short section pointing to the workspace.
