# Medida pelo conteúdo no formato 4 — [Não lançado] (épico `epic/medida-conteudo`, PR #1580, MCP 0.35.0, schema v18)

## Adicionado

- Componentes (formato 4): `baselinePadding` (`top` e `bottom`) no nó `text` posiciona o texto pela linha de base, como o `paddingFromBaseline` do Compose, e `layout.align: "baseline"` alinha os filhos de uma `row` (também no `repeat` e no slot, e no Arrumar) pela primeira linha de base. A app e o PNG do MCP desenham a linha de base no mesmo lugar (≤ 0,5 px, em qualquer fonte e zoom). Os medidores de texto passam a informar `firstBaseline`, `lastBaseline` e `lineCount`.
- Componentes (formato 4): `{ "$lines": "<nó text>" }` é o número de linhas medidas de um texto, para a altura depender do conteúdo (o snackbar de 48 ou 68, por exemplo). O motor arruma em duas passagens e avisa `$lines instável: <nó>` quando o número muda de uma para a outra. O `sizing` aceita expressão (`$switch` pelo estilo, `$if` por um campo) que dá px, `fill` ou `hug`, na tela sem geometria, no playground do catálogo e no Arrumar de um componente com slot; valor inválido cai no `size` com um aviso. A prova de desenho do validador da biblioteca também desenha cada caso no tamanho ajustado ao conteúdo (`tamanho ajustado W×H` no aviso).

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2.048.000 para 2.064.384, por decisão do dono (2026-11-11), com exceção ao limite de 64 KiB de subidas desde a revisão do orçamento.

## Corrigido

- PNG do MCP: o texto cortado de vários parágrafos e o texto mais alto que a caixa (inclusive no `cap-middle`) saem iguais aos da app.
