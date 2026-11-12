# Medida de contexto pelo transcript — [Não lançado] (épico `epic/medida-de-contexto`, PR #0, MCP 0.36.0 sem mudança, schema v18)

## Corrigido

- O teto de contexto da fase (300 mil) passa a funcionar: a sessão mede o contexto com `node scripts/ci/contextUsage.mjs`, que lê o uso da última chamada ao modelo no transcript local da própria sessão e acompanha o turno em curso. Antes, a medida era o `used_tokens` do `get_session`, que só muda no fim de um turno e valia 0 durante toda a fase; por isso nenhuma fase passava a vez, e o contexto chegou a 473 mil.
- O aviso final da fase traz a linha `Contexto: <mil> mil` (ou `Contexto: sem medida (<motivo>)`), medida logo antes do aviso.
- O testador mede o contexto antes de cada lote e antes do aviso, registra a linha `Contexto por lote: …` em "O que atrapalhou" e termina o aviso ao coordenador com `; contexto <mil> mil`. Nada muda acima do teto: o registro sem segurar da rodada continua.
- O coordenador mede o próprio contexto pelo script (`pct` com `--max`) na conferência de reserva e na troca de sessão, e a supervisão da fila mede a base e os ~50% do mesmo jeito.
- Ao arquivar cada filha, o coordenador só lê o `get_session` dela com o turno terminado (`status_bucket` diferente de `working`) e compara o contexto lido com o do aviso: fora de 0 a 15 mil de diferença, o `log` da fila registra "medida de contexto divergente" e a etapa segue.
- Os tetos não mudam (300 mil da fase e do testador, 35% do coordenador, ~50% da supervisão), nem o `painel.py`, o `docs/PROCESS.md` e o `CLAUDE.md`.
