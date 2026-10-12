# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, a etapa 6: correções da primeira rodada de testes). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão) e 5 (pré-voo para uso real) concluídas**. As demais (marco de uso real e evoluções) estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v8)                                       |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, MCP, roteiros de teste manual e templates do relato e do registro de uso real |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 movida para Evoluções) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/history/PLAN-etapa-5.md`](docs/history/PLAN-etapa-5.md) | Histórico: etapa 5, pré-voo para uso real (fases 5.1 a 5.9 concluídas; decisões consolidadas dos PRs; prompts do coordenador e do testador ao lado) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas, marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |

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

Mesmo desenho da etapa 5; o prompt do coordenador está em `docs/prompts/etapa-6-coordenador.md` (modelo e esforço por fase, execução completa, parcial, paralela ou sequencial). Regras:

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

- [ ] Teste que reproduz: com `showSaveFilePicker` simulado devolvendo `AbortError`, hoje `unexported` vira `false`
- [ ] `storage/share.ts` ganha `saveFileWithPicker(file)`: `showSaveFilePicker` com nome sugerido e tipo zip, grava pelo `createWritable`, devolve `saved | cancelled`; detecta o recurso em runtime
- [ ] `ExportDialog`: **Baixar** usa o seletor quando existe e chama `markExported()` só em `saved`; em `cancelled` nada muda e o aviso continua; sem o recurso, `<a download>` + `markExported()` como hoje, com a linha de texto avisando que cancelar o salvamento exige exportar de novo
- [ ] `navigator.share`: `markExported()` só quando a promessa resolve (cancelar o compartilhamento rejeita com `AbortError`)
- [ ] Testes: cancelado mantém o aviso; salvo limpa; sem o recurso o comportamento antigo continua; e2e cobre o caminho com o seletor simulado

**Aceite**: R1.22 e R2.3 do `docs/TESTING.md` com um cancelamento no meio mantêm **Alterações não exportadas**; a exportação continua compatível com a CSP e com `file://`.

#### 6.2 — Alteração externa detectada mesmo com a gravação em erro

**Achados 8 (média) e 9 (baixa).** `idle()` em `src/store/session.ts` exige `saveStatus === 'saved'`, então com a gravação em erro `sync()` devolve `busy` e nunca olha o disco: quem edita por fora enquanto o arquivo está travado só descobre ao clicar em **Tentar de novo**. O **X** do diálogo "Projeto alterado fora da app" aparece e não faz nada (o comentário do código diz que ele não deveria existir).

**Toca em:** `src/store/session.ts` (`idle`, `sync`), `src/app/useExternalChanges.ts`, `src/app/EditorDialogs.tsx`, `src/ui/Dialog.tsx` (opção sem botão de fechar), `src/i18n/*`, `tests/store/externalChanges.test.ts`, `tests/store/session.test.ts`, `tests/components/*` do diálogo, `docs/ARCHITECTURE.md` (parágrafo "Revisão e mudanças externas").

- [ ] Teste que reproduz: `saveStatus` em `error`, arquivo alterado por fora, `sync()` devolve `busy` e `conflict` continua `null`
- [ ] `sync()` com `saveStatus === 'error'`: confere o disco; se o texto difere do conhecido, abre `conflict` (sem recarregar sozinho); `busy` só com gesto em andamento ou gravação em curso
- [ ] Diálogo "Projeto alterado fora da app" sem o X: `Dialog` ganha `closable={false}` (sem botão e sem Esc), usado só aqui e no "Sair da revisão?" se couber
- [ ] Testes: o diálogo abre em até um ciclo de `sync` com a gravação em erro; **Recarregar** e **Manter as minhas** continuam funcionando a partir desse estado; sem X no DOM

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

- [ ] Testes que reproduzem: e2e mede `scrollWidth > clientWidth` no diálogo Configurações e no `.editor` (hoje falha); componente: foco após fechar `Dialog` é o abridor (hoje `body`)
- [ ] Tooltip oculto fora do fluxo (sem ocupar espaço nem rolar o contêiner), mantendo o texto no DOM para o nome acessível; `.editor` com `overflow` que nunca rola na horizontal por foco
- [ ] Camadas: altura mínima de linha com o selo dentro; a lista rola em vez de encolher as linhas
- [ ] Tabela `atributos`: colunas sem sobreposição na largura padrão de Detalhes (grade adaptativa ou rolagem dentro da tabela)
- [ ] Textos: `title` nos valores de referência cortados; dica não cobre o menu que ela anuncia; Diagnóstico com Hora e Contexto sem quebra no meio da palavra; nome do tipo com a mesma caixa na lista e em Detalhes; caminho legível com o mesmo texto na app e no `resolve` do MCP; rótulo de filha no mesmo canto do pai deslocado para não cobrir
- [ ] Foco: `Dialog` guarda o `activeElement` ao abrir e o devolve ao fechar (inclusive diálogo sobre diálogo); Enter na **Chave** foca **Valor**
- [ ] Testes de componente para cada item e o e2e sem barra horizontal

**Aceite**: R1.3, R1.5, R1.8, R1.14 e R7.1 do guia sem os achados; nenhum `@media`, token ou regra do design system nova sem justificativa no PR.

#### 6.5 — Revisão: importação nova, conflito novo falso, proposta substituída e `drawImage`

**Achados 12 (média), 11 (baixa), 13 (parte da app) e 10 (baixa).** Na revisão de um projeto vazio (primeira importação, o caso mais comum com agente), a Árvore diz "Nenhuma imagem ainda" e o estado vazio aparece por cima das imagens propostas, porque leem o projeto atual e não a prévia. Ao reabrir uma revisão sem mudar nada (com a interface em inglês), a app marcou um conflito antigo como **Conflito novo**. A proposta aplicada e substituída não mostra **Abrir a nova**. O erro `InvalidStateError: drawImage … detached` voltou a aparecer no Diagnóstico depois de aplicar uma proposta com imagem nova.

**Toca em:** `src/app/Editor.tsx`, `src/app/CanvasNotices.tsx`, `src/ui/TreeWindow.tsx`/`MarkingTree.tsx` (fonte da árvore na revisão), `src/store/derived.ts`, `src/store/review.ts` (`knownConflicts`), `src/ui/review/ProposalRow.tsx`/`ProposalList.tsx`, `src/store/displayImages.ts`, `src/canvas/renderers/images.ts`, `src/store/proposalActions.ts` (invalidar imagens ao aplicar), `src/i18n/*`, `tests/store/review.test.ts`, `tests/components/review/*`, `tests/canvas/*`, `docs/ARCHITECTURE.md`.

- [ ] Testes que reproduzem: revisão aberta num projeto sem imagens com proposta que cria imagens → árvore vazia e aviso de "nenhuma imagem" visíveis; reabrir a revisão sem mudança → `newConflicts` não vazio; proposta `applied` com outra apontando `supersedes` → sem link; bitmap fechado por `retain` ainda desenhado
- [ ] Na revisão, Árvore e estado vazio leem `review.derived.preview` quando a visão é Proposto (e o atual quando é Atual); o aviso "Nenhuma imagem ainda" não aparece se a prévia tem imagens
- [ ] `knownConflicts`: investigar a divergência da chave (idioma, ordem, id) e corrigir; reabrir sem mudança nunca marca conflito novo; teste cobre troca de idioma entre sessões
- [ ] Proposta aplicada substituída: a linha mostra "Aplicada · substituída por <título>" e **Abrir a nova**, derivado do `supersedes` das demais propostas (sem mudar o arquivo)
- [ ] `drawImage` destacado: reproduzir (bitmap fechado pelo `retain` enquanto um quadro pendente ainda o referencia, ou imagem trocada ao aplicar a proposta) e corrigir na raiz (não desenhar bitmap fechado; invalidar a exibição da imagem ao aplicar/desfazer uma proposta com imagens); o erro não volta ao Diagnóstico no cenário do R4.10
- [ ] Testes

**Aceite**: R5.2 e R5.4 do guia com a Árvore navegável e o link **Abrir a nova**; R4.9/R4.10 sem "conflito novo" falso e sem erro no Diagnóstico; `tests/store/reviewPerf.test.ts` no orçamento.

#### 6.6 — Recentes de pasta na tela inicial

**Pedido do dono.** Projetos abertos por pasta não aparecem na tela inicial: toda abertura passa pelo seletor de pastas. O navegador não deixa guardar o caminho, mas deixa guardar o **handle** e pedir a permissão de novo com um clique.

**Toca em:** `src/storage/local.ts` (store `folders` no IndexedDB: handle, nome, último uso), `src/storage/folder.ts` (abrir a partir de um handle: `queryPermission`/`requestPermission`, `NotFoundError`), `src/app/controller.ts` (recentes unificados, `openRecentFolder`, `relocateFolder`, `forgetFolder`), `src/app/Home.tsx` (lista única com selo), `src/i18n/*`, `docs/ARCHITECTURE.md`, `docs/TESTING.md` (R0.4 e a nota dos [pessoa]), `tests/app/controller.test.ts`, `tests/storage/*`, `tests/e2e/folder.spec.ts`.

- [ ] Teste que reproduz: abrir uma pasta, fechar o projeto; hoje a lista da tela inicial não a traz
- [ ] Ao abrir ou criar um projeto em pasta, guardar o handle no IndexedDB com nome e data (try/catch; `isSameEntry` evita duplicata); o recente local existente ganha o mesmo formato de entrada
- [ ] Clique no recente de pasta: `queryPermission({ mode: 'readwrite' })`; se não `granted`, `requestPermission` (dentro do gesto do clique); abre e atualiza a data
- [ ] Handle inválido ou permissão negada: aviso com **Localizar pasta…** (seletor; substitui o handle, conferindo o `mapping.json`) e **Remover da lista** (não apaga nada do disco)
- [ ] Tela inicial: lista única ordenada por último uso, selo **Pasta** ou **Neste dispositivo**, ação "Remover da lista" nas pastas; `file://` também guarda (IndexedDB existe lá no Chrome)
- [ ] Documentação: `ARCHITECTURE.md` (recentes), `TESTING.md` (o seletor é [pessoa] só na primeira abertura; "Permitir em todas as visitas" é do navegador e tira o diálogo das seguintes)
- [ ] Testes: controller com handles falsos (granted, prompt, denied, NotFoundError); e2e com OPFS guardando e reabrindo

**Aceite**: reabrir um projeto de pasta a partir da tela inicial com um clique (mais a permissão do navegador na primeira vez); pasta movida leva ao aviso com as duas ações; nada muda no `mapping.json`.

#### 6.7 — Guia, prompt do Cowork e fechamento

**"O que atrapalhou" do relato.** O guia diz `cadastro.png` onde a app grava `cadastro.webp` (R0.3, R1.1, R1.22); R2.2 não diz em que marcação criar a anotação; o aviso de não exportado já aparece no R2.1; o "Salvar como" do Chrome é um [pessoa] não marcado; R4.3 espera "sem Banner" e a app mostra hachurado; R5.5 só gera conflito com a ordem invertida; R5.3 não tem equivalente numa importação só de criações; R6.10 espera o diálogo em 3 s (passa a valer com a 6.2); R3.3 não diz onde fica o aviso de plataforma sem repositório; R8 reabre o zip quando bastaria retomar a revisão.

**Toca em:** `docs/TESTING.md`, `docs/history/etapa-5-testes-cowork.md` (o prompt do testador; ganha o relato por roteiro já existente e as regras novas), `docs/history/relato-2026-10-11.md` (o relato, guardado), `README.md`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-6.md`.

- [ ] `TESTING.md`: cada item de "O que atrapalhou" corrigido no passo correspondente; R0.4 e a nota dos [pessoa] atualizados pelos recentes de pasta (6.6); R6.10 pela 6.2; R5.4 e R5.7 pelas decisões da 6.3
- [ ] Prompt do testador (Cowork): agrupar os passos [pessoa] por roteiro e pedir num bloco só; preferir colar (`Ctrl+V`) ou arrastar imagens quando conseguir pôr o arquivo na área de transferência; "Salvar como" como [pessoa] quando o Chrome pergunta onde salvar; retomar a revisão existente no R8; esperar o campo aparecer antes de digitar
- [ ] **Modo dirigido** no prompt do testador: além da rodada completa, o dono pode pedir "rode R0 e os passos dos achados N a M (ou de um relato anterior)". O testador lê o relato indicado (`docs/history/relato-*.md`), monta a lista a partir dos passos citados em cada achado (seção "Passos para reproduzir" e a coluna Observação) mais os passos do guia que a correção afetava, executa R0 inteiro antes, faz uma passada visual pelas janelas que a etapa tocou (Detalhes, Camadas, Diagnóstico e diálogos, por causa da 6.4) e entrega o relato no mesmo template, com uma coluna "achado de origem" na tabela de passos e a seção "Regressões fora do alvo". A rodada completa fica para o portão antes do uso com pessoas; o guia (`TESTING.md`, seção 7) ganha um parágrafo dizendo quando usar cada modo
- [x] O relato da rodada 1 guardado em `docs/history/relato-2026-10-11.md`, com uma linha no topo apontando para esta etapa (feito no PR do plano)
- [ ] Fechamento: esta seção vai para `docs/history/PLAN-etapa-6.md` (com as decisões consolidadas dos PRs), o prompt do coordenador vai junto, `PLAN.md` volta a "nenhuma etapa em andamento", `docs/ROADMAP.md` marca a etapa 6 concluída e `CLAUDE.md` atualiza "Etapa atual"

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
