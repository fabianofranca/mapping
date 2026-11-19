# ToolWindow

Moldura da janela de ferramenta encaixada (`src/ui/ToolWindow.tsx`): fundo `color-surface`, a divisória `color-border` do lado que toca o canvas e o cabeçalho de 32 px com o título (o título vem da janela, por isso é campo dela). Tamanhos em `src/ui/toolWindowLayout.ts`: esquerda 264, direita 360, embaixo 208.

**Tudo o que fica dentro é marcação filha:** as ações do cabeçalho e o fechar (IconButton), as abas da janela inferior (Tabs) e o conteúdo. Na janela inferior (`posicao` `bottom`) o título não aparece: o cabeçalho é das abas.
