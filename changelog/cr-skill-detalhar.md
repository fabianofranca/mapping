# CR do skill de detalhamento — [Não lançado] (épico `epic/cr-skill-detalhar`, PR #1218, MCP 0.28.10 sem mudança, schema v18)

## Alterado

- O `/detalhar-backlog` passa a tratar o grupo que junta `bug` e `roadmap`: a principal é o `bug` de maior severidade (no empate, o menor número), e a etapa fica `bug` com a maior severidade do grupo, sem `impact:`.
- O `/detalhar-backlog` diz o que fazer com as sub-issues `step` abertas de uma `ready` que entra num grupo ou tem o plano mudado: a fase que continua passa para a principal e é atualizada, a que sai fecha `not_planned` com um comentário, e a conferência do `PRONTA` checa que nenhuma `step` aberta ficou pendurada.
- O `/detalhar-backlog` manda carregar com o `ToolSearch` só o `PushNotification`; o `AskUserQuestion` só se for uma ferramenta adiada.
- A regra de `changelog/` prevê o épico só do fluxo de entrega: as categorias falam a quem conduz o fluxo (o dono e os agentes).
