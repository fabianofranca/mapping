# Histórico — Etapa 6, correções da primeira rodada de testes (seção do antigo PLAN.md)

> Fases 6.1 a 6.7 concluídas (PRs #108 a #113 e o da 6.7; o plano entrou no #107). Referência atual: [`../TESTING.md`](../TESTING.md) (guia do testador), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../MCP.md`](../MCP.md) e [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md) (MCP 0.3.2) e o [`README.md`](../../README.md). Ao lado ficam o relato que originou a etapa ([`relato-2026-10-11.md`](relato-2026-10-11.md)) e os prompts: [`etapa-6-coordenador.md`](etapa-6-coordenador.md) (coordenador de agentes) e [`etapa-6-testes-cowork.md`](etapa-6-testes-cowork.md) (testador no computador do dono, para a segunda rodada em diante).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da 6.7, marcados ao fechar a etapa, e o caminho do prompt do coordenador, que saiu de `docs/prompts/`. Depois dela vêm o fechamento (o que valeu das decisões a confirmar e as decisões consolidadas dos PRs) e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 6: correções da primeira rodada de testes

### Objetivo

Corrigir o que a **primeira rodada de testes reais** encontrou (relato do agente do Cowork em 2026-10-11, build `5e78241`, 77 passos, 15 achados; o relato fica em `docs/history/relato-2026-10-11.md`) e fechar as lacunas do guia que a rodada expôs, para a segunda rodada e o uso real correrem sobre uma app que não perde o aviso de exportação, detecta alteração externa mesmo com a gravação em erro, revisa uma importação nova com a Árvore funcionando e reabre projetos de pasta com um clique. Nenhuma funcionalidade nova além dos **recentes de pasta** (6.6), pedida pelo dono por reduzir o custo de cada rodada.

Dos 15 achados, o 1 (deploy que não publicava) já foi corrigido na própria rodada (#105). Os demais entram aqui, mais os pontos de "O que atrapalhou" do relato.

### Decisões

- **Mesmas regras da etapa 5**: teste primeiro (o commit do teste que reproduz o achado vem antes do da correção), um PR por fase, gates antes do PR, sem mudar o schema v8 nem o formato da proposta. A única mudança de comportamento do MCP (6.3) sobe a versão para 0.3.2.
- **Exportar é "exportado" só quando gravou** (achado 7). Onde o navegador oferece `showSaveFilePicker` (Chrome e Edge), o zip é gravado pelo handle e o aviso **Alterações não exportadas** só sai depois do `close()`; cancelar não muda nada. Onde não oferece, o `<a download>` continua e o aviso sai como hoje, com o texto do diálogo avisando que, se cancelar o salvamento, precisa exportar de novo. `navigator.share` só marca exportado quando a promessa resolve.
- **Erro de gravação não cega a app** (achado 8). Com `saveStatus === 'error'`, a conferência periódica passa a olhar o disco; se o arquivo mudou por fora, abre "Projeto alterado fora da app" (sem recarregar sozinha, porque há pendência). `busy` fica só para gesto em andamento ou gravação em curso.
- **Geometria igual não é mudança** (achado 14): `setMarkingRect`, `moveMarking` com deslocamento zero e redimensionar sem alteração devolvem o projeto como está, sem checar a trava, sem entrada de desfazer e sem índice novo. Vale para a app e para o `update_marking` do MCP, então a reexportação completa de um projeto com itens trancados passa.
- **Proposta aplicada não muda de status ao ser substituída** (achado 13): é histórico. A nova proposta aponta `supersedes`; a app mostra na antiga "Aplicada · substituída por <título>" com **Abrir a nova**, derivado do `supersedes` da nova, e o `AGENT-GUIDE.md` passa a dizer isso em vez de "a anterior passa a `superseded`" (que continua valendo só para proposta aberta).
- **Comparação entre propostas sem `source`** (achado 15): `compareProposals` casa por `source`, depois pelo id da entidade, depois pelo caminho legível (imagem › pai › nome) para criações. O aviso `superseded-incomplete` passa a contar certo.
- **Recentes de pasta** (6.6): o handle da pasta fica no IndexedDB da app (nome, data do último uso), nunca o caminho; um clique pede a permissão e abre. A lista da tela inicial fica **única**, ordenada por último uso, com o selo Pasta ou Neste dispositivo. "Permitir em todas as visitas" é do navegador: a app só documenta.
- **Tooltips** (achado 2): o texto continua no DOM, para o nome acessível, mas um tooltip oculto não ocupa espaço nem rola o contêiner. Nenhum `.editor` nem diálogo rola na horizontal.

### Execução por um coordenador de agentes

Mesmo desenho da etapa 5; o prompt do coordenador está em `docs/history/etapa-6-coordenador.md` (modelo e esforço por fase, execução completa, parcial, paralela ou sequencial). Regras:

1. **Uma fase = um branch + um PR**, `claude/etapa-6-<n>-<assunto>`. O executor recebe só a sua fase e não mexe em arquivos de outra fase da mesma onda (exceção: `src/i18n/pt-BR.ts` e `en-US.ts`).
2. **Ondas** (arquivos disjuntos dentro de cada uma; releia esta seção na `main` antes de abrir cada onda):
   - **Onda 1:** 6.1 (exportação), 6.3 (modelo e MCP), 6.4 (interface), 6.5 (revisão).
   - **Onda 2:** 6.2 (depende da 6.4, por `Dialog.tsx`) e 6.6 (depende da 6.1, por `controller.ts`).
   - **Onda 3:** 6.7 (guia, prompt do Cowork e fechamento; depende de todas, porque descreve os comportamentos novos).
3. **Gates antes de abrir o PR:** `npm run lint && npm run typecheck && npm test && npm run build` (e `npm run build:mcp` na 6.3). O coordenador confere `check` e `e2e` verdes.
4. **Descrição do PR** com Resumo, Como testar (só desktop) e Decisões tomadas; checkboxes da fase marcados neste `PLAN.md` no mesmo PR.
5. **Decisões pequenas** o executor toma e documenta; ambiguidade que mude comportamento visível vira pergunta no PR e o coordenador decide ou escala ao dono.
6. **Com o dono:** criar a tag `mcp-v0.3.2` depois do merge da 6.3; disparar o deploy de preview quando quiser ver um branch publicado.
7. **Aceite** de cada fase é o descrito nela; sem o teste que reproduz o achado, o PR volta.

### Fases

#### 6.1 — Exportar só é "exportado" quando gravou

**Achado 7 (alta).** `ExportDialog` chama `markExported()` logo depois de disparar o download por `<a download>`; o navegador não avisa se a pessoa cancelou o "Salvar como", e o aviso **Alterações não exportadas** some sem nada ter sido salvo. Num projeto neste dispositivo esse aviso é a única proteção contra perda.

**Toca em:** `src/app/ExportDialog.tsx`, `src/storage/share.ts`, `src/app/controller.ts` (só `markExported` e o que a exportação chama), `src/i18n/*`, `tests/components/*` do diálogo de exportação, `tests/app/controller.test.ts`, `tests/e2e/flows.spec.ts`, `docs/ARCHITECTURE.md` (parágrafo da exportação).

- [x] Teste que reproduz: com `showSaveFilePicker` simulado devolvendo `AbortError`, hoje `unexported` vira `false`
- [x] `storage/share.ts` ganha `saveFileWithPicker(file)`: `showSaveFilePicker` com nome sugerido e tipo zip, grava pelo `createWritable`, devolve `saved | cancelled`; detecta o recurso em runtime
- [x] `ExportDialog`: **Baixar** usa o seletor quando existe e chama `markExported()` só em `saved`; em `cancelled` nada muda e o aviso continua; sem o recurso, `<a download>` + `markExported()` como hoje, com a linha de texto avisando que cancelar o salvamento exige exportar de novo
- [x] `navigator.share`: `markExported()` só quando a promessa resolve (cancelar o compartilhamento rejeita com `AbortError`)
- [x] Testes: cancelado mantém o aviso; salvo limpa; sem o recurso o comportamento antigo continua; e2e cobre o caminho com o seletor simulado

**Aceite**: R1.22 e R2.3 do `docs/TESTING.md` com um cancelamento no meio mantêm **Alterações não exportadas**; a exportação continua compatível com a CSP e com `file://`.

#### 6.2 — Alteração externa detectada mesmo com a gravação em erro

**Achados 8 (média) e 9 (baixa).** `idle()` em `src/store/session.ts` exige `saveStatus === 'saved'`, então com a gravação em erro `sync()` devolve `busy` e nunca olha o disco: quem edita por fora enquanto o arquivo está travado só descobre ao clicar em **Tentar de novo**. O **X** do diálogo "Projeto alterado fora da app" aparece e não faz nada (o comentário do código diz que ele não deveria existir).

**Toca em:** `src/store/session.ts` (`idle`, `sync`), `src/app/useExternalChanges.ts`, `src/app/EditorDialogs.tsx`, `src/ui/Dialog.tsx` (opção sem botão de fechar), `src/i18n/*`, `tests/store/externalChanges.test.ts`, `tests/store/session.test.ts`, `tests/components/*` do diálogo, `docs/ARCHITECTURE.md` (parágrafo "Revisão e mudanças externas").

- [x] Teste que reproduz: `saveStatus` em `error`, arquivo alterado por fora, `sync()` devolve `busy` e `conflict` continua `null`
- [x] `sync()` com `saveStatus === 'error'`: confere o disco; se o texto difere do conhecido, abre `conflict` (sem recarregar sozinho); `busy` só com gesto em andamento ou gravação em curso
- [x] Diálogo "Projeto alterado fora da app" sem o X: `Dialog` ganha `closable={false}` (sem botão e sem Esc), usado só aqui e no "Sair da revisão?" se couber
- [x] Testes: o diálogo abre em até um ciclo de `sync` com a gravação em erro; **Recarregar** e **Manter as minhas** continuam funcionando a partir desse estado; sem X no DOM

**Aceite**: R6.10 do guia passa a observar o diálogo em ~3 s (o guia é ajustado na 6.7); `tests/e2e/folder.spec.ts` continua verde.

#### 6.3 — Modelo e MCP: geometria igual, comparação de propostas, substituição de aplicada

**Achados 14, 15 (médias) e 13 (média, decisão).** `setMarkingRect`/`moveMarking` chamam `requireUnlocked` antes de comparar a geometria, então o `update_marking` de uma reexportação completa falha inteiro se houver um item trancado, mesmo sem mover nada. `compareProposals` só reconhece criações com `source`, e o aviso `superseded-incomplete` conta como "ausentes" itens que a nova proposta repete. `supersedeProposal` só muda proposta `open`, mas o `AGENT-GUIDE.md` promete que "a anterior passa a `superseded`".

**Toca em:** `src/model/markings.ts`, `src/model/proposalCompare.ts`, `mcp/batch.ts` (só o caso `update_marking`, se precisar), `mcp/proposals.ts` (texto da resposta `superseded`), `mcp/version.ts`, `docs/AGENT-GUIDE.md`, `docs/PROPOSAL-FORMAT.md`, `docs/MCP.md`, `tests/model/locks.test.ts`, `tests/model/proposalCompare*.test.ts`, `tests/mcp/proposals.test.ts`, `tests/mcp/write.test.ts`.

- [x] Testes que reproduzem: `setMarkingRect` com o `rect` atual e `moveMarking(0, 0)` num item trancado lançam `locked`; `compareProposals` marca como `missing` criações iguais sem `source`; `propose_changes` com `supersedes` de uma aplicada
- [x] Geometria igual devolve `p` sem checar a trava (também em redimensionar); a trava continua valendo para qualquer diferença; `update_marking` do MCP com o `rect` atual passa e, se nada mais mudou, o lote devolve `no-changes`
- [x] `compareProposals`: casamento por `source`, depois por id da entidade, depois por caminho legível para criações; `same`/`different`/`missing` corretos no caso do achado 15
- [x] Substituição de aplicada: o modelo não muda (`applied` fica); a resposta do MCP explica (`superseded: { status: 'applied', note }`); `AGENT-GUIDE.md` passo 7 e `PROPOSAL-FORMAT.md` descrevem o comportamento real (aberta vira `superseded`; aplicada mantém o status e a app mostra "substituída por")
- [x] `SERVER_VERSION` 0.3.2; `docs/MCP.md` (tag `mcp-v0.3.2`, pelo dono)

**Aceite**: R5.7 do guia com um item trancado passa (`no-changes`); `tests/mcp` verdes; `npm run build:mcp` com `--version` 0.3.2.

#### 6.4 — Interface: tooltips, camadas, tabela, textos cortados e foco

**Achados 2, 3, 4, 5 e 6 (médias e baixas).** Tooltips ocultos (`visibility: hidden`) continuam ocupando espaço: barra horizontal em todo diálogo e painel, e o `.editor` chega a rolar 50 px e cortar a Árvore. O selo da especialização vaza da linha da janela Camadas quando ela está baixa. A tabela `atributos` sobrepõe a coluna `exemplo` ao botão **não** na largura padrão. Textos cortados sem `title`, dicas cobrindo menus, Diagnóstico quebrando Hora e Contexto no meio, caixa do nome do tipo inconsistente na revisão, caminho legível diferente entre app e MCP para imagem sem nome, rótulos do canvas cobrindo uns aos outros. O foco vai para o `body` ao fechar diálogos, e Enter na **Chave** de um par novo não vai para **Valor**.

**Toca em:** `src/theme/controls.css`, `panels.css`, `details.css`, `dialogs.css`, `src/ui/controls/Tooltip.tsx`, `src/ui/Dialog.tsx` (devolver o foco), `src/ui/ActionMenu.tsx`, `src/ui/Popover.tsx`, `src/ui/LayersPanel.tsx`, `src/ui/TableField.tsx`, `src/ui/DiagnosticsView.tsx`, `src/ui/FieldEditors.tsx`/`RefPicker.tsx` (`title`), `src/ui/KeyValueGrid.tsx` (Enter → Valor), `src/ui/review/changeText.ts` (caixa do tipo), `src/model/itemRef.ts` ou `mcp/items.ts` (caminho legível igual), `src/canvas/renderers/overlay.ts` (rótulos), `tests/components/*`, `tests/theme/*`, `tests/e2e/flows.spec.ts`.

- [x] Testes que reproduzem: e2e mede `scrollWidth > clientWidth` no diálogo Configurações e no `.editor` (hoje falha); componente: foco após fechar `Dialog` é o abridor (hoje `body`)
- [x] Tooltip oculto fora do fluxo (sem ocupar espaço nem rolar o contêiner), mantendo o texto no DOM para o nome acessível; `.editor` com `overflow` que nunca rola na horizontal por foco
- [x] Camadas: altura mínima de linha com o selo dentro; a lista rola em vez de encolher as linhas
- [x] Tabela `atributos`: colunas sem sobreposição na largura padrão de Detalhes (grade adaptativa ou rolagem dentro da tabela)
- [x] Textos: `title` nos valores de referência cortados; dica não cobre o menu que ela anuncia; Diagnóstico com Hora e Contexto sem quebra no meio da palavra; nome do tipo com a mesma caixa na lista e em Detalhes; caminho legível com o mesmo texto na app e no `resolve` do MCP; rótulo de filha no mesmo canto do pai deslocado para não cobrir
- [x] Foco: `Dialog` guarda o `activeElement` ao abrir e o devolve ao fechar (inclusive diálogo sobre diálogo); Enter na **Chave** foca **Valor**
- [x] Testes de componente para cada item e o e2e sem barra horizontal

**Aceite**: R1.3, R1.5, R1.8, R1.14 e R7.1 do guia sem os achados; nenhum `@media`, token ou regra do design system nova sem justificativa no PR.

#### 6.5 — Revisão: importação nova, conflito novo falso, proposta substituída e `drawImage`

**Achados 12 (média), 11 (baixa), 13 (parte da app) e 10 (baixa).** Na revisão de um projeto vazio (primeira importação, o caso mais comum com agente), a Árvore diz "Nenhuma imagem ainda" e o estado vazio aparece por cima das imagens propostas, porque leem o projeto atual e não a prévia. Ao reabrir uma revisão sem mudar nada (com a interface em inglês), a app marcou um conflito antigo como **Conflito novo**. A proposta aplicada e substituída não mostra **Abrir a nova**. O erro `InvalidStateError: drawImage … detached` voltou a aparecer no Diagnóstico depois de aplicar uma proposta com imagem nova.

**Toca em:** `src/app/Editor.tsx`, `src/app/CanvasNotices.tsx`, `src/ui/TreeWindow.tsx`/`MarkingTree.tsx` (fonte da árvore na revisão), `src/store/derived.ts`, `src/store/review.ts` (`knownConflicts`), `src/ui/review/ProposalRow.tsx`/`ProposalList.tsx`, `src/store/displayImages.ts`, `src/canvas/renderers/images.ts`, `src/store/proposalActions.ts` (invalidar imagens ao aplicar), `src/i18n/*`, `tests/store/review.test.ts`, `tests/components/review/*`, `tests/canvas/*`, `docs/ARCHITECTURE.md`.

- [x] Testes que reproduzem: revisão aberta num projeto sem imagens com proposta que cria imagens → árvore vazia e aviso de "nenhuma imagem" visíveis; reabrir a revisão sem mudança → `newConflicts` não vazio; proposta `applied` com outra apontando `supersedes` → sem link; bitmap fechado por `retain` ainda desenhado
- [x] Na revisão, Árvore e estado vazio leem `review.derived.preview` quando a visão é Proposto (e o atual quando é Atual); o aviso "Nenhuma imagem ainda" não aparece se a prévia tem imagens
- [x] `knownConflicts`: investigar a divergência da chave (idioma, ordem, id) e corrigir; reabrir sem mudança nunca marca conflito novo; teste cobre troca de idioma entre sessões
- [x] Proposta aplicada substituída: a linha mostra "Aplicada · substituída por <título>" e **Abrir a nova**, derivado do `supersedes` das demais propostas (sem mudar o arquivo)
- [x] `drawImage` destacado: reproduzir (bitmap fechado pelo `retain` enquanto um quadro pendente ainda o referencia, ou imagem trocada ao aplicar a proposta) e corrigir na raiz (não desenhar bitmap fechado; invalidar a exibição da imagem ao aplicar/desfazer uma proposta com imagens); o erro não volta ao Diagnóstico no cenário do R4.10
- [x] Testes

**Aceite**: R5.2 e R5.4 do guia com a Árvore navegável e o link **Abrir a nova**; R4.9/R4.10 sem "conflito novo" falso e sem erro no Diagnóstico; `tests/store/reviewPerf.test.ts` no orçamento.

#### 6.6 — Recentes de pasta na tela inicial

**Pedido do dono.** Projetos abertos por pasta não aparecem na tela inicial: toda abertura passa pelo seletor de pastas. O navegador não deixa guardar o caminho, mas deixa guardar o **handle** e pedir a permissão de novo com um clique.

**Toca em:** `src/storage/local.ts` (store `folders` no IndexedDB: handle, nome, último uso), `src/storage/folder.ts` (abrir a partir de um handle: `queryPermission`/`requestPermission`, `NotFoundError`), `src/app/controller.ts` (recentes unificados, `openRecentFolder`, `relocateFolder`, `forgetFolder`), `src/app/Home.tsx` (lista única com selo), `src/i18n/*`, `docs/ARCHITECTURE.md`, `docs/TESTING.md` (R0.4 e a nota dos [pessoa]), `tests/app/controller.test.ts`, `tests/storage/*`, `tests/e2e/folder.spec.ts`.

- [x] Teste que reproduz: abrir uma pasta, fechar o projeto; hoje a lista da tela inicial não a traz
- [x] Ao abrir ou criar um projeto em pasta, guardar o handle no IndexedDB com nome e data (try/catch; `isSameEntry` evita duplicata); o recente local existente ganha o mesmo formato de entrada
- [x] Clique no recente de pasta: `queryPermission({ mode: 'readwrite' })`; se não `granted`, `requestPermission` (dentro do gesto do clique); abre e atualiza a data
- [x] Handle inválido ou permissão negada: aviso com **Localizar pasta…** (seletor; substitui o handle, conferindo o `mapping.json`) e **Remover da lista** (não apaga nada do disco)
- [x] Tela inicial: lista única ordenada por último uso, selo **Pasta** ou **Neste dispositivo**, ação "Remover da lista" nas pastas; `file://` também guarda (IndexedDB existe lá no Chrome)
- [x] Documentação: `ARCHITECTURE.md` (recentes), `TESTING.md` (o seletor é [pessoa] só na primeira abertura; "Permitir em todas as visitas" é do navegador e tira o diálogo das seguintes)
- [x] Testes: controller com handles falsos (granted, prompt, denied, NotFoundError); e2e com OPFS guardando e reabrindo

**Aceite**: reabrir um projeto de pasta a partir da tela inicial com um clique (mais a permissão do navegador na primeira vez); pasta movida leva ao aviso com as duas ações; nada muda no `mapping.json`.

#### 6.7 — Guia, prompt do Cowork e fechamento

**"O que atrapalhou" do relato.** O guia diz `cadastro.png` onde a app grava `cadastro.webp` (R0.3, R1.1, R1.22); R2.2 não diz em que marcação criar a anotação; o aviso de não exportado já aparece no R2.1; o "Salvar como" do Chrome é um [pessoa] não marcado; R4.3 espera "sem Banner" e a app mostra hachurado; R5.5 só gera conflito com a ordem invertida; R5.3 não tem equivalente numa importação só de criações; R6.10 espera o diálogo em 3 s (passa a valer com a 6.2); R3.3 não diz onde fica o aviso de plataforma sem repositório; R8 reabre o zip quando bastaria retomar a revisão.

**Toca em:** `docs/TESTING.md`, `docs/history/etapa-5-testes-cowork.md` (o prompt do testador; ganha o relato por roteiro já existente e as regras novas), `docs/history/relato-2026-10-11.md` (o relato, guardado), `README.md`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-6.md`.

- [x] `TESTING.md`: cada item de "O que atrapalhou" corrigido no passo correspondente; R0.4 e a nota dos [pessoa] atualizados pelos recentes de pasta (6.6); R6.10 pela 6.2; R5.4 e R5.7 pelas decisões da 6.3
- [x] Prompt do testador (Cowork): agrupar os passos [pessoa] por roteiro e pedir num bloco só; preferir colar (`Ctrl+V`) ou arrastar imagens quando conseguir pôr o arquivo na área de transferência; "Salvar como" como [pessoa] quando o Chrome pergunta onde salvar; retomar a revisão existente no R8; esperar o campo aparecer antes de digitar
- [x] **Modo dirigido** no prompt do testador: além da rodada completa, o dono pode pedir "rode R0 e os passos dos achados N a M (ou de um relato anterior)". O testador lê o relato indicado (`docs/history/relato-*.md`), monta a lista a partir dos passos citados em cada achado (seção "Passos para reproduzir" e a coluna Observação) mais os passos do guia que a correção afetava, executa R0 inteiro antes, faz uma passada visual pelas janelas que a etapa tocou (Detalhes, Camadas, Diagnóstico e diálogos, por causa da 6.4) e entrega o relato no mesmo template, com uma coluna "achado de origem" na tabela de passos e a seção "Regressões fora do alvo". A rodada completa fica para o portão antes do uso com pessoas; o guia (`TESTING.md`, seção 7) ganha um parágrafo dizendo quando usar cada modo
- [x] O relato da rodada 1 guardado em `docs/history/relato-2026-10-11.md`, com uma linha no topo apontando para esta etapa (feito no PR do plano)
- [x] Fechamento: esta seção vai para `docs/history/PLAN-etapa-6.md` (com as decisões consolidadas dos PRs), o prompt do coordenador vai junto, `PLAN.md` volta a "nenhuma etapa em andamento", `docs/ROADMAP.md` marca a etapa 6 concluída e `CLAUDE.md` atualiza "Etapa atual"

**Aceite**: um agente novo lê `docs/TESTING.md` e não encontra nenhum dos pontos de "O que atrapalhou" (o coordenador faz essa leitura com um agente sem contexto e cola o resultado no PR); a segunda rodada do Cowork pode começar.

### Decisões a confirmar

1. Proposta aplicada não vira `superseded`; a app deriva "substituída por" do `supersedes` da nova. Proposto: sim.
2. Geometria igual não é mudança e não passa pela trava (app e MCP). Proposto: sim.
3. Casamento de criações sem `source` por id e por caminho legível. Proposto: sim.
4. Sem `showSaveFilePicker`, o aviso sai no clique como hoje, com o texto avisando. Proposto: sim (não há como saber se cancelou).
5. Lista única de recentes (pasta e neste dispositivo) ordenada por último uso. Proposto: sim.
6. Tooltip mantém o texto no DOM (nome acessível) mas fora do fluxo. Proposto: sim.

### Fora desta etapa

- Mudanças de produto sugeridas pelo relato que não são bugs: zoom por Ctrl+roda em passos grandes; selecionar na Árvore enquadra e muda o zoom; clicar na opção já marcada de um segmentado apaga o valor sem indício. Ficam para depois da segunda rodada, com o dado de uso real.
- Os itens de "Fora desta etapa" da etapa 5 continuam valendo (`docs/history/PLAN-etapa-5.md`).

---

## Fechamento (fase 6.7)

### Decisões a confirmar: o que valeu

Todas as propostas foram seguidas:

1. Proposta aplicada não vira `superseded` (6.3 e 6.5): o arquivo continua `applied`, a resposta do MCP traz `superseded: { status: "applied", note }` e a app deriva "Aplicada · substituída por <título>" e **Abrir a nova** do `supersedes` da nova.
2. Geometria igual não é mudança nem passa pela trava (6.3): `setMarkingRect` com o `rect` atual e `moveMarking(0, 0)` devolvem o projeto como está, na app e no `update_marking` do MCP.
3. Criações sem `source` casam pelo caminho legível (6.3), na ordem origem, entidade e campo, caminho.
4. Sem `showSaveFilePicker`, o aviso sai no clique, com a linha de texto avisando (6.1).
5. Lista única de recentes ordenada por último uso (6.6); abrir um projeto deste dispositivo também conta como uso.
6. Tooltip com o texto no DOM e fora do fluxo (6.4), posicionado por JS (`position: fixed`) em vez de escondido com `display: none`.

### Decisões consolidadas dos PRs

**Coordenação**

- Onda 1 em paralelo: #108 (6.3), #109 (6.1), #110 (6.5) e #111 (6.4). O #111 recebeu a `main` com as outras três antes do merge (conflito só no import do JSZip em `tests/e2e/flows.spec.ts`).
- Onda 2 em paralelo: #112 (6.2) e #113 (6.6), as duas a partir da `main` com a onda 1. Onda 3: a 6.7.
- Todos os PRs foram mergeados pela conta do dono (na API, autor e quem mergeou aparecem como a mesma conta).
- Nos gates locais, o orçamento `tests/canvas/renderPerformance.test.ts` (16 ms por quadro) estourou algumas vezes com quatro worktrees rodando em paralelo no mesmo container; `npm run test:perf` sozinho passou em todas as fases, e o CI roda o orçamento separado.

**6.1 — Exportar só é "exportado" quando gravou (#109)**

- `saveFileWithPicker` devolve `saved`, `cancelled` ou `failed`; `failed` mostra "Não foi possível salvar o arquivo. Tente de novo." e registra `export.savePicker` ou `export.saveWrite` no Diagnóstico, descartando a gravação incompleta com `abort()`.
- **Cancelar o "Salvar como" mantém o diálogo Exportar aberto**, para tentar de novo sem gerar o zip outra vez.
- Sem o seletor, a linha "Ao baixar, o projeto conta como exportado…" aparece em qualquer projeto, de pasta também.
- O seletor é ignorado dentro de iframe, como o `showDirectoryPicker`. O tipo é fixo em zip.
- O `navigator.share` já só marcava exportado quando a promessa resolvia; ganhou o teste do cancelamento.
- `tests/e2e/helpers.ts` (`exportZip`) tira o `showSaveFilePicker` antes de abrir o diálogo, para os e2e que exportam continuarem no `<a download>`; o caminho do seletor tem testes próprios em `flows.spec.ts`.

**6.2 — Alteração externa com a gravação em erro (#112)**

- `sync()` devolve o resultado novo `'conflict'` quando abre o diálogo; com o arquivo igual, `unchanged`, e o erro de gravação continua.
- A conferência não roda durante uma gravação (`writing`) e descarta o que leu se uma gravação começou durante a leitura (`writes`), o caso do **Tentar de novo**.
- `busy` continua valendo com a gravação agendada (o debounce de 250 ms): quem confere é a gravação.
- "Manter as minhas" com o arquivo ainda travado fecha o diálogo, a gravação falha de novo e o texto de fora passa a ser o conhecido (comportamento de antes).
- `Dialog` ganhou `closable={false}` (sem X; Esc e o clique no fundo inertes); se o navegador fechar o `<dialog>` mesmo assim (Esc repetido no Chrome), ele reabre. **"Sair da revisão?" manteve o X**, que lá equivale a **Continuar revisando**.

**6.3 — Modelo e MCP: geometria igual, comparação de propostas e substituição de aplicada (#108)**

- Geometria igual é conferida antes da forma do retângulo: o `rect` atual nunca falha, mesmo legado. Qualquer diferença, inclusive de 1 px, continua barrada pela trava.
- `compareProposals`: origem, depois entidade e campo, depois o caminho legível para as criações ainda sem par (marcação: imagem › pai › nome; anotação: marcação › camada › tipo › nome; imagem e camada pelo nome). Repetições no mesmo caminho casam uma a uma, na ordem.
- Os valores `to` são comparados depois de trocar os ids gerados por cada proposta (entidades, pares, `_id` de linhas) pelo caminho; mudar a marcação de pai passa a contar como `different`.
- A `note` da resposta só existe para a substituída `applied`; substituir uma `superseded` ou `withdrawn` também não muda o status, sem nota.
- `SERVER_VERSION` 0.3.2; a tag `mcp-v0.3.2` fica com o dono. O `mcp/batch.ts` não mudou.

**6.4 — Interface: tooltips, camadas, tabela, textos cortados e foco (#111)**

- Tooltip `position: fixed`, posicionado ao aparecer, preso à janela com 8 px de margem e virando de lado se não couber; o `.editor` passou a `overflow: clip`. Limitação: se o painel rolar com a dica visível, ela fica onde estava até o ponteiro sair.
- A dica some quando o menu do botão está aberto (`aria-haspopup` e `aria-expanded`).
- Camadas: `.layer-row { flex: none }`. Tabela: `.data-grid` em grade com `subgrid`, sem rolagem horizontal dentro da tabela (o menu da linha seria cortado).
- **Caminho legível: a app segue o MCP** (`refImageLabel`, nome do arquivo sem a pasta: `cadastro.webp › …`), então a resposta do servidor não mudou; a Árvore continua mostrando `images/cadastro.webp`.
- Na revisão, o nome do tipo de uma anotação criada vem da especialização do projeto ou da que a proposta aplica.
- Canvas: a etiqueta da marcação selecionada sobe acima do título da imagem quando encosta no topo; o nome de uma filha sob o cabeçalho do pai desce uma linha.
- `Dialog` fecha o `<dialog>` antes de sair do DOM e devolve o foco a quem abriu (também diálogo sobre diálogo), só se o foco ficou no diálogo ou no `body`. Enter na **Chave** grava e foca **Valor**.
- Fora do "Toca em", pelo mínimo: `layout.css`, `TypedFields.tsx`, `semanticCard.ts`, `markings.ts` e `itemClipboard.ts`. Nenhum token, `@media` nem regra nova do design system.

**6.5 — Revisão: importação nova, conflito novo falso, proposta substituída e `drawImage` (#110)**

- `review.derived.shownProject`: a prévia na visão Proposto, o projeto atual na Atual e fora da revisão; Árvore, estado vazio e dica de desenho leem dele.
- **Achado 11: a causa não era o idioma.** O estado de retomar a revisão era guardado só por id da proposta, e a mesma proposta foi aberta em três cópias do projeto (Loja local, zip reimportado, pasta `loja`). A chave passou a ser **cópia do projeto + proposta** (`<kind>:<id do projeto local ou nome da pasta>|<id da proposta>`); cada gravação relê o `localStorage` e troca só a própria entrada; os conflitos à vista ao fechar passam a ser conhecidos. A entrada antiga devolve posição e filtros, nunca marca conflito novo e é regravada no formato novo.
- "substituída por <título>" e **Abrir a nova** aparecem em qualquer linha para a qual outra proposta aponte `supersedes` (o texto é omitido na própria **Substituída**). Dentro da revisão de uma aplicada (**Ver**) não há a faixa "Esta proposta foi substituída".
- `drawImage`: o mapa de bitmaps nunca contém um fechado; o `close()` vai para o quadro seguinte (`requestAnimationFrame`, ou `setTimeout` sem ele) e o renderer nunca põe num nó um bitmap fechado. "Invalidar ao aplicar/desfazer" não foi preciso: aplicar nunca sobrescreve um caminho.
- Fora do "Toca em", pelo mínimo: `src/theme/review.css` e testes (`displayImages`, `CanvasController`, `proposalHarness` com `folderName`).

**6.6 — Recentes de pasta (#113)**

- Banco IndexedDB à parte, `mapping-folders` (versão 2; a 1 só existiu em preview e é descartada sem ler), com `folders` (linha da lista: nome do projeto, nome da pasta, último uso) e `handles` (id → handle). O caminho nunca é guardado.
- **A lista não lê nenhum handle**: o handle só é lido no clique em **Abrir** (numa visita nova) e, ao guardar uma pasta, os das entradas com o mesmo nome, para o `isSameEntry`.
- **Achado técnico:** no Chromium 1243 (headless e `chrome` completo), ler de volta do IndexedDB um handle de pasta do OPFS derruba a página. Os e2e de pasta usam o OPFS no lugar do seletor; por isso **pastas do OPFS não entram nos recentes** (o seletor de verdade nunca devolve uma). Ler de volta um handle do seletor de verdade não tem cobertura automática: o R0.4 do `TESTING.md` passou a recarregar a página antes do **Abrir**, e a aba precisa continuar de pé (se cair, anotar a versão do Chrome). O diagnóstico ficou no branch `claude/etapa-6-6-diag`.
- Abrir um projeto deste dispositivo grava `openedAt`; o último uso é o mais recente entre a última alteração e a última abertura.
- Textos: "Projetos recentes", coluna "Último uso", selo **Pasta** ou **Neste dispositivo**; linhas de pasta com o nome da pasta quando difere do projeto e **Remover da lista** (sem confirmação, porque não apaga nada).
- Pasta sem `mapping.json` ao reabrir pelos recentes vai para "Pasta indisponível", não para "Criar projeto nesta pasta?"; **Localizar pasta…** confere só se a pasta escolhida tem `mapping.json` (o formato não tem id de projeto) e une as entradas se a pasta já estava na lista.
- Sem os recursos (`showDirectoryPicker`, permissões, `isSameEntry` ou IndexedDB), nada é guardado e a lista mostra só os projetos deste dispositivo.

**6.7 — Guia, prompt do Cowork e fechamento**

- **Prompt novo ao lado do antigo:** `docs/history/etapa-6-testes-cowork.md` vale da segunda rodada em diante; o `etapa-5-testes-cowork.md` ficou como histórico, com um aviso no topo. Mesmo critério de nome dos prompts do coordenador (o da etapa que o escreveu) e nenhuma pasta nova.
- **Modo dirigido** no prompt (lista montada a partir do relato, R0 antes, passada visual, coluna "Achado de origem" e "Regressões fora do alvo"), no parágrafo "Rodada completa ou dirigida" da seção 7 do guia e num template próprio na seção 8.
- Guia: imagens recodificadas em WebP (seção 4 e R0.3, R1.1, R1.22); conferência de alterações externas só com a página visível (seção 4); três jeitos de adicionar imagem e o nome da colada; **Exportar** › **Baixar** com o "Salvar como" como **[pessoa]** e o cancelamento (convenções, R2.3 com um cancelamento de propósito, e todas as exportações marcadas); R0.6 e R6.2 inteiros da pessoa; esperar o campo, listas nativas e zoom por script para o agente; MCP 0.3.2 e cliente MCP próprio (seção 5).
- Passos: R0.4 recarrega a página antes de reabrir pelos recentes; **R0.7 novo**, pasta renomeada → "Pasta indisponível", **Localizar pasta…** e **Remover da lista**; R3 avisa que mover a `principal` leva ao "Pasta indisponível"; "Abra a pasta" no R6 é pelos recentes; R2.2 diz a marcação (Formulário); R2.1 já espera o aviso; R3.3 diz onde fica o aviso de repositório e como ver o resumo no canvas; R4.3 espera o Banner hachurado; R4.9 sem "Conflito novo"; R4.10 sem `drawImage`; R5.1 com o caminho sem `images/`; R5.2 com a Árvore na visão Proposto; R5.3 rejeita a criação de uma anotação; R5.4 separa a substituição de uma aplicada e a antecipada; R5.5 inverte a ordem; R5.7 inclui o item trancado; R6.10 em ~3 s, sem clique e sem X; R7.2 com Hora e Contexto numa linha; R8 retoma a revisão da Loja.
- `README.md` aponta para o prompt do testador; não citava a etapa.

### Fora desta etapa (acrescentado no fechamento)

- **Chave do estado de retomar a revisão de pasta** (sugestão da 6.5 e da 6.6): `resumeScope` em `src/store/review.ts` usa o nome da pasta, então duas pastas com o mesmo nome dividem a entrada. Poderia usar o id da entrada dos recentes de pasta.
- **e2e instável na `main`:** `tests/e2e/csp.spec.ts` › "fluxo principal sem nenhuma violação" falhou 1 vez em 5 localmente (na 6.1): o diálogo Exportar não aparece dentro do `expect.poll` (`helpers.ts`).
- **Branch `claude/etapa-6-6-diag`** (diagnóstico do OPFS) ficou no remoto; o dono decide apagar.
- **Handle do seletor de verdade lido do IndexedDB** sem teste automático (6.6): confirmar no Chrome do dono pelo R0.4 da segunda rodada.
- **Tag `mcp-v0.3.2`** e a Release com o `mapping-mcp.js`, com o dono (seção "Publicar uma versão" do `docs/MCP.md`).
- **Dica com o painel rolando** (6.4): fica onde estava até o ponteiro sair.
- Continuam valendo as mudanças de produto de "Fora desta etapa" acima (zoom por Ctrl+roda, seleção na Árvore que muda o zoom, segmentado que apaga o valor) e os itens da etapa 5.
