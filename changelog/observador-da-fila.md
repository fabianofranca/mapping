# Observador da fila na skill supervisionar-fila — [Não lançado] (épico `epic/observador-da-fila`, PR #0, MCP 0.36.0 sem mudança, schema v18)

## Corrigido

- A seção "Vigiar uma condição" da skill `supervisionar-fila` descreve o observador que existe: a tarefa agendada "Mapping - Workflow Insights" (`trig_01YXXNz6596nCkk9vsyrvPgp`), que roda uma vez por dia, às 12:00 de Brasília, numa sessão nova a cada disparo. Antes, a skill citava um agendamento que não existe mais e um disparo "a cada 6 h", e a supervisão que seguisse só o texto procurava o id errado.
- Nome, horário, modelo, conectores, prompt e a parada do observador só o dono muda, pela tela de tarefas agendadas, porque o agendamento foi criado lá e o `update_trigger` recusa a edição dele. A skill manda a supervisão escrever o texto novo no chat, esperar o dono aplicar e conferir com `get_trigger`, sem tentar o `update_trigger` nem apagar e recriar. As tarefas que a própria supervisão cria (`create_trigger`) continuam editáveis por `update_trigger`.
- A skill deixa de afirmar o modelo do observador (o dono o escolhe na tela) e não repete o prompt agendado, que continua sendo lido pelo `get_trigger`. O `tests/tooling/supervisorSkill.test.ts` confere esses pontos.
