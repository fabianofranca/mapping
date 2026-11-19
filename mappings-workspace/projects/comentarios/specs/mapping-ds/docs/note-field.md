# NoteField

Nota para o agente (`src/ui/review/NoteField.tsx`, `.review-note-field`): no cabeçalho do item (a nota do item) e no popover de uma mudança (a nota da mudança). Grava ao sair do campo; texto vazio apaga a nota. É **estrutural**: coluna com 4 px entre as linhas, sem fundo nem borda.

**Filhos esperados:** o TextField de várias linhas (`linhas` `varias`, 2 linhas, `placeholder` "Ex.: a posição antiga estava certa.") e a dica "Grava ao sair do campo." (Texto `t-small` `muted`); numa nota que veio de uma mudança retirada, antes, o Texto "Da mudança retirada: …".
