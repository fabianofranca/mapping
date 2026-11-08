# NoticesView

Conteúdo da janela Avisos (Ctrl+Shift+8, embaixo; `src/ui/NoticesView.tsx`, `.list-view` e `.list-filters` em `src/theme/panels.css`): os avisos (`notices`) das especializações aplicadas, agrupados por aviso, do mais grave ao menos. A moldura é a divisória `color-border` de 1 px sob a barra de filtros, que tem 38 px (4 px de margem em cima e embaixo do Segmented); o fundo é o da janela (ToolWindow, `posicao` `bottom`). Se a janela for estreita e os filtros quebrarem linha, a barra cresce e o desenho não acompanha.

**Filhos esperados:**

- na barra, com 12 px de margem lateral e 16 px entre eles: o Segmented do tipo (Opções "Todos 21", "Obsoleto 5"…), os Choices "Só avisos em uso" e "Só camadas visíveis";
- a tabela: o cabeçalho (Marcação, Camada, Anotação, Valor; Textos `t-small` `muted`) e, por grupo, a linha de cabeçalho (NoticeBadge, o lugar em Texto `t-body-strong`, o escopo, a mensagem, "Desde…" e "N anotação(ões)") e uma linha por anotação afetada (o caminho da marcação, a camada com o ponto, o título da anotação e o valor).

Sem avisos, só a mensagem "Nenhuma especialização aplicada tem avisos." (Texto `muted`). A aba com a contagem é uma Aba da janela inferior.
