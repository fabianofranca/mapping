# Formato 4: extensões baratas — 2026-11-10 (épico `epic/formato4-extensoes`, PR #1343, MCP 0.29.0, schema v18)

## Adicionado

- Formato do componente 4: `font.verticalAlign: "cap-middle"` centra o texto pela altura da maiúscula (da primeira linha à base da última), na app e no visualizador, em texto simples, com `maxLines` e com `runs`. O `middle` não muda. Em versões 1 a 3 o literal é erro.
- Formato do componente 4: `$token` de número em `shadow.x`, `shadow.y` e `shadow.blur` e em cada item da lista de `cornerRadius`, e `stroke.dash` por expressão (`$switch`/`$if`/`$field`) com `$token` de número nos itens; valor resolvido inválido dá o aviso `valor inválido em shadow.blur` ou `valor inválido em stroke.dash` e vale 0 ou nenhum tracejado.
- Formato do componente 4: `layout.justify` ganha `space-around` e `space-evenly`, e `layout.reverse` inverte a ordem dos filhos no eixo principal (o `start` vira o fim), em quadro, slot e arrumação de tela.
- Formato do componente 4: `alpha` no `$token` de cor (`{ "$token": "scrim", "alpha": 0.32 }`) multiplica o alfa da cor; `alpha: 0` é a parada transparente de um degradê.
- Formato do componente 4: `stroke.offset` (px ≥ 0, literal ou `$token`) afasta o traço da forma, em `frame`, `rect` e `ellipse`; a app, o visualizador e o PNG do MCP desenham o anel afastado da forma (raio + `offset`), e o recorte ampliado da raiz o conta.

## Alterado

- O PNG do MCP (`render_marking`, `render_container` e o `get_marking_image` de container sem arquivo) centra o `font.verticalAlign: "cap-middle"` pela altura da maiúscula da fonte (`sCapHeight`), igual à app, em texto simples, com várias linhas e com `runs`; o `middle` não muda. Sem fonte (barras), o `cap-middle` já não cai no topo.
- A biblioteca Material 3 (Compose) sobe para a versão 5 (aditiva: troca o desenho, sem mudar campo nem migração) e deixa os paliativos: a sombra, os raios por canto (o `text-field` e o `dropdown-menu` filled, o `slider`, o `bottom-sheet` e o `navigation-drawer`) e o `y`/`blur` leem tokens; o véu do `carousel` é um degradê de `scrim` com `alpha` 0 a 0,32; o `badge` deixa a altura fixa; `SpaceAround`/`SpaceEvenly` e o `reverseLayout` dos tipos de layout viram `space-around`/`space-evenly` e `layout.reverse`. Com `interaction: "focused"`, o `chip`, o `card` (filled e elevated), o `list-item`, o `search-bar`, o `switch`, o item selecionado do `dropdown-menu` e o do `navigation-drawer` ganham o anel de foco (3 em `secondary`, afastado 2, por fora da caixa).
- Na biblioteca Material 3 (Compose), os rótulos de uma linha (botões, `extended-fab`, `chip`, `tabs`, `segmented-button`, `navigation-*`, `badge`, a ação do `snackbar` e do `alert-dialog`, `tooltip`, `dropdown-menu`, rótulo e valor do `text-field` e do `secure-text-field`, `list-item`, `search-bar`, `top-app-bar`, os dias e números do `date-picker` e do `time-picker`) passam a `font.verticalAlign: "cap-middle"`: o centro da letra cai no centro da caixa, na app e no PNG do MCP, em qualquer fonte (o `Text` do Compose centra pela caixa de linha da fonte; com a Roboto as duas coincidem a menos de 1 px). Parágrafos e texto de várias linhas ficam como estavam.

## Corrigido

- Na app, o `font.verticalAlign: "cap-middle"` deixava o texto cerca de meia unidade (2 a 3 px de tela a 420%) abaixo do centro, porque o navegador devolve as medidas da fonte arredondadas ao pixel nos tamanhos pequenos; as medidas agora saem de um tamanho grande, e o centro bate com o do PNG do MCP.
- A prova de desenho do `validate_library` roda cada caso em cada modo da especialização, com os tokens do modo resolvidos (o tamanho e a família vêm do token, não do padrão de 14 px), e o aviso cita o modo (`…, modo dark, …`; o que vale em todos os modos sai uma vez, sem modo); sem `tokens`, a mensagem não muda.
- `font.wrap: "none"` sem `ellipsis` numa caixa de largura fixa recorta a linha por pixel na caixa (a letra que passa sai cortada no meio, como `white-space: nowrap; overflow: hidden`), com `align` `left`, `center` e `right`, na app e no PNG do MCP; antes o Konva tirava a letra inteira.
- Uma linha de texto só quebra quando passa da caixa por mais de 0,5 px (uma folga única, no motor, no medidor do Konva e no desenho): a última palavra deixa de cair para a linha de baixo por uma fração de pixel, e um parágrafo com a largura medida do DOM quebra nas mesmas palavras.
- `stroke.sides` com os quatro lados desenha o contorno inteiro com o raio dos cantos, igual ao `sides` ausente (antes eram quatro linhas retas).
- `layout.reverse` vale também ao criar uma instância num componente com slot: a primeira filha vai para o fim do eixo e as seguintes ficam antes da última (antes seguiam a ordem direta, à direita ou abaixo da última).
- Na biblioteca Material 3 (Compose), `Top` (`LazyColumn`) e `Start` (`LazyRow`) explícitos com `reverseLayout` mantêm o bloco no começo do eixo; o campo `verticalArrangement`/`horizontalArrangement` deixa de ter padrão (vazio = o padrão do Compose, que com `reverseLayout` é `Bottom`/`End`).
- Fluxo de entrega: o teto do `dist/index.html` sobe 16 KiB (de 1.933.312 para 1.949.696 bytes), uma vez, porque a correção do `layout.reverse` na colocação passou do orçamento por 163 bytes.
- Uma cor de token em hex com 5 ou 7 dígitos (`#12345`, `#1234567`) deixa de valer como cor (antes passava na validação e o `alpha` do `$token` era ignorado em silêncio, pintando a cor opaca); só 3, 4, 6 e 8 dígitos são cor.
- O servidor MCP só lê as medidas da maiúscula da fonte quando o texto usa `cap-middle` (antes lia em todo texto de cada render).
