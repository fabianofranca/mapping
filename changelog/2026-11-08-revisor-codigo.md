# Revisor de código — 2026-11-08 (épico `epic/revisor-codigo`, PR #985, MCP 0.28.4, schema v18)

## Adicionado

- Revisão de código automática, para o fluxo de entrega: todo épico mesclado na `main` é revisado de madrugada, e os achados viram uma issue da rodada e uma issue `bug` por defeito confirmado de severidade high ou medium, todas com o rótulo novo `code-review`. O ponto de partida é o CR base de 2026-11-08, que revisou a `main` inteira. Regras no `CLAUDE.md` ("Revisão de código") e mensagens no `docs/FLOW.md`.

## Alterado

- `/detalhar-backlog`: as issues do revisor (`code-review`) entram no detalhamento sem repetir achado. O item da rodada que já tem a sua issue `bug` fica com ela, e a rodada pode ser dividida por área entre etapas.
