# ReviewBar

Faixa do modo revisão, logo abaixo da barra principal (`src/ui/review/ReviewBar.tsx`, `.review-bar` de `src/theme/review.css`): 40 px (`size-stripe`), fundo `color-selection`, divisória de 1 px `color-accent` embaixo, respiro 0 8 0 12, 12 px entre os blocos.

**Filhos esperados** (marcações):
- o selo **REVISÃO** (`.review-badge`): Caixa `fundo` `accent`, `raio` `xs`, 20 px de altura, com o Ícone `proposal` e o Texto `t-micro` em `accent-text`;
- o título (Texto `t-body-strong`, com reticências) e a origem (Texto `t-small` `muted`);
- o progresso (`.review-progress`, 120 × 6): Caixa `surface` com borda `control` e raio cheio, e as partes aceitas e rejeitadas em Caixas `success-bg`/`danger-bg` (a Caixa não tem o verde nem o vermelho cheios do app);
- as contagens: DecisionMark + número (Texto `t-body-strong`) + rótulo (Texto `t-small` `muted`), e o ⚠ dos conflitos;
- as ações: Button Rejeitar tudo, Aceitar tudo, Aplicar aceitas · N (`primary`) e Sair da revisão (`ghost`). Abaixo de 1200 px o lote vira um menu "Em lote" e as contagens ficam só com o ícone.
