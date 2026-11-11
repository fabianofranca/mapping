# Layout alinhado a Flexbox e CSS Grid — [Não lançado] (épico `epic/layout-flex-grid`, PR a abrir pelo coordenador, MCP 0.36.0, schema v18)

## Alterado

- O desenho dos componentes ficou mais rápido ao medir texto repetido: o mesmo texto, com a mesma fonte e o mesmo limite de largura, é medido uma vez só, na app e no servidor MCP (nos 15 componentes do exemplo Material 3, as medidas por instância caíram de 69 para 26). Nenhum desenho muda.
