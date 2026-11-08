# DataGrid

A grade do campo `table` nos Detalhes (`src/ui/TableField.tsx`, `.grid.data-grid`). O desenho é a caixa da grade, igual à da KeyValueGrid: borda `color-border-control`, raio 4, e a faixa do cabeçalho (`cabecalho` `sim`, 23 px de `color-bg` e a divisória `color-border`).

**Filhos:**

- os títulos (Texto `t-micro` `muted`): **#** e um por coluna, com " *" na obrigatória;
- cada linha (Caixa com a divisória embaixo; a última sem): a alça (Ícone `grip`), o número (Texto `t-small` `muted`, à direita), uma célula por coluna e o IconButton ⋯ da linha. A célula é o controle da coluna sem moldura: Texto `t-body` (string e número: o campo na célula não tem fundo nem borda até o foco), Segmented (enum curto), Select `sm` ou **RefCell** (coluna `ref`). A linha tem 33 px com campos de texto e 35 com o Segmented;
- em cima da grade, fora dela, o cabeçalho do campo: o rótulo (Texto `t-micro` em `text`), o HelpTip, a contagem ("5 linhas", Texto `t-small` `muted`) e o **+ Linha** (Texto `accent`; no app, Button `button-link`).

A grade larga rola por dentro (as colunas têm no mínimo `size-grid-col-min`): a marcação é a caixa visível, e a célula cortada pela rolagem não vira marcação.

A **Lista em tabela** (`src/ui/ListView.tsx`) usa a mesma grade; não foi conferida nesta medição.
