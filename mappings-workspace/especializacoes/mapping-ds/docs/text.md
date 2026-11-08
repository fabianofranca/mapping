# Texto

Primitivo para todo texto solto da interface: título de janela ou de seção, rótulo, nome do autor, texto de mensagem, célula de tabela, item da barra de status. O texto de um controle (Button, TextField, Select…) continua sendo campo do próprio controle.

- `estilo`: um estilo de `src/theme/tokens.ts`: `t-display` (20/28, 600), `t-title` (15/22, 600), `t-heading` (13/20, 600), `t-body` (13/20), `t-body-strong` (13/20, 600), `t-small` e `t-label` (12/16), `t-micro` (11/16, 600), `t-code` (12/18, monoespaçada) e `t-kbd` (11/16).
- `cor`: `text`, `muted`, `accent`, `danger`, `warning`, `success` ou `accent-text`.
- `alinhamento` e `decoracao` (`line-through` para o riscado, `underline`).

Uma linha (`quebra` `não`, o padrão) fica centralizada na altura da marcação e não quebra: o que passa da largura é recortado ou, com `reticencias` `sim`, termina em "…" (o `text-overflow: ellipsis` do app: árvore, caminho, tabela, assunto da conversa). Dê à marcação a largura da caixa onde o app corta. Um parágrafo (`quebra` `sim`, o texto de uma mensagem) quebra na largura e começa no topo. Não há componente de código: no app é texto dentro de um elemento com a classe do estilo.
