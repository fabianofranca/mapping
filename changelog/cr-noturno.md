# CR noturno sem repetição — [Não lançado] (épico `epic/cr-noturno`, PR #0, MCP 0.34.2 sem mudança, schema v18)

## Alterado

- Os docs do fluxo (`docs/PROCESS.md` e `docs/FLOW.md`, "Revisão de código") passam a dizer o que o agendamento "CR por épico" já faz: a revisão noturna é só para o épico sem `/code-review high` do épico inteiro no fechamento, decidido pelo `riskTriggers.mjs` (`gatilho:` pula, `nenhum gatilho` entra). O "Como roda" traz os ids do agendamento e da coordenadora e como recriar a coordenadora, as "Limitações conhecidas" registram o épico fechado fora da fila, e a mensagem do revisor passa a ser a cópia literal da guardada no agendamento (marcadores `{nome}`, `{pr}` e `{sha}`). Um teste em `tests/tooling/` confere o lado do repositório.
