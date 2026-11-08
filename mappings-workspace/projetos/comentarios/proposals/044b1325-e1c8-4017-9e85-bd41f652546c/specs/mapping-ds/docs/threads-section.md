# ThreadsSection

Seção **Conversas** dos Detalhes (`src/ui/comments/ThreadsSection.tsx`): cabeçalho com o título e o botão **Nova**, e a lista de conversas do item.

`conversas` traz uma linha por conversa: `iniciais` do autor, `assunto`, `onde` ("em Button › variante", quando a conversa não é do próprio item), `mensagens` ("3 mensagens") e se está `naoLida` (assunto em negrito) ou `selecionada` (fundo `color-selection`).

A conversa aberta (`ThreadView`) e o estado vazio com o compositor não são desenhados aqui: use as marcações ThreadMessage e Composer.
