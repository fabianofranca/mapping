# CanvasMarking

A marcação como o canvas a desenha (`src/canvas/renderers/markings.ts`, cores em `src/canvas/theme.ts`): contorno branco (`cv-line`) com halo e a etiqueta do nome (`cv-name-tag`, `cv-name-tag-text`). Não é um componente Preact.

- `nome`: o texto da etiqueta.
- `fundo` `canvas`: pinta o retângulo com `color-canvas-bg`. É um recurso deste desenho para mapear a **área do canvas**; a app não tem esse fundo na marcação.

Seleção (`cv-select`), áreas de absorção e marcação do canvas tracejada (`cv-canvas-marking`) não são desenhadas.
