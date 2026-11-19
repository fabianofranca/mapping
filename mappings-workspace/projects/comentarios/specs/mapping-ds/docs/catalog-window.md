# CatalogWindow

Conteúdo da janela Catálogo (Ctrl+Shift+9, à esquerda; `src/ui/CatalogWindow.tsx`). É um **agrupador**: no app o `.catalog-window` é só uma coluna com 8 px entre os itens, sem fundo nem borda; a moldura é a da janela (ToolWindow "Catálogo").

**Filhos esperados:** as abas Componentes e Paleta (Tabs com as Abas); na aba Componentes, o Select "Biblioteca" (quando há mais de um pacote aplicado), a validação (Texto `muted`), a busca (TextField), o nome da camada (Texto `t-small` `muted`) e uma linha por componente (Texto; a escolhida tem a Caixa `fundo` `selection`; o ícone de container e o NoticeBadge à direita). A página do componente abre num Dialog `lg` (CatalogPage). Na aba Paleta, a paleta de componentes para arrastar ao canvas.
