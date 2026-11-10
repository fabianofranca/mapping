# Fila sem vaga ociosa — [Não lançado] (épico `epic/fila-sem-vaga-ociosa`, PR #0, MCP 0.30.0 sem mudança, schema v18)

## Adicionado

- O `painel.py` calcula a nota "Vagas k/N" em toda gravação (`meta.vagas`), com o motivo de cada `ready` que não começou (`hold`, `dep`, `arquivo`, `schema`, `começa`, `vagas cheias`), e o `show` diz quais etapas começam agora (`vagas:` e `começar agora:`).
- Comandos novos: `start <pasta> --paralelo N`, `merged <pasta> '#N'` (dependência já na `main`) e `context <pasta> <pct>` (contexto do coordenador; o `show` avisa acima de 60%). A linha da fila ganha o campo `hold`.
- A comparação do "Toca em:" é por roteiro no `docs/TESTING.md` (`docs/TESTING.md#R12`); a tabela de blocos do `docs/TESTING-NUVEM.md#blocos`, o `mcp/version.ts`, o `changelog/` e o `docs/design-system/` não contam como conflito.
- A página do painel mostra a nota no subtítulo e o card "Por que há vaga livre".

## Alterado

- O skill `implementar-fila` usa a nota de vagas: grava `start --paralelo N` (também na retomada), lê `vagas:` e `começar agora:` do `show` e começa cada etapa listada no mesmo ciclo. "Paralelo" aponta para o `painel.py` em vez de repetir a conta.
- A conferência de reserva começa pelo contexto (`painel.py context`), e acima de 60% a coordenação passa adiante na hora, sem esperar o fim de uma etapa ou fase. Sai a leitura "a cada aviso de filha".
- A ficha da etapa pede o estado de cada dependência (`:main`/`:aberta`) e o "Toca em:" por roteiro (`docs/TESTING.md#R12`, `docs/TESTING-NUVEM.md#blocos`); o `detalhar-backlog` e o `docs/PROCESS.md` escrevem e comparam do mesmo jeito.
- Recado do dono que descreve um estado não segura uma `ready` com as dependências na `main`: ela começa e o coordenador pergunta ("Seguir"/"Segurar"). Restrição fixa, pausa e retomada passam pelo `hold`.
