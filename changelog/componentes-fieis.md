# Componentes fiéis — [Não lançado] (épico `epic/componentes-fieis`, PR #786, MCP 0.28.0, schema v18)

## Adicionado

- Formato 4 do componente, com `stroke.cap` (ponta do traço), `stroke.join` (canto) e `stroke.sides` (traço só em alguns lados de um quadro ou retângulo).
- `repeat.distribute` (formato 4): com `"fill"`, a lista ocupa o espaço do pai e as linhas dividem a altura (ou a largura) por igual, menos os `gap`s.
- Expressão em `layout.type`, `layout.align`, `layout.justify`, `width` e `height` (formato 4), em quadro e em slot; um valor fora do conjunto vale o padrão e o desenho avisa `valor inválido em <chave>: <valor>`.
- `minWidth`, `maxWidth`, `minHeight` e `maxHeight` em qualquer nó (formato 4): o `fill` que bate no limite congela e a sobra vai para os outros `fill`, como no flexbox; `min` maior que `max` é erro de validação.
- `font.wrap` (`"word"` ou `"none"`, uma linha só), `font.ellipsis` (`…` no texto que não cabe) e `font.maxLines` (formato 4); o raster do MCP e a medida aproximada respeitam as três.
- Texto rico (formato 4): o nó `text` aceita `runs` no lugar de `text`, uma lista de trechos com peso, itálico, cor, decoração, família e tamanho próprios, que quebram linha juntos como um texto só. Um trecho com `background`, `radius` e `padding` vira uma caixa em linha (o chip): inquebrável, vai inteira para a linha de baixo quando não cabe e acompanha o texto. A app desenha o texto rico; o MCP (`get_marking_image`) mostra por enquanto barras por pedaço e o fundo do chip.
- Aviso `texto maior que a caixa: <nó>` (as linhas quebradas passam da altura do nó e nada as corta), que entra na pendência "o componente não cabe".
- Aviso `texto medido com largura 0: <nó>` na prova de desenho do `validate_library` e no desenho do componente.

## Alterado

- O recorte da raiz do componente passa a incluir o traço `outside`/`center` e a sombra (em todas as versões do formato).
- O raster do MCP (`get_marking_image`) passa a respeitar a ponta, o canto e os lados do traço.

## Corrigido

- A verificação "o componente não cabe" ganha tolerância de 1 px por nó de texto: um excesso de fração de pixel entre o DOM e o canvas já não vira pendência.
- Altura de linha do canvas igual à do DOM (conferida no Chromium): `lineHeight` em px não arredonda e o múltiplo não arredonda antes de multiplicar pelas linhas.
- O anel `outside` do traço na raiz do componente, que não aparecia.
- Um texto `fill` numa coluna `hug` quebrava palavra por palavra (letra a letra, com largura 0). Agora o conteúdo é medido em duas passagens, como o flexbox (em todas as versões do formato): o texto quebra em linhas de palavras e o quadro tem a altura delas.
