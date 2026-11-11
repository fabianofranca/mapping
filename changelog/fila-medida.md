# Fila medida e mais barata — [Não lançado] (épico `epic/fila-medida`, PR #1546, MCP 0.33.0 sem mudança, schema v18)

## Adicionado

- Registro de abertura do épico da etapa #1532 (fila medida e mais barata). As fases FM1 a FM8 acrescentam aqui o que entregarem.

## Alterado

- Painel da fila (`painel.py`): `apply` grava os comandos de um ciclo de uma vez (tudo ou nada), `meta.unpublished` e a linha `não publicado` do `show` dizem o que falta publicar, e `published` e `touch` dão a hora real da publicação. A skill `implementar-fila` passa a publicar a cada turno que gravou, mesmo com o subagente do ciclo rodando.
- Fichas completas, etapa exclusiva, "Drenar" e seções no Paralelo (`painel.py` e skills `implementar-fila` e `detalhar-backlog`): `dep`, `toca` ou `fases` em `?` dão `ficha incompleta (<campos>)` e entram em `fichas a refazer:` do `show`, em vez de segurar a fila em silêncio; `row '#n' exclusive=sim` faz a etapa começar só com a fila vazia e segura as outras enquanto roda (no lugar do hold "ordem do dono (só com a fila vazia)"); "Drenar" pausa e, sem etapa em andamento, avisa "Fila drenada" e para; e o `docs/FLOW.md`, o `docs/PROCESS.md` e os `SKILL.md` se comparam por seção `##` (`painel.py slug` imprime a âncora), como o `docs/TESTING.md` por roteiro.
