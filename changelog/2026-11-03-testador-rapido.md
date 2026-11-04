# Testador mais rápido — 2026-11-03 (épico `epic/testador-rapido`, PR #385, MCP 0.13.0, schema v13)

## Alterado

- O testador da nuvem ganha auxiliares em `scripts/testing/` (`cloud-up.sh`, `cloud.mjs`, `atspi-allow.py`) que sobem o ambiente (build, servidor, tela virtual, Chrome) e operam os diálogos nativos (seletor de pasta ou arquivo, pedido de permissão, "Salvar como", cancelar) numa chamada só, em vez de reescrever os scripts a cada rodada.
- O reteste por achados roda só o R0.1 (build id) e os passos do R0 de que os achados dependem, em vez do R0 inteiro.
- A passada visual da rodada dirigida passa a cobrir só as janelas e os diálogos que a etapa toca (linha "Passada visual:" da sub-issue da última fase); o reteste cobre só os das janelas e dos diálogos dos achados; a rodada completa continua com a lista padrão.
- O relato passa a trazer o tempo real por roteiro (medido por `mark()` em `apoio/tempos.log`, nunca estimado) e a duração total também vai na notificação ao coordenador.
- Correções de texto no guia (`docs/TESTING.md`) a partir dos tropeços recorrentes dos relatos de teste: atalhos de janela pelo Playwright (`Control+Shift+Digit<n>`), a aba do guia interativo, a visão a ler no R11.6, reabrir Especializações para a segunda aplicação do R1.3, barra final no caminho do seletor de pasta e a permissão de leitura pela receita 6.
