# Skill de implementação da fila — [Não lançado] (épico `epic/skill-fila`, PR #0, MCP 0.28.3, schema v18)

## Adicionado

- Skill `/implementar-fila` do Claude Code (`.claude/skills/implementar-fila/`), para o fluxo de entrega. Um coordenador implementa em sequência as issues `ready`, na ordem de "Depende de", severidade e impacto, com até 2 épicos em paralelo quando os arquivos que tocam são disjuntos. Ele cria as sessões das fases e do testador, roda correções até zerar os ❌, faz o fechamento, pede ao dono o merge de cada épico na `main` (ou mescla sozinho com `mesclar=auto` escrito pelo dono na chamada) e mantém o painel "Fila de desenvolvimento" atualizado a cada passo. Quando o contexto enche, passa a coordenação para uma sessão nova.
