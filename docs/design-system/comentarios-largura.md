# Janela Comentários na largura — [Não lançado] (épico `epic/comentarios-largura`)

## Pendências

- **Guia `CommentsWindow`** (CL1, #802): a coluna do ⋯ tem o tamanho do botão (`--control-height` mais `--space-1` de cada lado, sem o padding da célula); o selo de status e a célula do Quando cortam com reticências (o selo leva `title` com o rótulo); a coluna Status passa a 19%. Layout estreito: abaixo de 640 px de largura da janela (container query `comments-window` no contêiner da lista) Msgs e Quando somem (cabeçalho e células) e Por mostra só o avatar, com o nome no `title`.
- **Token `size-tw-bottom`** (CL2, #815): de 208 px para 360 px, a altura inicial das janelas inferiores (critério: 4 linhas inteiras da lista da Comentários, com filtros e cabeçalho, a 900 × 720; `size-tw-bottom-review` não muda).
- **Guia `CommentsWindow`, filtro Usuário** (CL2, #815): a primeira opção é "Todos" / "Everyone", sem número; as opções de pessoa e de agente mantêm a contagem de conversas.

## Sincronização

Ainda não aplicada (aplicada no fechamento do épico).

## Ficou sem gravar

Nada.
