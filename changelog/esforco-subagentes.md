# Esforço sob controle da fila — [Não lançado] (épico `epic/esforco-subagentes`, PR #0, MCP 0.28.12, schema v18)

## Alterado

- O `/detalhar-backlog` detalha cada unidade (e o agrupamento) num subagente Opus da ferramenta `Agent`, em segundo plano, com o esforço escolhido pelos critérios da skill (`high` ou `medium`; `alto=` soma, `alto=nenhum` põe tudo em `medium`). Saem a pergunta "Esforço", o prompt pronto para o dono abrir a sessão e as conferências do prompt. Os relatórios voltam pelo retorno do subagente e as respostas do dono, por `SendMessage` ao mesmo subagente.
- Uma só conferência de reserva de 60 min no detalhamento; na terceira vez sem notícia do mesmo subagente (3 h) o coordenador pergunta ao dono se segue sem ele ou o recria (com as respostas já dadas).
- A fase cujo coordenador pede esforço `high`, `xhigh` ou `max` roda `/code-review` nesse nível sobre o diff dela antes do PR, e o Resumo do PR traz a linha da revisão (`docs/FLOW.md`, "Para a sessão da fase"; a `/implementar-fila` acrescenta o item).
