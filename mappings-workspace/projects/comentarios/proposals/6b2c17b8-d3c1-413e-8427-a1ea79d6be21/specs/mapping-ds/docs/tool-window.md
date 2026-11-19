# ToolWindow

Janela de ferramenta encaixada (`src/ui/ToolWindow.tsx`): cabeçalho de 32 px (`size-tw-header`) com o título e as ações, e o corpo com rolagem. Tamanhos em `src/ui/toolWindowLayout.ts` (esquerda 264, direita 360, embaixo 208).

- `titulo`: o título do cabeçalho. Na janela **inferior** (`posicao` `bottom`) o cabeçalho leva as abas no lugar do título; desenhe uma marcação de Tabs sobre ele e deixe o título vazio.
- `posicao`: `left`, `right` ou `bottom` (decide o lado da borda no app; o desenho não traça essa borda).
- `janela`: o identificador da janela (`comments` para a Comentários).
- O corpo é o **slot** *Conteúdo*.
