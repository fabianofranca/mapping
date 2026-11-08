# Desfazer aplicação — 2026-11-08 (épico `epic/desfazer-aplicacao`, PR #927, MCP 0.28.2, schema v18)

## Corrigido

- Na revisão de uma proposta, `Ctrl+Z` e `Ctrl+Shift+Z` agora só desfazem e refazem o que **aquela** proposta aplicou. Antes, o segundo `Ctrl+Z` desfazia também a aplicação de outra proposta, e a app ficava presa em revisão somente leitura com **Bloqueia aplicar** até **Sair mesmo assim**. A recusa é silenciosa (o botão **Desfazer** fica desabilitado). Fora da revisão nada muda.
- Desfazer ou refazer a aplicação de uma proposta passa a esperar a gravação do `proposal.json`: enquanto ela não termina, `Ctrl+Z` e `Ctrl+Shift+Z` não fazem nada (dois seguidos não se cruzam). Se a gravação falha, o passo é revertido, a proposta continua como estava em disco e a app mostra o erro de gravação da proposta.
