# Medida pelo conteúdo no formato 4 — [Não lançado] (épico `epic/medida-conteudo`, PR #1580, MCP 0.35.0, schema v18)

## Adicionado

- Componentes (formato 4): `baselinePadding` (`top` e `bottom`) no nó `text` posiciona o texto pela linha de base, como o `paddingFromBaseline` do Compose, e `layout.align: "baseline"` alinha os filhos de uma `row` (também no `repeat` e no slot, e no Arrumar) pela primeira linha de base. A app e o PNG do MCP desenham a linha de base no mesmo lugar (≤ 0,5 px, em qualquer fonte e zoom). Os medidores de texto passam a informar `firstBaseline`, `lastBaseline` e `lineCount`.

## Corrigido

- PNG do MCP: o texto cortado de vários parágrafos e o texto mais alto que a caixa (inclusive no `cap-middle`) saem iguais aos da app.
