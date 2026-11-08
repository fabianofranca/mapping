# Workspace de mapeamentos no repositório — [Não lançado] (épico `epic/mappings-workspace`, PR #TBD, MCP 0.28.4, schema v18)

## Adicionado

- A pasta `mappings-workspace/` traz os projetos do Mapping usados para projetar e evoluir o próprio app (telas, fluxos e componentes mapeados em marcações e anotações): `projetos/`, `especializacoes/`, `AGENTS.md`, `setup.sh`, `watch-comments.mjs` e os scripts do pipeline da Mapping DS (`ferramentas/mapping-ds/`). Fica isolada do código do app: o eslint e o prettier a ignoram e nenhum build a lê.
- O `.mcp.json` da raiz sobe o servidor `mapping` por `mappings-workspace/serve.mjs`. O servidor mantém a raiz do repositório como diretório de trabalho, então `find_by_code` e `get_code_hints` enxergam o código do app. Numa sessão do Claude Code na nuvem (ou se o servidor ainda não estiver instalado), o `serve.mjs` roda o `setup.sh` antes, para a sessão ter sempre o servidor e as skills da última release.
- `ferramentas/mapping-ds/paths.mjs` calcula, a partir da localização dos arquivos, os caminhos do workspace e do repositório; os scripts do pipeline funcionam em qualquer clone.

## Alterado

- `ferramentas/mapping-ds/HANDOFF.md` e `v9/README.md` descrevem o novo local (os caminhos absolutos antigos saíram dos scripts).
- `.claude/settings.json` habilita o servidor `mapping` e o `CLAUDE.md` ganha uma seção curta apontando para o workspace.
