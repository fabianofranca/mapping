# Registro repetido no painel da fila — [Não lançado] (épico `epic/painel-role-repetido`, PR #0, MCP 0.34.3 sem mudança, schema v18)

## Corrigido

- `painel.py role <pasta> <papel> <id>` com o `<id>` que já é o registrado no papel (`coordenador` ou `supervisor`) não muda mais nada: o `n` não soma 1, o `previous` não vira o próprio id, `at` e `link` ficam como estavam e o `meta.json` não é gravado nem marcado como não publicado. A saída diz `<papel> <n>: <id> já é o registrado; nada mudou` (e `alterados: nenhum` fora de um `apply`), com status 0, e dentro do `apply` a linha repetida não grava e o resto do lote grava. Antes, o coordenador que se registrava de novo depois da troca de sessão estragava o painel ("coordenador 4" para o terceiro) e perdia o id da sessão anterior.
- Skill `implementar-fila`: "Painel" descreve o `meta.roles.<papel>` com o `previous` e o registro repetido sem efeito; o item 4 de "Na sessão nova" só pede o registro quando o `roles` não traz a sessão nova como `coordenador`.
