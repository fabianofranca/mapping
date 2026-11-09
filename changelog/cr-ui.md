# CR da interface — [Não lançado] (épico `epic/cr-ui`, PR #1236, MCP 0.28.11, schema v18)

## Corrigido

- Diagnóstico: o aviso "Copiado" some depois de 2 segundos e não fica na tela depois de Copiar e Limpar o registro.
- Gerenciar perspectivas, "Quem vê": quando a gravação falha, o seletor volta ao valor da perspectiva (em vez de mostrar "Só eu" com a perspectiva ainda para todos) e a mensagem de erro some na troca seguinte que dá certo.
- Gerenciar perspectivas, renomear: o campo recomeça do nome atual ao cancelar e reabrir, e mostra o nome novo quando ele muda por fora (desfazer, recarga).
- Menu do botão direito, "Enviar para perspectiva": o submenu aberto ao passar o ponteiro fecha ao sair do item, também na Principal, e fechar com ← não faz o próximo clique ou Enter ser ignorado.
- Aviso de nova versão: se o projeto não pôde ser gravado, a app não recarrega mais; o aviso continua e diz que não salvou, e clicar em "Atualizar" de novo tenta gravar outra vez.
- Importar pacote de especialização: o limite de tamanho conta bytes (não caracteres) e é conferido antes de descomprimir cada arquivo do zip e a cada arquivo lido da pasta, parando no primeiro que passa do limite.
- Detalhes da anotação, "Vinculada a": quando o dono gravado deixou de ser válido, o campo mostra o valor real (marcado como dona inválida) em vez de ficar em branco, e a pessoa pode trocá-lo.
- Camadas: com uma perspectiva aberta e o projeto somente leitura (ou em revisão), a caixa de visibilidade de cada camada e "Mostrar todas" ficam desabilitadas, em vez de a caixa trocar sem mudar nada.
- Detalhes do container (sem imagem): o erro de largura, o de altura e o de cor aparecem sob o próprio campo e somem ao selecionar outro container.
- Pares da anotação livre: o erro de um par (e o aviso de campo inválido) fica preso a ele; ao remover uma linha, a mensagem não passa para o par que ocupa o lugar dela.
- Seletor de referência: o trecho buscado é destacado no lugar certo também em textos com letras como "İ".
- Seletor de referência: Enter (com ou sem Alt) só escolhe o alvo; Alt+Enter dentro do seletor não acrescenta mais uma linha vazia à tabela.
- Tabela, "Referências vão quebrar": o nome da linha na confirmação vem sempre da linha atual, também depois de uma recarga externa com o diálogo aberto (antes podia aparecer "Linha 0").
- Comentários, "Apagar conversas…": a data de "Com a última mensagem antes de" vale como meia-noite do seu fuso; a prévia e o apagar usam o mesmo limite (em UTC-3, "antes de 01/11" passa a incluir as mensagens de 31/10 depois das 21h).
- Comentários, campo com citações (@): o campo não anuncia mais atributos que não existem para ele; a lista de opções só é apontada enquanto está aberta.
- Janela Comentários: o nome acessível do botão da conversa diz "(não lida)" quando há mensagem não lida, em português e em inglês.
- Revisão, avisos de dependência: dois avisos que só diferem no outro item envolvido não trocam de lugar quando um deles some.
- Revisão, "Aceitar remove junto": as listas de marcações e de setas que saem com a imagem dizem "e mais N" quando passam de 12, como a de anotações.
- Revisão, Detalhes: clicar no fundo e depois trocar de item por N ou C não leva mais o foco para os Detalhes.
- Revisão, árvore de uma proposta substituída: a lista mede a altura da linha por uma linha de item (não pelo cabeçalho de grupo), e a rolagem e os espaços batem com as linhas.
- Revisão, rodapé de atalhos: passa a ser um grupo nomeado, anunciado por leitor de tela.
- Revisão, árvore: ao abrir uma proposta com a seleção além das primeiras linhas, a lista rola até a selecionada depois da medição; expandir ou recolher um grupo não faz a lista pular de volta.
- Referência quebrada numa célula de tabela: o texto "(referência quebrada)" quebra de linha em vez de aparecer cortado com reticências, a 1280 e a 900 px.
- Guia de testes (R3.14 a R3.17): o script `evolve.py` gera de novo as cópias `mat-v4` a `mat-v7` da biblioteca de exemplo (antes quebrava com `KeyError 'migrations'` e os passos estavam trocados), e o R3.15 diz que o Desfazer volta o `specs/` à versão 4.
