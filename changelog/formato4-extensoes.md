# Formato 4: extensões baratas — [Não lançado] (épico `epic/formato4-extensoes`, PR #1343, MCP 0.29.0, schema v18)

## Adicionado

- Formato do componente 4: `font.verticalAlign: "cap-middle"` centra o texto pela altura da maiúscula (da primeira linha à base da última), na app e no visualizador, em texto simples, com `maxLines` e com `runs`. O `middle` não muda. Em versões 1 a 3 o literal é erro.
- Formato do componente 4: `$token` de número em `shadow.x`, `shadow.y` e `shadow.blur` e em cada item da lista de `cornerRadius`, e `stroke.dash` por expressão (`$switch`/`$if`/`$field`) com `$token` de número nos itens; valor resolvido inválido dá o aviso `valor inválido em shadow.blur` ou `valor inválido em stroke.dash` e vale 0 ou nenhum tracejado.
- Formato do componente 4: `layout.justify` ganha `space-around` e `space-evenly`, e `layout.reverse` inverte a ordem dos filhos no eixo principal (o `start` vira o fim), em quadro, slot e arrumação de tela.
- Formato do componente 4: `alpha` no `$token` de cor (`{ "$token": "scrim", "alpha": 0.32 }`) multiplica o alfa da cor; `alpha: 0` é a parada transparente de um degradê.
- Formato do componente 4: `stroke.offset` (px ≥ 0, literal ou `$token`) afasta o traço da forma, em `frame`, `rect` e `ellipse`; a cena e o recorte ampliado da raiz já o contam (o desenho vem na fase seguinte do épico).

## Alterado

- O PNG do MCP (`render_marking`, `render_container` e o `get_marking_image` de container sem arquivo) centra o `font.verticalAlign: "cap-middle"` pela altura da maiúscula da fonte (`sCapHeight`), igual à app, em texto simples, com várias linhas e com `runs`; o `middle` não muda. Sem fonte (barras), o `cap-middle` já não cai no topo.

## Corrigido
