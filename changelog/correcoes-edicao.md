# Correções na edição — [Não lançado] (épico `epic/correcoes-edicao`, PR #1113, MCP 0.28.5 sem mudança, schema v18)

## Corrigido

- O campo de texto de várias linhas passa a mostrar o valor atual da anotação: depois de desfazer ou de uma recarga por mudança externa, ele não segue com o texto velho, e sair do campo sem editar não grava o texto velho por cima.
- No campo de texto de várias linhas, o cursor não pula mais para o fim a cada tecla digitada, e o foco não volta ao campo depois de sair dele.
- Os diálogos só fecham com o clique inteiro no fundo: selecionar texto arrastando para fora da caixa e soltar sobre o fundo não fecha mais o diálogo nem descarta o que foi digitado.
- Com uma perspectiva aberta, a caixa de camada da Lista, o "Mostrar a camada" dos painéis da marcação e da seta, "Ir para a anotação" e o chip de citação de camada passam a mudar as camadas escondidas da própria perspectiva (com desfazer), como já fazia a janela Camadas; antes mexiam nas escondidas da Principal e a camada não aparecia.
