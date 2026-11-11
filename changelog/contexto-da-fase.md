# Teto de contexto da fase — [Não lançado] (épico `epic/contexto-da-fase`, PR #0, MCP 0.35.0 sem mudança, schema v18)

## Adicionado

- `docs/FLOW.md`, "Para a sessão da fase", item 3: o sub-item **Teto de contexto da fase**. A sessão da fase (e a de correção) confere o próprio contexto (`context_usage.used_tokens` do `get_session` sem `session_id`) antes de mandar tarefa nova a um subagente e antes dos gates; acima de 300 mil e antes de abrir o PR, ela espera os subagentes, faz commit `WIP <código>: passagem por contexto` e push, comenta a passagem na sub-issue (`Passagem da fase <código> (contexto <n> mil):`) e pede a troca ao coordenador. Depois do PR aberto não há troca.
- Skill `implementar-fila`, "3. Por etapa": o parágrafo **Fase que passa a vez por contexto**. O coordenador cria a sucessora (mesmos `model`, `effort` e `source_revision`, título com ` · retomada <k>`, mensagem da fase com a linha `Retomada por contexto (<k> de 3)`), grava `child=`, `session … kind=fase label=<código>` e o log no painel, e arquiva a anterior com o custo gravado antes. No máximo 2 trocas por fase: a sessão `3 de 3` não troca.
- `tests/tooling/queuePhaseContext.test.ts`: teste de texto que confere essas regras.

## Alterado

- `docs/FLOW.md`, "Orquestrador — passo a passo", parágrafo "Limites": o orquestrador de uma etapa só responde ao pedido de troca da fase do mesmo jeito (cria a sucessora e arquiva a anterior).
- Skill `implementar-fila`, "Arquivar as sessões" › "O que não se arquiva": a filha que passou a vez por contexto se arquiva ao criar a sucessora.
- Nada muda na app, no servidor MCP, no schema, no `docs/PROCESS.md`, no `CLAUDE.md` nem no `painel.py`.
