# Perspectivas — [Não lançado] (épico `epic/perspectivas`, PR #739, MCP 0.26.0, schema v16)

## Alterado

- O `mapping.json` passa à v16: ganha `project.id` (a identidade do projeto, que nunca muda), `perspectives` e `arrivals` (vazias até a primeira perspectiva). Um projeto v15 abre e migra sozinho, e a primeira gravação guarda o backup da v15 em `backups/`.

## Adicionado

- **Perspectivas**: recortes do projeto para públicos diferentes (dev mobile, backend, analytics). Cada perspectiva escolhe quais itens aparecem, onde ficam no canvas e quais camadas se veem; o conteúdo continua o mesmo em todas. A **Principal** sempre existe, mostra tudo e é onde as propostas são aceitas.
- **Seletor de perspectiva** na barra principal, ao lado do nome do projeto, com os grupos **Para todos** e **Só minhas**, **Nova perspectiva…** e **Gerenciar perspectivas…**. A escolha fica guardada neste navegador por projeto.
- **Nova perspectiva** (nome único, começar de outra perspectiva, da Principal ou vazia, quem vê e as camadas) e **Gerenciar perspectivas** (trocar quem vê, renomear, duplicar e apagar). Apagar uma perspectiva não apaga nada do projeto e dá para desfazer.
- **Enviar para perspectiva** e **Tirar desta perspectiva**, no menu do botão direito e na seção **Perspectivas** dos Detalhes. Dentro de uma perspectiva, arrastar um item muda só a posição dele ali; Arrumar, Excluir e desenhar marcação do canvas ficam para a Principal (com a dica "só na Principal").
- **Chegada na Principal**: o que nasce numa perspectiva chega à Principal perto da referência ou na **Área de chegada**, com o selo **"Veio de…"** no canvas e um aviso nos Detalhes com **Dispensar** e **Próximo que veio (N)**. A barra de status conta os itens que vieram de outras perspectivas.
- **Camadas por perspectiva**: a caixa de visibilidade da janela Camadas edita as camadas escondidas da perspectiva aberta. Revisar uma proposta abre a Principal (com o aviso "A revisão mostra a Principal") e trava o seletor.
- Na seção **Ligado por seta**, a outra ponta fora da perspectiva aberta ganha o selo "fora desta perspectiva".
