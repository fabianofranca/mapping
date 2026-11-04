# Testador da nuvem por passo — 2026-11-04 (épico `epic/testador-por-passo`, PR #429, MCP 0.13.0, schema v13)

## Alterado

- Auxiliares do testador da nuvem (`scripts/testing/`): `connect()` com timeout curto (5 s nas ações, 15 s nas navegações), ambiente (`DISPLAY`, D-Bus) carregado sozinho de `apoio/env`, aba da app escolhida sem pegar a do guia (falha com as URLs se houver duas), `cloud-up.sh` que volta sozinho (processos com `setsid`), `state()` (aba, diálogos, avisos, gravação, foco, janelas nativas e o que mudou no `mapping.json`) e `round-guide.mjs`, que gera o guia da rodada só com os roteiros pedidos.
- Prompt do testador (`docs/TESTING-NUVEM.md`): lê o guia da rodada (`round-guide.mjs`) em vez do `docs/TESTING.md` inteiro, roda o `cloud-up.sh` em primeiro plano e termina todo script de passo com o `state()` (agir e conferir tela e disco numa chamada); o aviso ao coordenador nomeia o `send_message` do `claude-code-remote`. O relato (template da seção 10) agrupa os ✅ de passos seguidos do mesmo roteiro numa linha, e o Resumo continua contando por passo. Apêndice A: receitas 2 e 4 descrevem o `connect()` e o `state()`.
