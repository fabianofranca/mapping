# Ajustes da rodada das perspectivas — [Não lançado] (épico `epic/perspectivas-ajustes`, PR #0, MCP 0.28.2, schema v18)

## Corrigido

- **Apagar uma perspectiva** pelo **Gerenciar perspectivas** não deixa mais a tela sem o Gerenciar: **Cancelar**, `Esc` e **Apagar** reabrem o Gerenciar. Depois de **Cancelar**/`Esc` o foco fica no **Apagar** da mesma linha; depois de **Apagar**, no **Apagar** da linha que ficou no lugar (a de baixo; sem ela, a de cima; sem nenhuma, no **Fechar**). Fechar o Gerenciar continua devolvendo o foco ao seletor de perspectivas.
- **Chegada depois de recarregar:** o aviso "Sem referência; foi para a área de chegada." dos Detalhes e a faixa **Área de chegada** deixam de depender da sessão em que a raiz chegou. Passam a ser deduzidos das setas de agora (a raiz tem referência quando uma seta liga um membro dela a um membro de outra raiz): a raiz sem referência mostra o aviso e fica dentro da faixa, a com referência leva só o selo "Veio de X". O `mapping.json` não muda de formato.
