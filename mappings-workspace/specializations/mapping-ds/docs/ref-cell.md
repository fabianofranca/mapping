# RefCell

A célula de uma coluna `ref` numa tabela (`src/ui/RefCell.tsx`, `.ref-field.ref-cell`, dentro da DataGrid): a versão compacta do ReferenceField. O alvo é **dado**: nenhuma seta é desenhada.

O desenho é o controle (`.ref-control`), igual ao do ReferenceField sem a camada: 24 px, centrado, fundo `color-bg`, borda de controle, raio 4, o ícone e o texto do alvo com reticências. Ele termina 30 px antes da direita: ali fica o IconButton **Limpar** (`close`, 28 px), **marcação filha**. Clicar abre o RefPicker compacto; Ctrl+clique vai ao alvo.

`estado`: `valor` (`arrowRight` `accent` e o rótulo do alvo), `vazio` ("Escolher…" com `search`, `muted`), `quebrado` ("(referência quebrada)" em `warning`, peso 600, borda `warning`) e `invalido` (borda `danger`).
