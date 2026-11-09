# Fila sem espera — [Não lançado] (épico `epic/fila-sem-espera`, PR #1366, MCP 0.28.15, schema v18)

## Adicionado

## Alterado

- Fila (`implementar-fila`): a versão do MCP é provisória ao abrir o épico e escolhida no fechamento (a próxima livre na `origin/main`); só a etapa `em andamento` ocupa vaga do `paralelo`; a correção que depende de código de outro épico vira um `bug` `ready` com `Depende de`, que a própria fila roda; o "Fim" confere os `bug` dela; as issues do que ficou para depois e o comentário de fechamento saem por um subagente durante o CI (PR #1366).
- `detalhar-backlog`: exige `Depende de` sobre as `ready` e `in-progress` que mexem nos mesmos arquivos.
- Painel da fila: sem a tabela "Bugs e roadmaps por etapa", o dataset `issues` e o subcomando `painel.py issue`; no lugar, o cartão "Issues criadas pela fila" com o link da busca `Origem: etapa`.

## Corrigido
