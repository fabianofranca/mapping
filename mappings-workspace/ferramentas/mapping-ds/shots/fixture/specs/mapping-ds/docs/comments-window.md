# CommentsWindow

A tabela da janela **Comentários** (`src/ui/comments/CommentsWindow.tsx`, atalho `Ctrl+Shift+0`): todas as conversas do mapeamento, uma por linha.

## O que o desenho mostra

- `resumo`: a linha de contagens ("2 abertas · 1 aguardando agente · 3 resolvidas").
- O cabeçalho **Por · Âncora · Última mensagem · Msgs · Status · Quando**, com as larguras do app (16%, 24%, o resto, 7%, 14%, 9% e a coluna do ⋯).
- `conversas`: uma linha por conversa. `estado` muda o estilo: `naoLida` em negrito, `resolvida` em cinza com a âncora **riscada**, `orfa` com a âncora em `color-warning`. `badge` colore o selo de status: `agente` (aguardando agente, `color-warning`), `humano` (neutro) ou `resolvida` (`color-success`).

## O que fica de fora

Os **filtros** (Status, Usuário, busca e "Citam a seleção") ficam acima da tabela e são controles do DS: desenhe-os como marcações Segmented, Select, TextField e Tags. O ponto de não lida, o estado vazio e a janela só leitura durante a revisão também não são desenhados.

**Texto longo:** o app corta nome, âncora e última mensagem com reticências; o desenho não corta, ele quebra a linha e a linha de 28 px fica pequena. Use textos curtos (cerca de 15 caracteres no nome e 25 na última mensagem, numa janela de 812 px) ou aumente a altura da marcação.
