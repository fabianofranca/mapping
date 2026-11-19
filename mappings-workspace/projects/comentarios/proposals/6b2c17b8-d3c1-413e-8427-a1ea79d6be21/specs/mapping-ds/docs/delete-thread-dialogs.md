# DeleteThreadDialogs

Diálogos de apagar conversa (`src/ui/comments/useDeleteThread.tsx`) e de apagar em lote (`src/ui/comments/BulkDeleteDialog.tsx`).

- **Apagar a conversa?** abre quando há mensagem de outra pessoa ou de agente; lista quantas mensagens vão embora e de quem, e avisa que não dá para desfazer. Conversa só da própria pessoa é apagada direto.
- **Apagar conversas** (em lote): *Só as resolvidas* (marcado), *Com a última mensagem antes de* e a contagem ("2 conversas serão apagadas."). Os critérios são marcações Choice.

O desenho é o texto do conteúdo, para ir dentro de um Dialog.
