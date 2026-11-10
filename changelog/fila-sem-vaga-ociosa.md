# Fila sem vaga ociosa — [Não lançado] (épico `epic/fila-sem-vaga-ociosa`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Adicionado

- O `painel.py` calcula a nota "Vagas k/N" em toda gravação (`meta.vagas`), com o motivo de cada `ready` que não começou (`hold`, `dep`, `arquivo`, `schema`, `começa`, `vagas cheias`), e o `show` diz quais etapas começam agora (`vagas:` e `começar agora:`).
- Comandos novos: `start <pasta> --paralelo N`, `merged <pasta> '#N'` (dependência já na `main`) e `context <pasta> <pct>` (contexto do coordenador; o `show` avisa acima de 60%). A linha da fila ganha o campo `hold`.
- A comparação do "Toca em:" é por roteiro no `docs/TESTING.md` (`docs/TESTING.md#R12`); a tabela de blocos do `docs/TESTING-NUVEM.md#blocos`, o `mcp/version.ts`, o `changelog/` e o `docs/design-system/` não contam como conflito.
- A página do painel mostra a nota no subtítulo e o card "Por que há vaga livre".
