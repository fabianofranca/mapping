# Fila sem espera — 2026-11-09 (épico `epic/fila-sem-espera`, PR #1366, MCP 0.28.15 sem mudança, schema v18)

## Alterado

- Fila (`implementar-fila`): a versão do MCP é provisória ao abrir o épico e escolhida no fechamento (a próxima livre na `origin/main`); só a etapa `em andamento` ocupa vaga do `paralelo`; a correção que depende de código de outro épico vira um `bug` `ready` com `Depende de`, que a própria fila roda; o "Fim" confere os `bug` dela; as issues do que ficou para depois e o comentário de fechamento saem por um subagente durante o CI (PR #1366).
- Skill novo na `main` durante a fila: grande (mais de 30 linhas ou seções de regra) vira troca de sessão, depois de conferir a linhagem; pequeno vira releitura do `SKILL.md` inteiro com prova no `log` do painel.
- `detalhar-backlog`: exige `Depende de` sobre as `ready` e `in-progress` que mexem nos mesmos arquivos.
- Painel da fila: sem a tabela "Bugs e roadmaps por etapa", o dataset `issues` e o subcomando `painel.py issue`; no lugar, o cartão "Issues criadas pela fila" com o link da busca `Origem: etapa`.
- `implementar-fila`: com a versão do MCP trocada no fechamento, a rc do número antigo fica solta e o número novo ganha uma rc pelo workflow MCP pre-release; sem o id do comentário de fechamento, o resultado da Release vai num comentário novo; o "Fim" deixa de esperar o `bug` da própria fila que depende de outra etapa.
- `detalhar-backlog`: não acrescenta `Depende de` quando a dependência (direta ou transitiva) fecharia um ciclo.
- `docs/FLOW.md` e `docs/PROCESS.md`: a troca de sessão é por contexto ou por skill novo grande, e o gatilho do passo "Versão do MCP" volta a dizer "o que vai na release".
