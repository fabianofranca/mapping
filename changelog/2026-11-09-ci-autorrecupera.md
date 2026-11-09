# CI que se recupera sozinho — 2026-11-09 (épico `epic/ci-autorrecupera`, PR #1353, MCP 0.28.15, schema v18)

## Adicionado

- `.github/workflows/ci-rerun.yml` (`CI: reexecução de runner abandonado`): quando o CI de um PR do repositório termina vermelho na tentativa 1 só porque o GitHub abandonou um runner, reexecuta os jobs que faltam, uma vez; falha legítima e timeout não são reexecutados. A regra está em `scripts/ci/ciRerun.mjs`. Só vale depois do merge na `main`.
- O último passo do job `build` mostra a margem do `dist/index.html` até o teto no resumo e avisa (`::warning`) abaixo de 2 KiB.

## Alterado

- Todo job do `ci.yml` ganhou `timeout-minutes` (epic 3, static 4, test 6, coverage 3, build 7, check 2, e2e 7): job travado para e o check obrigatório termina vermelho.
- O passo do tamanho do `dist/index.html` passou para o fim do `build`, depois do `build:mcp` e do `build:viewer`.
