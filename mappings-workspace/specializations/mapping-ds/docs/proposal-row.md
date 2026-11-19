# ProposalRow

Linha da lista de propostas, na janela Propostas (`src/ui/review/ProposalRow.tsx`, `.proposal-row` de `src/theme/review.css`): flex que quebra (as contagens e a ação descem em janela estreita), respiro 6 × 12, 6 px na vertical e 12 na horizontal entre os blocos, divisória de 1 px `color-border` embaixo.

**Filhos esperados:**
- o DecisionMark do conjunto (16 px);
- o título (Texto `t-body-strong` com reticências) e a Flag do status (`nova` "Nova", `ok` "Aplicada", `aviso` "Substituída", neutra "Em revisão" ou "Retirada");
- o contexto "origem · autor · data" (Texto `t-small` `muted`, com reticências);
- as contagens (coluna de 236 px): DecisionMark de 12 px + número, para sem decisão, aceitas e rejeitadas; ou "N mudança(s) aplicada(s)" (Texto `muted`);
- a ação: Button "Revisar" (`primary` na proposta nova), "Continuar" ou "Ver".

O hover (`color-hover`) não é desenhado.
