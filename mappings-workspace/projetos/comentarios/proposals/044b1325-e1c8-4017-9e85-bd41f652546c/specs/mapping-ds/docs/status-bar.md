# StatusBar

Barra de status do editor (`src/ui/StatusBar.tsx`): 26 px, borda de cima `color-border`, texto de 12 px em `color-text-muted`.

- `esquerda`: salvamento, destino e "não exportado".
- `conversas`: o item **N conversas abertas · M aguardando agente**, em `color-accent` com o ícone de conversa; clicar abre a janela Comentários.
- `direita`: seleção, cursor, zoom, schema, canal e build.

O campo de zoom e o item do modo de visualização não são desenhados.
