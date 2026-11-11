# Fila medida e mais barata — [Não lançado] (épico `epic/fila-medida`, PR #1546, MCP 0.33.0 sem mudança, schema v18)

## Adicionado

- Registro de abertura do épico da etapa #1532 (fila medida e mais barata). As fases FM1 a FM8 acrescentam aqui o que entregarem.
- Custo e esforço das sessões da fila no painel (`painel.py` e skills `implementar-fila` e `detalhar-backlog`): `session … kind=<tipo> [label=]` e `cost` guardam em `meta.sessions` o custo, o contexto, o modelo e o esforço de cada sessão (do `get_session`), `costs [--desde <ISO>]` imprime o total, os totais por tipo (com mediana) e por etapa, o `show` ganha a linha `custo:` e a página, o card "Custo da fila". As filhas nascem com o `effort` da tabela (fase e testador) ou `medium` (correção), conferido pelo `effort_level`; o `docs/FLOW.md`, o `docs/PROCESS.md` e o `detalhar-backlog` deixam de dizer que o `create_session` só aceita o modelo.

## Alterado

- Painel da fila (`painel.py`): `apply` grava os comandos de um ciclo de uma vez (tudo ou nada), `meta.unpublished` e a linha `não publicado` do `show` dizem o que falta publicar, e `published` e `touch` dão a hora real da publicação. A skill `implementar-fila` passa a publicar a cada turno que gravou, mesmo com o subagente do ciclo rodando.
- Fichas completas, etapa exclusiva, "Drenar" e seções no Paralelo (`painel.py` e skills `implementar-fila` e `detalhar-backlog`): `dep`, `toca` ou `fases` em `?` dão `ficha incompleta (<campos>)` e entram em `fichas a refazer:` do `show`, em vez de segurar a fila em silêncio; `row '#n' exclusive=sim` faz a etapa começar só com a fila vazia e segura as outras enquanto roda (no lugar do hold "ordem do dono (só com a fila vazia)"); "Drenar" pausa e, sem etapa em andamento, avisa "Fila drenada" e para; e o `docs/FLOW.md`, o `docs/PROCESS.md` e os `SKILL.md` se comparam por seção `##` (`painel.py slug` imprime a âncora), como o `docs/TESTING.md` por roteiro.
