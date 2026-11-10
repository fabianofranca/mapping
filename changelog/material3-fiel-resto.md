# Material 3 fiel, resto — [Não lançado] (épico `epic/material3-fiel-resto`, PR #0, MCP 0.32.0, schema v18)

## Adicionado

- Formato do componente 4: `font.align: "justify"` justifica o texto na largura da caixa, com a última linha de cada parágrafo à esquerda (o `TextAlign.Justify` do Compose); a app, o visualizador e o PNG do MCP quebram igual. O texto rico (`runs`) ainda desenha à esquerda.
- Formato do componente 4: `over` no `$token` de cor (`{ "$token": "on-surface", "alpha": 0.38, "over": "surface" }`) compõe a cor sobre outra e a entrega opaca (o `compositeOver` do Compose); `over` é o nome de um token de cor ou uma cor literal, e a biblioteca recusa o token desconhecido.
- Formato do componente 4: o nó `image` ganha os `fit` `fill-width`, `fill-height`, `scale-down` e `none` (o `FillWidth`, `FillHeight`, `Inside` e `None` do Compose), na app e no visualizador; o PNG do MCP continua desenhando o reservado da imagem.
- Numa `formatVersion` 1 a 3 cada chave nova é o erro `só é permitido com formatVersion 4`, no caminho dela. A skill `spec-author`, o `docs/COMPONENT-FORMAT.md`, o `docs/component.schema.json` e o `docs/AGENT-GUIDE.md` trazem as chaves e as mensagens.
