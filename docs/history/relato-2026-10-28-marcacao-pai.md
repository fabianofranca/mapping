# Relato de teste — Mapping

- Modo: dirigido — lista de passos: R0 e R12.1 a R12.11a (R12.11a inclusa); passada visual: Detalhes, Árvore
- Build id: 5d7ac40 · 2026-10-28
- Canal (como a app mostra): prévia
- Forma de abrir: preview (`https://fabianofranca.github.io/mapping/preview/`); estava em 678f941 · 2026-10-27, atualizado pela faixa **Atualizar** (sem Deploy)
- Navegador e versão: Chrome 155.0.0.0 (extensão Claude in Chrome)
- Sistema operacional: Windows 10/11 x64 (galaxy-book-ff)
- DPR e viewport: DPR 1,375; 998 × 635 (janela restaurada, `resize_window` 1111 × 883)
- Pasta de trabalho: `C:\Users\fabia\mapping-testes\2026-10-28-r12` (clone do branch `epic/marcacao-pai` em `repo/`)
- Ferramenta: agente com extensão do navegador e shell (device_bash); dialog-pilot (versão não informada pela ferramenta; `select_folder` e `open_file` funcionaram); pedidos ao MCP: não usados
- Estado prévio do navegador: projetos pré-existentes (principal, Loja ×4, Telas ×2 e outros de rodadas anteriores); `preview:mapping.reviewResume` com várias entradas "seen" (não mexi)
- MCP: não usado nesta rodada
- Data: 2026-10-27/28
- Tempo por roteiro: R0 ≈ 10 min; R12.1 a R12.11a ≈ 55 min

## Resumo

- Passos: 20 no total (R0: 6; R12.1 a R12.11a: 12; passada visual: 2 linhas). ✅ 19, ❌ 1 (Visual: Detalhes, achado 1, baixa), não executados 0.
- Achados por severidade: bloqueia 0, alta 0, média 0, baixa 1.
- Impede o uso com pessoas? não. O único achado é texto cortado com reticências, sem perda de dado nem de função.
- Regressões fora do alvo: nenhuma. Console sem erros durante toda a rodada.
- Build testado: 5d7ac40 · 2026-10-28 (preview, atualizado pela faixa **Atualizar**).

## Passos

| Passo | Achado de origem | Resultado | Observação |
| ----- | ---------------- | --------- | ---------- |
| R0.1  |                  | ✅ | Configurações › Sobre mostra `5d7ac40 · 2026-10-28`; sem barra horizontal no diálogo; **Ver os atalhos de teclado** abre a Ajuda, Esc fecha e o foco volta ao botão **Configurações** |
| R0.2  |                  | ✅ | Campo "Nome do projeto" vazio (placeholder `fumaca-web`); disco: `mapping.json`, `.gitignore` (`backups/`), `specs/notas/` com 5 arquivos; `select_folder` devolveu `permissionButton: "Permitir"` |
| R0.3  |                  | ✅ | Imagem gravada como `images/cadastro.png` (guia admite `.png`); `revision` 2, 1 container, 1 marcação; fechar volta à inicial sem perguntar; `fumaca-web` no topo com selo **Pasta**. Usei um `cadastro.png` 484 × 450 de rodada anterior (copiado) |
| R0.4a |                  | ✅ | F5 na tela inicial, **Abrir** abriu sem seletor e **sem** pedido de permissão; aba de pé |
| R0.4b |                  | ✅ | Com 716 px de `innerWidth`: só o aviso "Abra numa janela maior"; Delete não excluiu; ao alargar, marcação continua e selecionada; disco com 1 marcação |
| R0.7  |                  | ✅ | Pasta renomeada com `mv` para `fumaca-web-2`; aviso **Pasta indisponível** com o texto esperado; **Localizar pasta…** + `select_folder` abriu; linha mostra `fumaca-web` / `fumaca-web-2`; **Remover da lista** tirou a linha; disco igual (1 container, 1 marcação) |
| R12.1 |  | ✅ | Marcação do canvas (borda tracejada) em volta de A e B; Detalhes: **Container** = `Canvas`, **Pertence a** = `Nenhuma`; Árvore: `Canvas` › `Grupo` › A, B; C fora. Preparo: A, B e C nasceram empilhados (A em cima, B no meio, C embaixo); afastei o C ~110 px do canvas do B |
| R12.2 |  | ✅ | `Grupo`: `containerId` null, `floating` false, `parentId` null, `rect` inteiro (-304, 77, 1593 × 1849); A e B com `parentId` = id do Grupo; C `null`; os três com `scale` 5; sem lista de membros |
| R12.3 |  | ✅ | Arrastei o B para a direita, fora do Grupo: `B.parentId` null, A continua no Grupo; de volta: `B.parentId` = Grupo. Cada soltar = 1 revisão (6→7→8) |
| R12.4 |  | ✅ | `Bola` 60 × 60 em A; ao pousar no B: `containerId` = B, `rect` 70,45, 60 × 60; solta no vazio: `containerId` null, `rect` 350,1920, 300 × 300 (60 × 5); `Ctrl+Z` único devolveu ao B com `rect` 70,45 |
| R12.5 |  | ✅ | Alça inferior esquerda do Grupo arrastada até faltar ~6 px de tela: ao soltar, Grupo cresceu até 2975 (C termina em 2974,44) e C virou membro (`parentId` = Grupo). O `x` do Grupo mudou de -304 para -306 (meu ponteiro saiu 2 px da vertical) |
| R12.6 |  | ✅ | Um `Ctrl+Z` devolveu tamanho do Grupo (-304, 77, 1593 × 1849) e `C.parentId` null juntos; `Ctrl+Shift+Z` trouxe os dois de volta |
| R12.7 |  | ✅ | Confirmação: ""Grupo" será excluída com 0 marcação(ões) interna(s) e 0 anotação(ões)… 3 container(s) dentro dela ficam no canvas."; depois: A, B, C com `parentId` null, Bola ainda no B |
| R12.8 |  | ✅ | `Grupo 2` em volta de A, B, C. Shift+clique: "3 itens selecionados", "3 container(s)", botões **Envolver**, **Trancar**, **Destrancar** (desabilitado), **Excluir**; Shift+clique no B tira (2); na Árvore põe (3) e tira (2); 1º Esc volta só ao principal, 2º limpa |
| R12.9 |  | ✅ | Duplo clique no fundo e menu **Selecionar com o conteúdo**: "5 itens selecionados", "2 marcação(ões)", "3 container(s)" |
| R12.10 |  | ✅ | Arrasto conjunto: A, B, C e Grupo 2 deslocados +382 / +975 por igual, `parentId` mantidos, `rect` da Bola igual; `Ctrl+Z` único voltou ao estado anterior (idêntico). Com B trancado (`Alt+L`): nada se move, **Excluir** desabilitado com a dica "Destranque os itens trancados para excluir" (cursor "não permitido" não verificado). Destrancado e sem o C: A, B e Grupo 2 andaram (+402/+469), C ficou e `C.parentId` virou null por geometria; `Ctrl+Z` único desfez |
| R12.11 |  | ✅ | 1ª confirmação ("Excluir 5 itens?", "2 marcação(ões), 3 container(s) e 0 anotação(ões)"): **Cancelar** não mudou nada (disco igual). 2ª ("Excluir 2 itens?", "3 container(s) dentro dela ficam no canvas"): sem `Grupo 2` nem `Bola`; A, B, C com `parentId` null |
| R12.11a |  | ✅ | **Envolver** criou marcação sem nome, selecionada sozinha, `containerId` null, `floating` false, `rect` -9,116, 1017 × 2867 (8 de margem, arredondada para fora); A, B, C com `parentId` = a marcação; `Ctrl+Z` único: marcação some e os três voltam a `parentId` null |
| Visual: Detalhes |  | ❌ | achado 1. Sem barra de rolagem horizontal em nenhum estado (nada selecionado, container, 2 e 3 itens, marcação; 998 e 911 px). A linha "Nenhuma anotação nesta camada." das camadas fica cortada com reticências a 998 e 911 px |
| Visual: Árvore |  | ✅ | Sem barra horizontal, sem sobreposição; a linha da marcação trunca com reticências a 911 px (nome longo; ver Observações). Fechar pelo X e reabrir pela lateral funcionam; o foco vai para o `body` (comportamento conhecido e pendente do `docs/ROADMAP.md`, registrado como observação) |

## Achados

### 1. Texto cortado com reticências no Detalhes ("Nenhuma anotação nesta camada.")

- Severidade: baixa
- Build id e data: 5d7ac40 · 2026-10-28
- Passos para reproduzir: (1) abrir um projeto em pasta com a biblioteca Notas (todo projeto novo); (2) criar um container e uma marcação nele; (3) com a marcação selecionada, olhar **Anotações** nos Detalhes com a janela entre 900 e ~1000 px de largura (viewport 998 ou 911).
- Esperado: texto sem corte, ou com dica (`title`) com o texto inteiro.
- Observado: em cada linha de camada (**Camada 1**, **Notas**) o texto "Nenhuma anotação nesta camada." aparece como "Nenhuma anota…" (a 911 px, "Nenhum…"), sem `title` nem `aria-label` com o texto inteiro. A 1400 px de viewport o texto cabe. O breadcrumb do cabeçalho do canvas também trunca ("Canvas", "Marcação sem nome") sem dica.
- Reproduziu de novo? sim (vistos em todas as capturas com marcação selecionada, a 998 e a 911 px)
- Anexos: capturas da sessão (não gravadas no disco do computador); `anexos/espaco-mapping-final.json`

## Regressões fora do alvo

- (nenhuma até aqui)

## Observações (sem severidade)

- Console sem erros durante toda a rodada.
- O `placement` dos containers (A, B, C) guarda números de ponto flutuante não inteiros (ex.: `x` -5.68e-14, `y` 2224.44, `x` -0.00078 do B depois de mover). O guia só exige inteiros no `rect` das marcações; registro caso queira arredondar.
- R12.10: o cursor "não permitido" do arrasto com item trancado não foi verificado (só o efeito: nada se move; **Excluir** desabilitado com a dica esperada).
- R12.10: ao tirar o C da seleção e arrastar o Grupo 2, o `C.parentId` virou `null` porque o Grupo 2 deixou de cobri-lo (geometria); o guia só diz "o C fica".
- R12.11a: o `rect` da marcação criada por **Envolver** tem 8 de margem arredondada para fora (x -9 onde A está em ~0, porque o B tinha `x` -0.00078).
- R12.5: o `x` do Grupo mudou de -304 para -306 porque meu ponteiro saiu 2 px da vertical ao arrastar a alça; efeito do teste, não da app.
- Árvore, a 911 px de viewport: o nome "Marcação sem nome" trunca ("Marcação sem n…") quando a marcação está aninhada; é o comportamento esperado de nome longo.
- Fechar Árvore e Detalhes pelo X devolve o foco ao `body` (já conhecido, `docs/ROADMAP.md`, Evoluções). **Configurações** → **Ajuda** → Esc devolveu o foco ao botão **Configurações** (R0.1). Não fiz a volta de foco dos outros diálogos (**Excluir marcação?**, **Excluir N itens?**) porque a lista da passada visual era só Detalhes e Árvore.
- A tela inicial mostra também a entrada "Guia interativo" na lateral (o R0.1 lista Projetos, Ajuda e Configurações).

## O que atrapalhou

- O viewport do Chrome ficou em 998 × 635 (a `resize_window` 1111 × 883 tira ~113 px de moldura; DPR 1,375): os três containers só cabem empilhados em ~16% de zoom e a miniatura cobre o canto inferior direito. Contornei desenhando o Grupo 2 de cima-direita para baixo-esquerda e arrastando o B para a direita (para fora do viewport) no R12.3.
- Não achei como dar zoom: o "−" da barra de status não é botão e `-` não atua; usei **Enquadrar tudo** depois de cada mudança. O preparo do R12 diz "vão de uns 150 px do canvas" entre B e C; obtive ~110 px (suficiente).
- Selecionar um item pela Árvore recentraliza a vista (o zoom foi a 9% no R12.7), então refiz o **Enquadrar tudo** para recalcular as coordenadas.

- A conferência do item 9 do "Primeiros 10 minutos" falhou na primeira leitura (preview em 678f941); resolvido pela faixa **Atualizar**, sem Deploy.
- A pasta `~/mapping-testes` já existia no computador, mas não estava conectada; foi preciso pedir acesso e, depois, permissão de exclusão (o `git clone` deixa `.lock` e falhou na primeira tentativa, sem a exclusão liberada).
- Nenhum PR foi informado: o branch foi clonado de `epic/marcacao-pai` (head = 5d7ac40, o build esperado), em vez de `pull/<n>/head` do guia.
