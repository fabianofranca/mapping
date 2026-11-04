# Testes na nuvem — 2026-11-02 (épico `epic/testes-nuvem`, PR #279, MCP sem mudança, schema v13)

## Adicionado

- As rodadas dirigidas do testador podem rodar numa sessão do Claude Code na nuvem (ambiente "Mapping - testes"), sem o dono no computador: prompt em `docs/TESTING-NUVEM.md` e receitas dos diálogos nativos no apêndice A do `docs/TESTING.md`.

## Alterado

- O fluxo de épico dispara a rodada dirigida sozinho depois do merge da última fase: o agente da fase cria a sessão do testador, o testador avisa quando abre o PR do relato e, sem ❌ e com o CI verde, o agente da fase mescla o relato no épico.
