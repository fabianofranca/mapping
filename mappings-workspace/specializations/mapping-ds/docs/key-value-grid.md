# KeyValueGrid

A grade de pares da anotação livre (`src/ui/KeyValueGrid.tsx`, `.grid.kv-grid`). O desenho é a caixa da grade: borda `color-border-control`, raio 4, e a faixa do cabeçalho (`cabecalho` `sim`): 23 px de `color-bg` com a divisória `color-border` embaixo (`.grid-head`).

**Filhos:**

- os títulos das colunas, **Chave** e **Valor** (Texto `t-micro` `muted`: 12 px, peso 600; a coluna da alça e a do menu não têm título);
- cada par é uma linha de 33 px (Caixa com a divisória embaixo, `lados` `baixo`; a última sem): a alça de arraste (Ícone `grip` `muted`), a chave e o valor (Texto `t-body`: o campo na célula não tem fundo nem borda até receber o foco) e o IconButton ⋯ do par;
- embaixo do par que é alvo de uma referência, o link de volta ("← Tabela …", Texto `accent`).

O **+ Par** fica fora da grade, 4 px abaixo (Texto `accent`: no app é um Button com a classe `button-link`, sem fundo nem borda). Sem pares, só ele aparece (a grade some).

Não desenhado: o foco da célula (o campo ganha a borda de controle), a linha arrastada e a linha removida na revisão (riscada).
