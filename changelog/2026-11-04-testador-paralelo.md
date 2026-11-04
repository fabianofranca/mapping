# Testador paralelo — 2026-11-04 (épico `epic/testador-paralelo`, PR #470, MCP 0.14.0, schema v13)

## Adicionado

- **Rodada completa do testador em 3 blocos paralelos**, com resumo do coordenador: a divisão fixa (blocos de 82, 92 e 95 passos, R0 nos três) fica numa tabela do `docs/TESTING-NUVEM.md` e é conferida por teste contra os passos do `docs/TESTING.md`; o modo "completo, bloco k de 3" roda só os roteiros do bloco, com relato e achados `k.n` por bloco; o orquestrador (ou um chat avulso do dono) cria as três sessões, espera os três avisos e posta o resumo (✅, ❌ e não executado por bloco, achados por severidade, tempos e links). As mensagens e o template do resumo estão no `docs/FLOW.md`.
