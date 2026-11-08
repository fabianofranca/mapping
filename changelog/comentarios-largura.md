# Janela Comentários na largura — [Não lançado] (épico `epic/comentarios-largura`, PR #0, MCP 0.28.2 sem mudança, schema v18)

## Alterado

- A janela inferior (**Comentários**, **Lista**, **Incompletas**, **Avisos**, **Diagnósticos**, **Propostas**) abre mais alta (360 px, antes 208 px): a 900 × 720 a **Comentários** mostra 4 linhas inteiras da lista, com filtros e cabeçalho. A altura que você arrastou antes continua valendo.
- No filtro **Usuário** da janela **Comentários**, a primeira opção é "Todos" (antes "Todos (n)"); as opções de pessoa seguem com a contagem de conversas.

## Corrigido

- A janela **Comentários** cabe na largura em que está: sem barra de rolagem horizontal e com o menu ⋯ de cada linha inteiro e clicável (é o caminho de **Apagar**), de 887 px até a janela estreita de 900 × 720 com Árvore, Camadas e Detalhes abertos.
- O selo de status (**Aguardando humano** e os outros) fica dentro da célula, com reticências e o rótulo na dica quando falta espaço, e a coluna **Status** ficou mais larga; a célula do **Quando** também corta com reticências.
- Em janela estreita (abaixo de 640 px de largura da janela), **Msgs** e **Quando** somem e **Por** mostra só o avatar, com o nome na dica; Âncora, Última mensagem, Status e o ⋯ continuam.
