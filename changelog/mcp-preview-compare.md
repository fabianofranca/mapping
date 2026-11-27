# Preview and compare a library — [Não lançado] (épico `epic/mcp-preview-compare`, PR #3041, MCP 0.65.0, schema v25 unchanged)

## Adicionado

- As fontes (`fonts`) de uma biblioteca que um lote ou uma proposta aplica ou atualiza medem e desenham o texto no preview de `render_container` e `render_marking`, antes de aplicar (#2928).

## Alterado

- O aviso do preview "as fontes da biblioteca só contam depois de aplicada" saiu; uma fonte declarada que o pacote não traz dá um aviso com o caminho dela e é desenhada com a fonte embutida (#2928).
