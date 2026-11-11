# Medida pelo conteúdo no formato 4 — [Não lançado] (épico `epic/medida-conteudo`, PR #1580, MCP 0.35.0, schema v18)

## Adicionado

- Componentes (formato 4): `baselinePadding` (`top` e `bottom`) no nó `text` posiciona o texto pela linha de base, como o `paddingFromBaseline` do Compose, e `layout.align: "baseline"` alinha os filhos de uma `row` (também no `repeat` e no slot, e no Arrumar) pela primeira linha de base. A app e o PNG do MCP desenham a linha de base no mesmo lugar (≤ 0,5 px, em qualquer fonte e zoom). Os medidores de texto passam a informar `firstBaseline`, `lastBaseline` e `lineCount`.
- Componentes (formato 4): `{ "$lines": "<nó text>" }` é o número de linhas medidas de um texto, para a altura depender do conteúdo (o snackbar de 48 ou 68, por exemplo). O motor arruma em duas passagens e avisa `$lines instável: <nó>` quando o número muda de uma para a outra. O `sizing` aceita expressão (`$switch` pelo estilo, `$if` por um campo) que dá px, `fill` ou `hug`, na tela sem geometria, no playground do catálogo e no Arrumar de um componente com slot; valor inválido cai no `size` com um aviso. A prova de desenho do validador da biblioteca também desenha cada caso no tamanho ajustado ao conteúdo (`tamanho ajustado W×H` no aviso).
- Componentes: o **Arrumar** (menu de contexto, botão dos Detalhes e `Alt+Shift+A`) também vale numa marcação de componente sem slot cujo `sizing` depende do conteúdo (`hug` ou expressão): um botão de rótulo longo cresce na altura, com o canto de cima à esquerda no lugar, entre o `minSize` e os limites da raiz, sem passar da imagem; `Ctrl+Z` desfaz numa entrada só. Editar um valor continua sem mudar o retângulo. A instância nova (sem `rect`, na app e no `create_marking` do MCP) já nasce no tamanho medido com o `preview` e os valores dados.
- MCP: a operação `fit_marking` (`marking`) de `plan_changes` e `propose_changes` faz o mesmo ajuste no lote e na proposta; o resumo diz o retângulo antes e depois (ou "nada muda"), e a revisão da proposta mostra o ajuste como a mudança de **Posição**, que dá para aceitar ou rejeitar separada do valor. Erros `not-fittable` e `locked`. O guia dos agentes manda chamá-la depois de mudar um valor que altera o conteúdo de um componente ajustável, também ao revisar uma proposta e ao responder uma conversa.
- Componentes (formato 4): `layout.wrap` (`"wrap"` ou `"wrap-reverse"`) quebra uma fileira em linhas, como o `flex-wrap` do CSS e o `FlowRow` do Compose, com `lineGap` (espaço entre as linhas), `maxPerLine` e `maxLines` (os filhos além da última linha não são desenhados, com o aviso `<n> filhos fora de maxLines: <nó>`). Vale num quadro `row`/`column`, no slot e no `repeat` (as quatro chaves no próprio nó), e `justify`, `reverse` e `align` (inclusive `baseline`) valem em cada linha. No slot, o **Arrumar** põe as marcações filhas em linhas e a filha nova entra na linha seguinte quando não cabe. A app, o visualizador e o PNG do MCP desenham as linhas no mesmo lugar (≤ 0,5 px).

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2.048.000 para 2.064.384, por decisão do dono (2026-11-11), com exceção ao limite de 64 KiB de subidas desde a revisão do orçamento.
- Teto do `dist/index.html` subiu 16 KiB, de 2.064.384 para 2.080.768, pela regra do orçamento.

## Corrigido

- PNG do MCP: o texto cortado de vários parágrafos e o texto mais alto que a caixa (inclusive no `cap-middle`) saem iguais aos da app.
