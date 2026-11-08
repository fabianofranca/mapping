# TreeRow

Linha da Árvore de marcações (janela Árvore, Ctrl+Shift+1; `src/ui/MarkingTree.tsx`, `.tree-row` em `src/theme/panels.css`). Desenha **só a moldura**: 28 px de altura (`size-row`), raio 6 (`radius-md`), na largura da árvore, com o fundo do estado:

| `estado` | Fundo | Quando |
| --- | --- | --- |
| `normal` | nenhum | a linha comum (o hover `color-hover` não é desenhado) |
| `atual` | `color-accent` | o item selecionado; o texto, o ícone e o chevron ficam em `color-accent-text` |
| `selecionada` | `color-pressed` | os outros itens de uma seleção múltipla |

**Filhos esperados**, com 2 px entre eles e o recuo de 16 px por nível (4 px + 16 × profundidade): o chevron de abrir e recolher (Ícone `chevronDown`/`chevronRight` num quadrado de 24 px, ou nada numa folha); o ícone do item (Ícone `arrow` na seta); o nome (Texto `t-body`, `t-body-strong` no container; `reticencias` `sim` quando corta); os pontos das camadas (Caixas de 8 × 8 px, raio `full`, borda `control`), encostados à direita do nome; e, na linha atual, com o mouse ou trancado, o cadeado (Ícone `lock`/`unlock`) e o menu ⋯ (IconButton `sm`).

A cor de cada ponto é a da camada (dado do projeto): a Caixa aproxima pela cor do tema mais próxima.
