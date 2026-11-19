# ChangeMark

Marcador de um campo alterado, nos Detalhes da revisão e em Outras mudanças (`src/ui/review/ChangeMark.tsx`, `.change-mark` de `src/theme/review.css`). É um botão: abre o ChangePopover (pelo hover, foco ou clique) e, focado, recebe os atalhos A, R e Backspace.

- `tipo`: o glifo do ChangeKind à esquerda (`criada`, `removida`, `movida`, `alterada`, `trocada`), ícone de 12 px com traço 1,5.
- `estado`: a forma do DecisionMark à direita (`sem-decisao`, `aceita`, `rejeitada`), 12 px.
- `conflito` `sim`: o glifo vira ⚠ e a peça fica em `color-warning`/`color-warning-bg`.
- `junto` `sim`: o glifo vira o elo (decidida junto, pelas dependências).
- `parte` `sim`: parte de uma criação ou remoção inteira: só o tipo, em `color-text-muted`, com a borda tracejada (18 × 18).
- `aberto` `sim` (popover aberto): fundo `color-selection` e borda `color-accent`; `alvo` `sim` (a mudança selecionada na janela Propostas): borda `color-accent`.
- `invalido` `sim`: o anel de 2 px `color-danger` por fora.

Medidas: altura `size-icon` + 2 = 18 px, respiro de 2 px, 2 px entre os ícones, borda de 1 px `color-border-control`, raio 4, fundo `color-surface`. O hover (`color-hover`) e o anel de foco não são desenhados. O tracejado da parte é aproximado (3 3; o app usa o `dashed` do navegador).
