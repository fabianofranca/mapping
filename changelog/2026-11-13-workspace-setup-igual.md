# mappings-workspace igual ao examples/workspace — 2026-11-13 (épico `epic/workspace-setup-igual`, PR #1820, MCP sem mudança, schema v19)

## Corrigido

- Para quem conduz o fluxo de entrega: as sessões na nuvem não terminam mais com `mappings-workspace/setup.sh` modificado (conteúdo e modo). A cópia versionada agora é igual à do `examples/workspace/`.
- O `mappings-workspace/serve.mjs` roda o `setup.sh` com `--no-self-update`: o `setup.sh` da sessão nunca se troca pelo da release. O servidor, a skill, o bloco do `AGENTS.md`, o watcher e o extrator continuam vindo da última release estável.
- Um teste (`tests/tooling/mappingsWorkspaceSync.test.ts`) confere a cópia do workspace (`setup.sh`, `watch-comments.mjs` e o bloco gerenciado do `AGENTS.md`) contra o `examples/workspace/` e falha dizendo o que copiar.
