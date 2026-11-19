# ChangeKind

Selo do tipo de mudança (`src/ui/review/ChangeKind.tsx`, `.change-kind`): neutro, a forma diz o tipo e nunca a cor (verde e vermelho ficam para aceita e rejeitada).

- `tipo`: `criada` (+), `removida` (−), `movida` (⇄), `alterada` (∿) ou `trocada` (imagem trocada, duas molduras).
- Caixa de `size-icon` + 4 = 20 px (`size` `md`) ou + 2 = 18 px (`sm`, nas linhas dos níveis, no popover e em Outras mudanças): borda de 1 px `color-border-control`, raio 4, ícone de 12 px em `color-text` com traço 1,5. O tamanho é o da marcação.
