# Espera do CI mais curta — [Não lançado] (épico `epic/espera-ci-curta`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Alterado

- Fluxo automatizado (`docs/FLOW.md`, "Para a sessão da fase", item 6): a sessão que espera o CI (fase, correção e fechamento) confere em 4 min depois do push e, com o CI ainda rodando, de 2 em 2 min até 20 min de espera; depois disso, de 8 em 8. Antes era um `send_later` de 8 min, e o CI de PR (~3 min) deixava a sessão parada com o CI já verde. O `subscribe_pr_activity` continua.
- Skill `implementar-fila`: a linha "Pior caso de detecção" cita a nova espera do CI como primeira rede.
