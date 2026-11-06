# Referência como URL — 2026-11-06 (épico `epic/referencia-url`, PR #622, MCP 0.21.0, schema v14)

## Alterado

- Referências `mapping://` são só uma URL válida: `mapping://<projeto>/<m|i|a|p>/<código>`, com o `<projeto>` codificado por porcentagem (`Meu Projeto (v2)` vira `Meu%20Projeto%20%28v2%29`) e nada depois do código. A cópia da app (`Ctrl+C` e o botão da referência) e todas as respostas do MCP (itens, propostas e o `detail` do `image-overlap`) deixam de trazer o caminho legível entre parênteses; os campos à parte com nome ou caminho (`name`, `from`/`to` das setas) continuam como estavam.
- Referências antigas, com o caminho entre parênteses ou o projeto sem codificar, não valem mais: o MCP responde `invalid-ref` com uma `hint` que diz o formato aceito e manda copiar de novo na app. As formas curtas (`m/3f2a9c1e` com `project`, só o código e o id completo) continuam.
