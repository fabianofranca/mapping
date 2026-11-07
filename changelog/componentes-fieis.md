# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`, PR #786, MCP 0.28.0, schema v18)

## Adicionado

- Formato 4 do componente, com `stroke.cap` (ponta do traço), `stroke.join` (canto) e `stroke.sides` (traço só em alguns lados de um quadro ou retângulo).

## Alterado

- O recorte da raiz do componente passa a incluir o traço `outside`/`center` e a sombra (em todas as versões do formato).
- O raster do MCP (`get_marking_image`) passa a respeitar a ponta, o canto e os lados do traço.

## Corrigido

- O anel `outside` do traço na raiz do componente, que não aparecia.
