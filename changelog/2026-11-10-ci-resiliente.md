# CI resiliente — 2026-11-10 (épico `epic/ci-resiliente`, PR #1381, MCP 0.28.15 sem mudança, schema v18)

## Adicionado

- `scripts/ci/distBudget.mjs raise`: confere as condições da subida automática do teto do `dist/index.html` (excesso de até 16 KiB, épico com até 32 KiB a mais que a `main`, subidas desde a última revisão do dono até 64 KiB) e, com `--write`, troca o `INDEX_HTML_MAX_BYTES` do `ci.yml` e acrescenta a frase ao comentário; fora dos limites imprime "chama o dono: <motivo>" e não grava.

## Alterado

- Fase (`docs/FLOW.md`, "Para a sessão da fase"): quem espera o CI nunca encerra o turno sem um `send_later` de 8 min; a segunda reexecução (depois da automática do `ci-rerun.yml`) é da fase, e depois de 2 reexecuções sem sucesso ela avisa o coordenador ("CI travado"). Com o aviso de margem abaixo de 2 KiB, tenta enxugar antes de abrir mão; com o teto estourado, aplica a regra de subida do `distBudget.mjs` ou manda os números ao coordenador.
- Fila (`implementar-fila`): a filha sem aviso há mais de 30 min (`LATE_MINUTES = 30` no `painel.py`; era 60) com `review_ready` ou `idle` recebe primeiro um `send_message` e só na conferência seguinte a sessão é recriada.
- Fila: o coordenador não roda o CI de novo (a reexecução é do `ci-rerun.yml` e da fase); no PR do épico com CI travado ou ao receber "CI travado", chama o dono. O teto do `dist/index.html` sobe sozinho dentro dos limites, com o registro no changelog e na `roadmap` "Orçamento do dist/index.html".
- `detalhar-backlog`: a fase que toca a infraestrutura do fluxo ou algo crítico (skills da fila e do detalhamento, `painel.py`, regras do `docs/FLOW.md` e do `docs/PROCESS.md`, workflows, release, `formatVersion`, gravação do `mapping.json`, CSP) é detalhada como high com `/code-review high`, e quem acrescenta decisão a uma etapa em andamento reclassifica as fases não terminadas.
- `implementar-fila`, "Fechamento": o épico que toca algum desses gatilhos roda a `/code-review high` no diff inteiro (base `main`) antes do merge, e os defeitos confirmados são corrigidos no próprio épico.
- `tests/tooling/ciConfig.test.ts`: o orçamento do `dist/index.html` é um múltiplo de 16 KiB numa linha só, sem o número fixo.
- `implementar-fila`: o skill novo na `main` só vira troca de sessão se mudar mais de 60 linhas ou "Regras desta fila" (era 30 linhas ou qualquer seção de regra); o resto é releitura do `SKILL.md` inteiro. A versão do schema é escolhida ao criar o épico, lendo a `origin/main`, como a do MCP.
- `scripts/ci/distBudget.mjs`: rejeita flag desconhecida e valor ausente (antes engolia o argumento seguinte) e escreve o teto fora de múltiplo de 1 KiB com decimal (`1.904,5 KiB`), em vez de número quebrado. `implementar-fila`: o `--size` da subida vem de um build do head depois de trazer a `main`.
