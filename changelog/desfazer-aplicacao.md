# Desfazer aplicação — [Não lançado] (épico `epic/desfazer-aplicacao`, PR #0, MCP 0.28.2, schema v18)

## Corrigido

- Na revisão de uma proposta, `Ctrl+Z` e `Ctrl+Shift+Z` agora só desfazem e refazem o que **aquela** proposta aplicou. Antes, o segundo `Ctrl+Z` desfazia também a aplicação de outra proposta, e a app ficava presa em revisão somente leitura com **Bloqueia aplicar** até **Sair mesmo assim**. A recusa é silenciosa (o botão **Desfazer** fica desabilitado). Fora da revisão nada muda.
