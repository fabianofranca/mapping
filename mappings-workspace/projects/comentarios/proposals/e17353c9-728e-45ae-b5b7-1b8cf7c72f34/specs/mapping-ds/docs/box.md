# Caixa

Região desenhada só com tokens, para o que não é componente: a barra principal, a faixa lateral, a barra do canvas, uma linha de tabela, uma divisória, o fundo de uma linha selecionada.

- `fundo`: `surface`, `bg`, `canvas` (`color-canvas-bg`), `hover`, `pressed`, `selection`, `selection-muted`, `warning-bg`, `danger-bg`, `success-bg`, `accent`, `tooltip` ou `nenhum`.
- `borda` e `lados`: a cor (`border` é a divisória, `control` a borda de controle) e se vale nos quatro lados ou só em um (`cima`, `baixo`, `esquerda`, `direita`).
- `raio`: `xs` 2, `sm` 4, `md` 6, `lg` 8, `xl` 12, `full`. `sombra` `popup`: a sombra de menus e diálogos.

Uma divisória é uma Caixa de 1 px de altura com `fundo` `nenhum` e `lados` `cima`.
