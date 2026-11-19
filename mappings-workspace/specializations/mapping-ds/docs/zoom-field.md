# ZoomField

Campo de zoom (`src/ui/ZoomField.tsx`, `.zoom-field` em `src/theme/editor.css`): mostra o zoom atual e, ao clicar, volta a 100%. Fica na barra do canvas (28 px, `control-height`) e na barra de status (24 px). Átomo: desenha tudo.

- `valor`: o texto, como o app mostra ("11%", "100%"), em `t-small` `color-text-muted`, centrado.
- Sem fundo nem borda em repouso; largura mínima de 56 px com 8 px de margem lateral, raio 4. O hover (`color-hover`, texto `color-text`) não é desenhado.
