# Avisos da revisão numa linha — [Não lançado] (épico `epic/aviso-revisao-compacto`, PR #0, MCP 0.19.0, schema v14)

## Alterado

- Revisão: os avisos de **conflitos novos** ("1 conflito(s) novo(s)", com **Ver conflitos**) e de **proposta substituída** ("Proposta substituída", com **Abrir a nova**) acima da lista da janela Propostas agora ocupam uma linha só, da altura de um controle, com um **X**. A frase completa ("O projeto mudou desde a sua última sessão…", "Esta proposta foi substituída por outra…") fica na dica do texto e continua lida pelo leitor de tela. Na altura padrão da janela Propostas (240 px), a 900×720 e a 1280×720, a lista mostra 2 linhas inteiras com o aviso (antes, nenhuma) e 3 depois do X.
- Revisão: o **X** esconde o aviso até sair da revisão e leva o foco à lista. O de conflitos novos volta se surgir outro conflito novo durante a revisão (por exemplo numa recarga externa); o de substituída volta ao reabrir a proposta. Nada é gravado no projeto nem na memória da revisão.
