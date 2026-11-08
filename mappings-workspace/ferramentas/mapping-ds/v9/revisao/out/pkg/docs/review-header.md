# ReviewHeader

Cabeçalho do item selecionado nos Detalhes da revisão (`src/ui/review/ReviewHeader.tsx`, `.review-header` de `src/theme/review.css`): caixa `color-bg` com borda de 1 px `color-border`, raio 6, respiro 8 × 12 e 8 px entre as linhas.

**Filhos esperados**, de cima para baixo:
- o estado: DecisionMark, o tipo do item em Texto `t-body-strong` ("Marcação alterada", "Proposta", "Grupo Projeto"…) e as contagens em Texto `t-small` `muted`;
- a decisão: o DecisionControl em texto (Button `accept` "Aceitar marcação" e `reject` "Rejeitar marcação") e o IconButton `note` (`sm`);
- as dicas (Texto `t-small` `muted`), a NoteField, a lista do que é criado ou removido junto e os avisos (Notice `sm`: conjunto inválido, trancado, junto, proposta aplicada ou substituída).
