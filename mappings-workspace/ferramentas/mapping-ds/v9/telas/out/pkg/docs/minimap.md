# Minimap

Minimapa no canto de baixo à direita do canvas (`src/ui/Minimap.tsx`, contas em `src/canvas/minimap.ts`, `.minimap` em `src/theme/editor.css`): a visão geral dos containers; clicar move a vista. Desenhado em DOM, sem Konva, numa caixa de no máximo 132 × 96 px, a 8 px das bordas do canvas.

Um tipo, três partes (`parte`), porque as posições são do app e cada peça é uma marcação:

| `parte` | Desenho | No app |
| --- | --- | --- |
| `moldura` | `color-card`, borda `color-border-control` de 1 px, raio 4 | `.minimap` |
| `imagem` | `color-text-muted` a 0,75 (`opacity-ancestor`) | `.minimap-image`, um por container |
| `vista` | `color-selection` com borda `color-accent`, tudo a 0,25 (`opacity-grabbed`) | `.minimap-view`, a área visível |

A moldura é a mãe; as imagens e a vista são filhas, no lugar e no tamanho que o app calcula (a vista cobre o minimapa inteiro quando tudo está à vista). As opacidades são literais: os tokens `opacity-ancestor` e `opacity-grabbed` não estão nos `tokens` da especialização.
