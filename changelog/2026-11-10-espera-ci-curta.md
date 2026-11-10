# Espera do CI mais curta — 2026-11-10 (épico `epic/espera-ci-curta`, PR #1457, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- Fluxo automatizado (`docs/FLOW.md`, "Para a sessão da fase", item 6): a sessão que espera o CI (fase, correção e fechamento) confere em 4 min depois do push e, com o CI ainda rodando, de 2 em 2 min até 20 min de espera; depois disso, de 8 em 8. Antes era um `send_later` de 8 min, e o CI de PR (~3 min) deixava a sessão parada com o CI já verde. O `subscribe_pr_activity` continua.
- Leitura do CI (`docs/FLOW.md`, item 6, e o skill `implementar-fila`, conferência do PR do épico): por `get_check_runs`, nunca `get_status` (o repositório não usa commit status, e ele fica `pending` para sempre), ignorando os check runs `skipped` da edição do título/corpo do PR e da limpeza do snapshot; CI verde é o `check` com `success` e nenhum outro com `failure`, `cancelled` ou `timed_out`.
- Skill `implementar-fila`: a linha "Pior caso de detecção" cita a nova espera do CI como primeira rede.
