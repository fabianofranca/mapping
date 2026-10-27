# Relato de teste — Mapping

- Modo: dirigido — lista de passos: R0 e R1.1 a R1.6a. Alvo: épico `epic/selecao-pelo-nome` (PR #237), "clicar no nome do container o seleciona". Passada visual: nenhuma (a mudança é só no canvas).
- Build id: 678f941 · 2026-10-27
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`), aberto pelo link clicado a partir da aba de apoio. O preview estava com outro build (70cc7ee, depois 01b42d1, de outro PR); a execução do Deploy #428 (preview de `epic/selecao-pelo-nome`, disparada pelo bot, não por mim) terminou com sucesso e a faixa **Atualizar** trouxe o 678f941.
- Navegador e versão: Chrome 155.0.0.0
- Sistema operacional: Windows 10/11 (Win64), computador `galaxy-book-ff`
- DPR e viewport: DPR 1,375; 1152 × 635 (janela restaurada em 1280 × 900; a janela veio em 1171 × 494, pequena demais, e foi redimensionada com `resize_window`)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-26-selecao-pelo-nome\`
- Ferramenta: agente com extensão Claude in Chrome e shell (`device_bash`); dialog-pilot (versão não exposta pelas ferramentas: não consegui registrar); pedidos ao MCP: não se aplica nesta rodada
- Estado prévio do navegador: perfil já usado. Projetos na tela inicial antes de começar: Loja/loja-apagar (Pasta), Loja (Neste dispositivo, 2x), Loja/loja (Pasta), Telas/componentes (Pasta), Telas (Neste dispositivo), Lab (Alterações não exportadas, Neste dispositivo). `preview:mapping.reviewResume` não conferido (a chave aparece só como `mapping.reviewResume` com `{"v":2,"seen":[...]}`).
- MCP: não usado nesta rodada
- Data: 2026-10-26 (noite; UTC 2026-10-27)
- Tempo por roteiro: primeiros 10 minutos + espera do Deploy ~20 min; R0 ~25 min; R1.1 a R1.6a ~35 min

## Resumo

- Passos: 13 no total (R0: 6; R1.1 a R1.6a: 7). ✅ 13, ❌ 0, não executados 0.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 0.
- Impede o uso com pessoas? Não. O alvo do épico (R1.6a, clicar no nome do container o seleciona) passou na tela e no disco.
- Alvo do épico `epic/selecao-pelo-nome` (PR #237), R1.6a: ✅. O clique no nome `images/cadastro.webp`, acima do container, seleciona o container (Detalhes mostra `images/cadastro.webp · 484 × 450 px`, alças nos cantos da imagem, breadcrumb "Canvas › images/cadastro.webp"), mesmo com uma marcação cobrindo o container inteiro. O clique no corpo do container seleciona a marcação nova. O desfazer restaura a Árvore e o `parentId` do R1.6.
- Preview e build: o preview não estava com o build esperado ao começar (70cc7ee · 2026-10-24, depois 01b42d1 · 2026-10-27). Precisou do Deploy do branch (#428, já em andamento, disparado pelo bot); depois da faixa **Atualizar**, o build id ficou `678f941 · 2026-10-27`.

## Passos

| Passo | Achado de origem | Resultado | Observação |
| --- | --- | --- | --- |
| R0.1 | | ✅ | Tela inicial com Começar, Novo projeto, Abrir pasta, Abrir zip; lateral com Projetos, Ajuda, Configurações. Sobre mostra `678f941 · 2026-10-27`, sem barra horizontal. **Ver os atalhos de teclado** troca para a Ajuda (Atalhos de teclado) e o **Esc** a fecha, com o foco em **Configurações** (`:focus-visible`). Ver "O que atrapalhou": a primeira medida, feita abrindo o diálogo por `click()` de script, deu foco em "Dispensar"; refeita com clique real do mouse, passou. |
| R0.2 | | ✅ | `select_folder` na pasta `fumaca-web` (permissão: botão "Permitir"). "Criar projeto nesta pasta?" com o campo vazio (placeholder `fumaca-web`); **Criar** abre o editor com "Nenhuma imagem ainda" e **Pasta** na barra. Disco: `mapping.json` (revision 0, 2 camadas, 1 especialização), `.gitignore` com `backups/`, `specs/notas/` com `notas.spec.json`, `components/nota.json`, `components/tabela.json`, `docs/nota.md`, `docs/tabela.md`. |
| R0.3 | | ✅ | `cadastro.png` (484 × 450, gerado com Chromium headless a 1x) adicionado por `open_file`; retângulo desenhado; **Salvo**; Fechar projeto volta à tela inicial sem perguntar e `fumaca-web` fica no topo de Projetos recentes, selo **Pasta**. Disco: `images/cadastro.webp` (13128 bytes), `containers` 1 (484 × 450), `markings` 1 (`rect` 22,133,392,202), `revision` 2. |
| R0.4a | | ✅ | Após F5, **Abrir** na linha abriu o projeto sem o seletor e **sem pedido de permissão** (o navegador já tinha a permissão guardada). A aba continuou de pé. |
| R0.4b | | ✅ | Marcação selecionada; janela estreitada a 734 px de largura útil: só o aviso "Abra numa janela maior… O projeto continua aberto e as alterações continuam sendo salvas."; **Delete** apertado nessa largura. Ao alargar, o editor voltou com a marcação lá e selecionada. Disco: `markings` 1, `revision` 2 (igual). |
| R0.7 | | ✅ | Projeto fechado; pasta renomeada para `fumaca-web-2` pela shell. **Abrir** → "Pasta indisponível" com o texto esperado; **Localizar pasta…** + `select_folder` (fumaca-web-2) abriu o projeto; depois de fechar, a linha mostra `fumaca-web` / `fumaca-web-2`; **Remover da lista** tirou a linha. Disco: `fumaca-web-2` com 8 arquivos (`mapping.json` com 1 container e 1 marcação, `.gitignore`, `specs/notas/` 5 arquivos, `images/cadastro.webp`). |
| R1.1 | | ✅ | Projeto criado na pasta `principal` (select_folder; nome do projeto vazio → `principal`) e `cadastro.png` adicionado por `open_file`. Disco: `images/cadastro.webp`, `containers[0].width` 484 e `height` 450 (iguais ao PNG, 484 × 450). |
| R1.2 | | ✅ | **+** (Nova camada) criou "Camada 3"; renomeada para `Model` (clique, Ctrl+A, texto, Enter). Disco: layers = Camada 1, Notas, Model. |
| R1.3 | | ✅ | `sdui.json` → "\"SDUI\" aplicada: 3 camada(s) criada(s)."; `modelo-de-dados.json` → "\"Modelo de dados\" aplicada: 2 camada(s) criada(s)." Camadas: Componentes, Eventos, Telas, Classes e Endpoints com o selo; nome e selo inteiros, sem cobrir a linha de baixo. Disco: `specs/sdui.json`, `specs/modelo-dados.json`, `specializations` com 3 itens (notas, sdui, modelo-dados). |
| R1.4 | | ✅ | Nome da Componentes: campo desabilitado, com a dica "Camada de especialização: não pode ser renomeada nem excluída. Só dá para remover a especialização."; no ⋮, **Excluir camada** desabilitado com a mesma dica; Esc fecha o menu e o foco volta ao ⋮ (`Mais ações da camada Componentes`, `:focus-visible`). Cor: `#1E88E5` → `#2E7D32` no disco (revision 5 → 6). |
| R1.5 | | ✅ | **Atualizar versão…** do SDUI com o mesmo `sdui.json`: "Nada a fazer: \"SDUI\" já está no projeto na versão 3. O arquivo é a versão 3; só versões maiores atualizam." Nada mudou. |
| R1.6 | | ✅ | Seis marcações (Formulário; Nome, Idade, E-mail e Cadastrar dentro dele; Título fora). Árvore: Formulário com as quatro filhas e Título na raiz. Disco: 6 `markings`; as quatro filhas com `parentId` = id do Formulário e `rect` dentro do dele; X, Y, L e A de Detalhes do Título (28, 58, 287, 48) iguais ao `rect`. |
| R1.6a | épico PR #237 | ✅ | Em **Desenhar**, arrasto de 2 px dentro do canto superior esquerdo até além do canto inferior direito: marcação presa às bordas do container (`rect` x 2, y 3, 482 × 447; `x + width` 484 e `y + height` 450 = largura e altura do R1.1; `containerId` do `cadastro.png`; revision 13). Árvore: "Marcação sem nome" com Formulário (e as quatro filhas) e Título como filhos dela; no disco, Formulário e Título com `parentId` = id da nova. Em **Navegar**: clique no corpo do container, fora de Formulário e Título (fica à direita do Formulário, a 449,193 px da imagem) selecionou a marcação nova (breadcrumb "Marcação sem nome", alças nos cantos dela); clique no nome `images/cadastro.webp` acima do container selecionou o container (Detalhes `images/cadastro.webp · 484 × 450 px`, alças nos cantos da imagem). `Ctrl+Z`: a marcação sumiu (6 `markings`), a Árvore voltou à do R1.6 e Formulário e Título voltaram ao `parentId` anterior (`null`; revision 14). |

## Achados

Nenhum. Todos os passos executados passaram na tela e no disco.

## Regressões fora do alvo

Nenhuma (fora dos passos executados não exercitei outras áreas; o dirigido cobriu só R0 e R1.1 a R1.6a).

## Observações (sem severidade)

- Console durante a rodada: só 7 avisos "Konva warning: The stage has 6 layers. Recommended maximum number of layers is 3-5" (a partir do R0.3, na criação/seleção de marcações); nenhum erro.
- R1.6a: na tela, a borda da marcação nova apareceu contínua (azul quando selecionada); não a comparei com a tracejada do canvas lado a lado nem com zoom (`Ctrl+=`).
- O guia fala em `cadastro.png`; a app mostra o nome do container como `images/cadastro.webp` (o guia já avisa que a extensão pode mudar, seção 4).
- No R1.6a, o clique "no corpo do container" foi num ponto da imagem à direita do Formulário; os dois casos (corpo e nome) foram medidos por breadcrumb, barra de status, Detalhes e alças.
- O preview é um só e estava com o build de outro PR ao começar; o Deploy do branch já estava rodando (#428), então não disparei outro.
- A janela do Chrome veio em 1171 × 494 e deixava o canvas com 326 × 55 px (Árvore + Detalhes + painel inferior abertos). Redimensionei para 1280 × 900 e fechei o painel inferior e a Árvore para ter canvas útil (estado de janelas gravado no `localStorage` do preview).

## O que atrapalhou

- R1.6a: o canvas com Árvore + Detalhes abertos fica pequeno demais para o arrasto de canto a canto (cerca de 330 px de largura). Fechei Árvore e Detalhes só para desenhar e cliquei em seguida; abri de novo para conferir pela Árvore e por Detalhes. O guia não diz nada sobre isso e a ordem das janelas muda as coordenadas.
- R1.6a: o "nome `cadastro.png`" fica acima do container, fora da marcação nova; vale dizer no passo que o clique é no rótulo `images/cadastro.webp` (o nome do container na tela).
- Para ler "Formulário e Título passam a ser filhos dela" no disco, o `name` da marcação nova é `null` (Marcação sem nome); um script que imprime o nome do pai mostra `None` e parece que não houve reparent. Conferir pelo `id`/`parentId`.
- O dialog-pilot não expõe a versão pelas ferramentas; registrei "não informada".
- O preview é um só: ao começar, estava com o build de outro PR; o Deploy do branch já estava em andamento (#428), então só esperei e atualizei pela faixa.
- Abrir um diálogo com `click()` por script (`javascript_tool`) não move o foco; o "foco volta ao botão que abriu" do R0.1 só se mede com clique real. Resultado do R0.1 depende disso.
- O quadro de coordenadas do `computer` (1152 × 635) não é o da captura reduzida (0.6x); errei um clique por usar a escala errada (sem efeito, não repeti).
- O guia assume que o Chrome tem uma janela de tamanho útil; aqui foi preciso `resize_window` antes do R0.3.
