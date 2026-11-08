# DiffValue

Os valores de um campo alterado (`src/ui/review/DiffValue.tsx`, `.diff-value` de `src/theme/review.css`), no ChangePopover: uma linha por valor, sem vermelho nem verde.

- `linhas` (tabela): uma linha por valor, com `tipo`, `rotulo` e `valor`.
  - `antes` (o valor atual, que sai): texto `color-text-muted` em `color-bg`.
  - `depois` (o proposto): peso 600 em `color-selection`.
  - `atual` (o valor de agora, no conflito): fundo `color-warning-bg` com borda `color-warning` e o ⚠ antes do rótulo.
  - `igual`: sem fundo, `color-text-muted`.
- Rótulo em `t-small` `color-text-muted` numa coluna de 72 px (`3 × space-6`), 8 px até o valor, 2 px entre as linhas; o valor em `t-code` (12/18, mono) numa pílula de raio 4 com respiro 2 × 6 (22 px de altura).

Não desenhado: o negrito só no número que muda (na Posição, `x 392 → 404`), a quebra de um valor longo (o app quebra em qualquer ponto e corta em 6 linhas no popover; o desenho mostra uma linha) e as linhas de tabela (`ol`) de um campo `table`.
