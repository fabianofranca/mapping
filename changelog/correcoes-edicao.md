# Correções na edição — [Não lançado] (épico `epic/correcoes-edicao`, PR #1113, MCP 0.28.5 sem mudança, schema v18)

## Corrigido

- O campo de texto de várias linhas passa a mostrar o valor atual da anotação: depois de desfazer ou de uma recarga por mudança externa, ele não segue com o texto velho, e sair do campo sem editar não grava o texto velho por cima.
- No campo de texto de várias linhas, o cursor não pula mais para o fim a cada tecla digitada, e o foco não volta ao campo depois de sair dele.
- Os diálogos só fecham com o clique inteiro no fundo: selecionar texto arrastando para fora da caixa e soltar sobre o fundo não fecha mais o diálogo nem descarta o que foi digitado.
- Com uma perspectiva aberta, a caixa de camada da Lista, o "Mostrar a camada" dos painéis da marcação e da seta, "Ir para a anotação" e o chip de citação de camada passam a mudar as camadas escondidas da própria perspectiva (com desfazer), como já fazia a janela Camadas; antes mexiam nas escondidas da Principal e a camada não aparecia.
- Apagar uma conversa que falha ao gravar (permissão ou arquivo alterado por fora) agora mostra o erro: no diálogo de confirmação, que fica aberto, ou como aviso quando a conversa é só sua; antes a conversa continuava na lista sem aviso.
- Um layout de janelas guardado malformado no navegador (por exemplo, a lista de janelas abertas com outro tipo de valor) não deixa mais a app em branco: o campo inválido cai no padrão (Árvore, Camadas e Detalhes).
- Soltar um arquivo fora de onde a app o importa (painéis, tela inicial, canvas somente leitura ou ocupado, revisão de proposta) não faz mais o navegador abrir o arquivo na aba e fechar o editor.
