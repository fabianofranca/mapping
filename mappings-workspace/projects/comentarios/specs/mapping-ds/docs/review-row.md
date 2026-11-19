# ReviewRow

Linha dos níveis da revisão, na janela Propostas (`src/ui/review/ReviewRow.tsx`, `.review-row` de `src/theme/review.css`): grade de três colunas (nome, mínimo 208 px; resumo até 232 px; decisão, 60 px) com 8 px entre elas, 28 px de altura (`row-height`), respiro lateral de 8 px e raio 4.

- `selecionada` `sim`: fundo `color-selection` (o rótulo vai a 600).
- `invalida` `sim` (faz parte do conjunto que bloqueia Aplicar): fundo `color-danger-bg` com a barra de 2 px `color-danger` à esquerda.

**Filhos esperados:** o chevron (Ícone `chevronDown`/`chevronRight` `muted`; recuo de 16 px por nível), o DecisionMark, o ChangeKind (`sm`), o rótulo (Texto), os sinalizadores (Flag), o resumo (contagens com DecisionMark de 12 px, ou "antes → depois" em Texto `t-code` `muted`) e o DecisionControl (dois IconButton `sm` `accept`/`reject`). O hover (`color-hover`) não é desenhado.
