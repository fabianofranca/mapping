# Janela Comentários na largura — 2026-11-08 (épico `epic/comentarios-largura`, PR #885, MCP 0.28.2 sem mudança, schema v18)

## Alterado

- A janela inferior (**Comentários**, **Lista**, **Incompletas**, **Avisos**, **Diagnósticos**, **Propostas**) abre mais alta (360 px, antes 208 px): a 900 × 720 a **Comentários** mostra 4 linhas inteiras da lista, com filtros e cabeçalho. A altura que você arrastou antes continua valendo.
- No filtro **Usuário** da janela **Comentários**, a primeira opção é "Todos" (antes "Todos (n)"); as opções de pessoa seguem com a contagem de conversas.

## Corrigido

- A janela **Comentários** cabe na largura em que está: sem barra de rolagem horizontal e com o menu ⋯ de cada linha inteiro e clicável (é o caminho de **Apagar**), de 887 px até a janela estreita de 900 × 720 com Árvore, Camadas e Detalhes abertos.
- O selo de status (**Aguardando humano** e os outros) fica dentro da célula, com reticências e o rótulo na dica quando falta espaço, e a coluna **Status** ficou mais larga; a célula do **Quando** também corta com reticências.
- Em janela estreita (abaixo de 640 px de largura da janela), **Msgs** e **Quando** somem e **Por** mostra só o avatar, com o nome na dica; Âncora, Última mensagem, Status e o ⋯ continuam.
- A faixa de abas da janela inferior cabe inteira a 900 × 720 (a primeira aba, **Lista**, não é mais cortada nem a faixa rola): a contagem das abas ficou mais justa.
- A 900 × 720 a janela **Comentários** mostra de fato 4 linhas inteiras da lista, também com âncoras longas quebradas em duas linhas: no layout estreito os filtros ficam em duas linhas de duas (**Status** e **Usuário**; busca e **Citam a seleção**) em vez de quatro empilhados.
- Na aba **Resolvidas** (e em **Todas**), a âncora da conversa resolvida aparece riscada e em cinza; antes o texto continuava sublinhado e escuro.
- Na janela **Comentários**, o ponto de "não lida" fica na mesma linha da âncora (que corta com reticências): todas as linhas têm a altura de uma linha e as 4 linhas aparecem inteiras a 900 × 720, também com 4 conversas.
