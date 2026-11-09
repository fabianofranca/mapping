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
