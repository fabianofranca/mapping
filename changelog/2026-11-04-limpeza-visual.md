# Limpeza visual — 2026-11-04 (épico `epic/limpeza-visual`, PR #451, MCP 0.13.0, schema v13)

## Alterado

- As explicações deixam de ocupar linhas de texto na tela e passam a ser um ícone de ajuda (ⓘ) com dica: a descrição de cada campo, a do tipo da anotação (ao lado do nome do tipo), o "Vinculada a" e o aviso da trava da seta e da marcação (ao lado do cadeado, inclusive quando a trava vem de um pai trancado). A dica aparece com o mouse e com o foco do teclado; Enter a fixa e Esc a fecha. Para leitor de tela, cada ícone tem o nome "Sobre …" e o texto como descrição, e o campo passa a ter a explicação como descrição acessível. Erros, pendências e avisos de estado (como o dono vazio) continuam visíveis.
- O container deixa de ser marcado pela pílula "Container" e passa a ter um ícone discreto (uma moldura sem o **+**, sem borda) na lista do Catálogo, no título da página do componente e na paleta da Biblioteca. A palavra "Container" fica na dica (mouse e teclado) e no nome acessível. As listas do Catálogo e da paleta também deixam de mostrar o tamanho padrão (L × A); ele continua no diálogo de novo container e no Experimentar da página do componente.

## Corrigido

- O Esc que fecha a dica de ajuda (ⓘ) fecha só a dica: não limpa mais a seleção (os Detalhes continuam abertos) nem fecha o diálogo em volta. Depois de um Esc, Enter ou clique no ícone reabre a dica (antes ela ficava invisível com `aria-expanded="true"`). O ícone de **Posição / Tamanho** dos Detalhes da revisão passa a se chamar "Sobre Posição / Tamanho" (antes "Sobre ").
- Nos Detalhes da revisão, "Posição" e "Tamanho" não quebram mais letra a letra: a coluna do rótulo ganha a largura do ícone de ajuda e o rótulo nunca quebra no meio da palavra, a 900 e a 1280 px, com ou sem o marcador de campo alterado.
- Na paleta da Biblioteca, o nome do tipo (por exemplo `LazyColumn`, `HorizontalPager`) fica inteiro na linha, com reticências se não couber, e o ícone de container fica ao lado dele, não numa segunda linha.
- O container (imagem) trancado trata a trava como a marcação e a seta: some o quadro "Trancada: …" embaixo do cabeçalho e entra o ícone "Sobre a trava" ao lado do cadeado. Na seta trancada, o ícone e o cadeado ficam juntos em qualquer largura (a 1280 e 1600 px o ícone ia para a linha do título).
- Os documentos do Catálogo passam a entender a citação (`> texto`): vira bloco de citação em vez de mostrar o sinal `>` solto (por exemplo, nas notas do `code` do **Button**).
- O Esc agora esconde a dica de um botão também quando o foco é de teclado (antes só sumia com o ponteiro sobre ele): vale para o ícone de ajuda (ⓘ) e para as dicas dos botões; Enter, clique ou o ponteiro a reabrem.
- Na paleta da Biblioteca, o rótulo do botão Adicionar ("Adicionar na tela …", "Adicionar no canvas") deixa de ser cortado dos dois lados e passa a terminar em reticências quando não cabe.
- Nos Detalhes da revisão a 900 px, os campos de X, Y, L e A deixam de cortar os dígitos (menos respiro lateral nos campos).
