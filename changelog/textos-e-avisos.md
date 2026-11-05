# Textos da interface, linha de aviso e guia acertados — [Não lançado] (épico `epic/textos-e-avisos`, PR #530, MCP 0.16.0, schema v13)

## Corrigido

- Especializações: o texto da biblioteca diz "`formatVersion` 4 em diante", sem versão máxima, em vez de "versão 4 a 7".
- Detalhes da marcação: a dica de Posição e Tamanho depende do espaço. Marcação de container: "Em pixels do container"; marcação do canvas: "Em unidades do canvas" (antes dizia "pixels da imagem original" nos dois casos).
- Linha de aviso dos Detalhes: com a mensagem longa, o ícone fica na coluna da esquerda, alinhado à primeira linha, e a mensagem quebra na própria coluna (antes o ícone ficava sozinho acima dela).
- Aviso de campo vazio: os Detalhes continuam mostrando o aviso de um campo ainda vazio; a ajuda e o `SPEC-FORMAT.md` agora dizem isso, e que a janela Avisos e a contagem só contam o campo com valor.
- Guia de testes (`docs/TESTING.md`): passos e apêndices que não batiam com a app (atalhos do R11.9, **Continuar** no R13.1, Árvore no R14.1, **Envolver** no R12.8, "Adicionar no canvas" no R12.12, apêndices A e B, R18.4 e R18.6), com um teste que confere a lista de atalhos do guia contra as janelas da app.
