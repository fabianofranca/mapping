# CR noturno sem repetição — 2026-11-11 (épico `epic/cr-noturno`, PR #1597, MCP 0.34.2 sem mudança, schema v18)

## Alterado

- Os docs do fluxo (`docs/PROCESS.md` e `docs/FLOW.md`, "Revisão de código") passam a dizer o que o agendamento "CR por épico" já faz: a revisão noturna é só para o épico sem `/code-review high` do épico inteiro no fechamento, decidido pelo `riskTriggers.mjs` (`gatilho:` pula, `nenhum gatilho` entra). O "Como roda" traz os ids do agendamento e da coordenadora e como recriar a coordenadora, as "Limitações conhecidas" registram o épico fechado fora da fila, e a mensagem do revisor passa a ser a cópia literal da guardada no agendamento (marcadores `{nome}`, `{pr}` e `{sha}`). Um teste em `tests/tooling/` confere o lado do repositório.

## Corrigido

- A lista do CR noturno não para mais nos 100 PRs mais recentes: o agendamento lista os épicos pela história da `main` desde o CR base (com o clone aprofundado por `--shallow-since`), os seis merges anteriores ao `riskTriggers.mjs` são decididos pelo resultado do fechamento (#1381, #1343, #1418 e #1417 pulados, #1373 e #1419 revisados), e a busca de rodadas repetidas acha a issue renomeada pelo marcador `cr-epic: pr=<n>`. O revisor também aprofunda o clone para ler o diff dos merges antigos. O prompt novo do agendamento "CR por épico" acompanha o PR, e o agendamento fica desativado até o dono colá-lo e reativá-lo.
