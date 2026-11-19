# CommentsWindow

O conteúdo da janela **Comentários** (`src/ui/comments/CommentsWindow.tsx`, `Ctrl+Shift+0`). O desenho é só o fundo; tudo é filho:

- **Filtros** (`.list-filters`, 4 × 12 px, divisória embaixo): Segmented de status (Todas, Abertas, Aguardando agente, Aguardando humano, Resolvidas), Select de usuário, TextField de busca e Chip (Tags) **Citam a seleção**.
- **Resumo**: Texto `t-small` ("2 abertas · 1 aguardando agente").
- **Cabeçalho** (28 px, Texto `t-small` `muted`): Por (16%), Âncora (24%), Última mensagem, Msgs (7%, à direita), Status (14%), Quando (9%) e a coluna do ⋯.
- **Linhas** (Caixa com divisória embaixo): Iniciais `tabela` e Texto do nome; âncora (riscada e cinza na resolvida, `warning` na órfã); última mensagem; contagem; Selo de status; quando; IconButton `more`. A não lida é `t-body-strong`.
