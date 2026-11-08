# Janela Comentários na largura — [Não lançado] (épico `epic/comentarios-largura`)

## Pendências

- **Guia `CommentsWindow`** (CL1, #802): a coluna do ⋯ tem o tamanho do botão (`--control-height` mais `--space-1` de cada lado, sem o padding da célula); o selo de status e a célula do Quando cortam com reticências (o selo leva `title` com o rótulo); a coluna Status passa a 19%. Layout estreito: abaixo de 640 px de largura da janela (container query `comments-window` no contêiner da lista) Msgs e Quando somem (cabeçalho e células) e Por mostra só o avatar, com o nome no `title`.
- **Token `size-tw-bottom`** (CL2, #815): de 208 px para 360 px, a altura inicial das janelas inferiores (critério: 4 linhas inteiras da lista da Comentários, com filtros e cabeçalho, a 900 × 720; `size-tw-bottom-review` não muda).
- **Guia `CommentsWindow`, filtro Usuário** (CL2, #815): a primeira opção é "Todos" / "Everyone", sem número; as opções de pessoa e de agente mantêm a contagem de conversas.
- **Guia `CommentsWindow`, filtros no layout estreito** (CL3, #887): abaixo de 640 px de largura da janela os filtros viram uma grade de 2 colunas (Status | Usuário, busca | Citam a seleção), cada controle com 100% da coluna.
- **Guia `BottomTabs`/`Tabs`, contador** (CL3, #887): na janela inferior o `tab-badge` leva `padding: 0 --space-1` e a margem esquerda do contador e do alerta cai para `--space-0-5` (a faixa de 6 abas cabe a 900 px com folga).
- **Guia `CommentsWindow`, linha resolvida** (CL4, #918): o botão da âncora (`.comments-anchor-button`) herda a cor atenuada (`--color-text-muted`) e `text-decoration: line-through` (antes ficava sublinhado e escuro).
- **Guia `CommentsWindow`, célula da âncora** (CL5, #921): o botão da âncora e o ponto de não lida ficam num contêiner `.comments-anchor-line` (`display: flex`, `align-items: center`); a âncora encolhe (`flex: 0 1 auto`, `min-width: 0`) com reticências e o ponto não encolhe (`flex: none`), então toda linha tem a altura de uma linha.

## Sincronização

Ainda não aplicada (aplicada no fechamento do épico).

## Ficou sem gravar

Nada.
