# Flag

Pílula com um fato sobre a linha (`src/ui/review/Flag.tsx`, `.flag` de `src/theme/review.css`): não é interativa e o texto aparece sempre, nunca só o ícone.

- `texto`: o fato ("Nova", "Aplicada", "Conflito", "Trancado", "Envolvida", "junto", "igual na nova"…).
- `tom`: `neutro` (borda `color-border-control`, texto `color-text`), `aviso` (`warning`/`warning-bg`, substituída e conflito), `perigo` (`danger`/`danger-bg`, envolvida e bloqueia aplicar), `ok` (`success`/`success-bg`, aplicada) ou `nova` (`accent` cheio, texto `accent-text`, a proposta que ninguém abriu).
- `icone`: opcional, chave do ícone (12 px) antes do texto (`warning`, `lock`, `link`, `plus`, `minus`, `blocked`).

Altura `size-icon` + 2 = 18 px, respiro de 6 px, `t-micro` (11/16, 600), raio cheio. A largura é a do texto: dê à marcação a largura medida.
