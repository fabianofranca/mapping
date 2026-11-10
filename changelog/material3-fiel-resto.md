# Material 3 fiel, resto — [Não lançado] (épico `epic/material3-fiel-resto`, PR #1513, MCP 0.32.0, schema v18)

## Adicionado

- Formato do componente 4: `font.align: "justify"` justifica o texto na largura da caixa, com a última linha de cada parágrafo à esquerda (o `TextAlign.Justify` do Compose); a app, o visualizador e o PNG do MCP quebram igual. O texto rico (`runs`) ainda desenha à esquerda.
- Formato do componente 4: `over` no `$token` de cor (`{ "$token": "on-surface", "alpha": 0.38, "over": "surface" }`) compõe a cor sobre outra e a entrega opaca sobre uma base opaca (o `compositeOver` do Compose; base translúcida passa o alfa dela); `over` é o nome de um token de cor ou uma cor literal, e a biblioteca recusa o token desconhecido.
- Formato do componente 4: o nó `image` ganha os `fit` `fill-width`, `fill-height`, `scale-down` e `none` (o `FillWidth`, `FillHeight`, `Inside` e `None` do Compose), na app e no visualizador; o PNG do MCP continua desenhando o reservado da imagem.
- Formato do componente 4: `shadow` aceita uma lista de 1 a 4 sombras (a primeira fica por cima, como o `box-shadow` do CSS) e ganha `spread` (px, literal ou `$token`, negativo encolhe; os raios crescem junto). A app, o visualizador e o PNG do MCP desenham todas; o aviso "só a primeira sombra externa" deixou de existir, e o recorte ampliado da raiz conta o `spread` e todas as sombras.
- Formato do componente 4: `stroke.gap` (`{ "node": "<nome>", "padding": 4 }`, em `frame` e `rect`) abre um vão no contorno com cantos arredondados onde a caixa do nó nomeado o cruza, como o contorno do `OutlinedTextField` sob o rótulo; na app, no visualizador e no PNG do MCP.
- Numa `formatVersion` 1 a 3 cada chave nova é o erro `só é permitido com formatVersion 4`, no caminho dela. A skill `spec-author`, o `docs/COMPONENT-FORMAT.md`, o `docs/component.schema.json` e o `docs/AGENT-GUIDE.md` trazem as chaves e as mensagens.

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 1.966.080 para 1.982.464 bytes, pela regra do orçamento.
