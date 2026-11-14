# Conferência das atrasadas olha o ciclo de CI — 2026-11-14 (épico `epic/ciclo-ci-atrasadas`, PR #1887, MCP sem mudança, schema v19)

## Alterado

- **A conferência das atrasadas do `implementar-fila` passa a olhar a fase que está trabalhando em ciclo de CI vermelho (para quem conduz o fluxo, #1884):** com o PR da fase aberto, o subagente do ciclo (Sonnet) lê os commits do PR depois da abertura e o CI de cada um; com 3 ou mais commits vermelhos, ou a mesma falha (mesmo job e mesma mensagem) em 2 commits seguidos, um subagente Opus lê só o resumo (nunca o transcript) e diz em até 6 linhas se é ciclo, a causa provável e a direção. Sendo ciclo, o coordenador manda a direção à fase por `send_message` com `priority: "now"`; direção que mexe em arquivo fora do "Toca em:" da sub-issue vai ao dono pelo seletor de perguntas. No máximo um diagnóstico por fase a cada 60 min. Sem script novo; a regra do lado da fase fica fora (depende da #1856).
