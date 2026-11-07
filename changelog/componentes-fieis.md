# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`, PR #786, MCP 0.28.0, schema v18)

## Adicionado

- Formato 4 do componente, com `stroke.cap` (ponta do traço), `stroke.join` (canto) e `stroke.sides` (traço só em alguns lados de um quadro ou retângulo).
- `repeat.distribute` (formato 4): com `"fill"`, a lista ocupa o espaço do pai e as linhas dividem a altura (ou a largura) por igual, menos os `gap`s.
- Expressão em `layout.type`, `layout.align`, `layout.justify`, `width` e `height` (formato 4), em quadro e em slot; um valor fora do conjunto vale o padrão e o desenho avisa `valor inválido em <chave>: <valor>`.
- `minWidth`, `maxWidth`, `minHeight` e `maxHeight` em qualquer nó (formato 4): o `fill` que bate no limite congela e a sobra vai para os outros `fill`, como no flexbox; `min` maior que `max` é erro de validação.
- Aviso `texto medido com largura 0: <nó>` na prova de desenho do `validate_library` e no desenho do componente.

## Alterado

- O recorte da raiz do componente passa a incluir o traço `outside`/`center` e a sombra (em todas as versões do formato).
- O raster do MCP (`get_marking_image`) passa a respeitar a ponta, o canto e os lados do traço.

## Corrigido

- O anel `outside` do traço na raiz do componente, que não aparecia.
- Um texto `fill` numa coluna `hug` quebrava palavra por palavra (letra a letra, com largura 0). Agora o conteúdo é medido em duas passagens, como o flexbox (em todas as versões do formato): o texto quebra em linhas de palavras e o quadro tem a altura delas.
