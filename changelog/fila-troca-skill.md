# Troca de coordenador por skill novo — [Não lançado] (épico `epic/fila-troca-skill`, PR #0, MCP 0.28.12, schema v18)

## Alterado

- `/implementar-fila`: quando o skill muda na `main`, o coordenador passa a fila para uma sessão nova na primeira conferência (entre etapas ou na conferência de hora em hora), mesmo abaixo de 60% do contexto. Assim a melhoria vale na hora, sem pedido manual. As fases e os testadores que estão rodando não mudam.
