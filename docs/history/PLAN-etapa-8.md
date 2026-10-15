# Histórico — Etapa 8, consolidação por subsistema (seção do antigo PLAN.md)

> Fases 8.1 a 8.7 concluídas (o plano entrou no PR #123; fases nos PRs #124 a #131 e #133, devoluções da segunda leitura nos #136 e #137 e devoluções do portão nos #138 a #140; a auditoria do dono no #135; o fechamento no #141). Portão: a rodada 5 do Cowork, completa ([`relato-2026-10-13-portao.md`](relato-2026-10-13-portao.md)), e a rodada 6, dirigida nas devoluções ([`relato-2026-10-14-dirigida.md`](relato-2026-10-14-dirigida.md)): nenhum achado alto ou médio aberto. Referência atual: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (seções "Sessão e gravação", "Revisão" e "Foco e teclado", os recentes e a seção `mcp/`), [`../TESTING.md`](../TESTING.md) e [`../TESTING-COWORK.md`](../TESTING-COWORK.md) (guia e prompt do testador), [`../MCP.md`](../MCP.md) e [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md) (MCP 0.3.4). Ao lado ficam a origem da etapa ([`revisao-tecnica-2026-10-12.md`](revisao-tecnica-2026-10-12.md)), as notas de desenho das fases ([`etapa-8-notas/`](etapa-8-notas/)), a segunda leitura da entrega ([`auditoria-etapa-8.md`](auditoria-etapa-8.md)), os relatos das rodadas 4 a 6 e o prompt do coordenador de agentes ([`etapa-8-coordenador.md`](etapa-8-coordenador.md)).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da 8.7, marcados ao fechar a etapa, e os caminhos que mudaram: as notas de desenho saíram de `docs/design/` para `docs/history/etapa-8-notas/` e o prompt do coordenador saiu de `docs/prompts/` para esta pasta. Onde o texto descreve a regra da época ("`docs/design/etapa-8-<n>.md`, se passar de uma tela") ou o que a 8.7 ia mover, ficou como estava. Depois dela vêm o fechamento (o que valeu das decisões a confirmar, as decisões consolidadas dos PRs, a auditoria e o portão) e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 8: consolidação por subsistema

### Objetivo

Consolidar o que três etapas de correção pontual (5, 6 e 7) deixaram como remendos coerentes um a um e menos coerentes no conjunto, antes do teste manual avançado do dono e do uso com pessoas. A origem é a **revisão técnica dirigida** de 2026-10-12 (`docs/history/revisao-tecnica-2026-10-12.md`: síntese mais seis relatórios, 71 achados, cada um com `arquivo:linha`). As fases citam os achados pelo código da área mais o número no relatório: **S** sessão e persistência, **P** revisão de propostas, **F** foco, diálogos e teclado, **R** armazenamento e recentes, **M** servidor MCP, **G** guia e prompt do testador.

Dois achados são de integridade em condição plausível e vão primeiro: **S1** (`mapping.json` vazio no instante da gravação é tratado como "de ninguém": a app grava por cima e, no `sync` seguinte, recarrega o arquivo externo, perdendo a edição local sem conflito) e **P7** (aplicar aceitas com o `proposal.json` falhando depois do `mapping.json` gravar deixa o projeto com as mudanças e a proposta sem `applied`). O terceiro alto é **F1**, a causa do flake de foco (o `Dialog` abre em `useEffect` e os testes rodam com duas versões de `@testing-library/dom`). Nenhuma funcionalidade nova; nada do schema v8 nem do formato da proposta muda; o MCP só muda na 8.5 (release 0.3.3).

### Decisões

Esta etapa muda o **formato do trabalho**, não só o código. As regras abaixo valem para todas as fases e o coordenador as confere antes de aceitar um PR.

- **Uma fase por subsistema, um executor que vê o todo.** O executor recebe a área inteira (não um achado) e consolida; não há duas fases mexendo no mesmo subsistema.
- **Nota de desenho antes do código.** O primeiro commit da fase é um comentário no PR (ou `docs/design/etapa-8-<n>.md`, se passar de uma tela) dizendo como o subsistema vai ficar: estados e transições, funções que sobram e que somem, contrato com os vizinhos, testes que vão existir. O coordenador aprova a nota (ou devolve) **antes** do primeiro commit de código. Sem nota aprovada, o PR volta.
- **Teste primeiro continua**, com uma licença: cada achado citado ganha um teste que o reproduz antes da correção, e o executor **pode reescrever um teste existente que fixa o comportamento errado** (ex.: `tests/store/externalChanges.test.ts` fixa `status === 'error'` com gravação em curso), dizendo no PR qual e por quê.
- **Uma regra automática por padrão a evitar.** Cada fase entrega pelo menos uma regra ESLint ou teste de catraca para o padrão que ela consolida (listadas em cada fase), para o remendo não voltar na etapa seguinte.
- **Sequencial onde há acoplamento, paralelo só com arquivos disjuntos.** Arquivos compartilhados por mais de uma fase da mesma onda: só `src/i18n/*` e `eslint.config.js` (o coordenador resolve conflitos).
- **Sem mudar comportamento visível sem registro.** Toda mudança que a pessoa percebe (ex.: Enter deixa de tirar o foco do campo) entra em "Decisões tomadas" do PR e no `docs/TESTING.md` (fase 8.6 ou 8.7, conforme a ordem).
- **Auditoria e portão.** Ao fim, a auditoria da entrega (como nas etapas 5 a 7) e uma **rodada completa** do Cowork sobre o build final antes do teste manual do dono.

### Execução por um coordenador de agentes

Prompt em `docs/history/etapa-8-coordenador.md` (modelo e esforço por fase, modos completa, parcial, paralela e sequencial, e o passo novo de aprovar a nota de desenho). Regras:

1. **Uma fase = um branch + um PR**, `claude/etapa-8-<n>-<assunto>`.
2. **Ondas** (releia esta seção na `main` antes de abrir cada onda):
   - **Onda 1:** 8.1 (sessão), 8.3 (foco), 8.5 (MCP), 8.6 (guia). Arquivos disjuntos: `store/session` + `storage/autosave`; `ui/` e `app/` de diálogos e foco; `mcp/`; `docs/TESTING*`.
   - **Onda 2:** 8.2 (revisão; depende da 8.1 pelo contrato de `flush` e da 8.5 por `src/model/proposalView.ts`) e 8.4 (recentes; depende da 8.3 por `Home.tsx`). As duas compartilham um contrato declarado nas notas de desenho: `ProjectStorage.copyId?: string` (a 8.4 define e preenche; a 8.2 lê com fallback `folderName` até a 8.4 mergear).
   - **Onda 3:** 8.7 (fechamento e portão).
3. **Gates antes de abrir o PR:** `npm run lint && npm run typecheck && npm test && npm run build` (e `npm run build:mcp` na 8.5). O coordenador confere `check` e `e2e` verdes.
4. **Descrição do PR** com Resumo, Como testar (só desktop), Decisões tomadas e a **nota de desenho** (ou o link para ela); checkboxes da fase marcados neste `PLAN.md` no mesmo PR.
5. **Com o dono:** criar a tag `mcp-v0.3.3` depois do merge da 8.5; rodar a rodada completa do Cowork na 8.7.
6. **Aceite** de cada fase é o descrito nela; sem a nota aprovada ou sem o teste que reproduz o achado, o PR volta.

### Fases

#### 8.1 — Sessão e gravação

**Achados S1 a S10** (`docs/history/revisao-tecnica-2026-10-12.md`, seção 1). O `AutoSaver` nunca marca `saving` numa gravação enfileirada atrás de uma que falhou, então a 6.2 corrigiu o sintoma na sessão com `writing`/`writes`/`stalled()`; `adopt`/`resolveConflict` não esperam a fila e uma gravação em curso pode sobrescrever o arquivo recém-adotado (S2, S3); arquivo vazio no instante da gravação é tratado como "de ninguém" (S1, alta); `unexported` tem duas fontes (S4); undo depois de `save-failed` regrava sem mudança (S5); imagens órfãs após Recarregar (S6); `resolveConflict` com `loadMapping` lançando vira rejeição solta (S7); exportar com a gravação em erro limpa o aviso e ele volta (S8); `sync` com `images:true` descartado por `syncing` (S9); comentários e acreções (S10).

**Toca em:** `src/storage/autosave.ts`, `src/store/session.ts`, `src/app/useExternalChanges.ts`, `src/app/controller.ts` (só `onSaved`/`markExported`/`unexported` e `pagehide`), `src/storage/local.ts` (só o `unexported` da gravação de proposta), `src/store/proposals.ts` (só o gancho "mudou" para a sessão), `src/app/EditorDialogs.tsx` (erro do `resolveConflict`), `src/i18n/*`, `eslint.config.js`, `docs/ARCHITECTURE.md` (seção da sessão reescrita como máquina de estados), `tests/storage/autosave.test.ts`, `tests/store/externalChanges.test.ts`, `tests/store/session.test.ts`, `tests/app/*` do export.

- [x] Nota de desenho aprovada: a máquina de estados alvo (estados, transições, quem dispara), a fila única e o contrato de `flush`/`FlushResult` que a 8.2 vai usar (`docs/history/etapa-8-notas/etapa-8-1.md`, revisão 3)
- [x] Testes que reproduzem: arquivo vazio na gravação não é sobrescrito e agenda nova tentativa (S1); `status === 'saving'` em toda gravação em curso, inclusive enfileirada (S2); Recarregar com gravação em curso não grava o projeto antigo (S3); decidir numa proposta marca "não exportadas" na barra sem reabrir (S4); undo após `save-failed` não regrava (S5); `resolveConflict` com `loadMapping` lançando mostra `reloadFailed` (S7); `collectFiles` com gravação em erro (S8); `sync` com `images:true` durante poll (S9)
- [x] `AutoSaver` com fila única para gravação e conferência: `saving` antes de `save()`, `reset()` cancela a enfileirada ainda não iniciada, `adopt` e `resolveConflict` executam dentro da fila; `writing`, `writes`, `stalled()` e a tripla checagem de `idle()` em `syncProject` somem
- [x] Vazio = "ilegível, tente depois": não grava, `schedule()` e sai sem erro; `null` segue gravando (a nova tentativa fica dentro da gravação, `EMPTY_RETRY_ATTEMPTS` × `EMPTY_RETRY_DELAY_MS`, e depois vira erro com três saídas: decisão D2 da nota)
- [x] `unexported` com uma fonte: `onSaved` vira `onChanged`, chamado também pela gravação da proposta
- [x] S5, S6, S7, S8, S9 e os comentários de S10 (`SyncResult`, `stalled`, `lastModified` inicial por `statMapping`, `close()` esperando `sync`)
- [x] Regras automáticas: teste de invariantes do `AutoSaver` (`saved` ⇒ nada em curso e `!dirty`; em curso ⇒ `saving`); ESLint `no-restricted-syntax` proibindo `storage.loadMapping(` e `storage.saveMapping(` fora dos pontos da sessão (e `saveMapping(` fora de `session.ts`/criação no `controller.ts`)
- [x] `docs/ARCHITECTURE.md` descreve a máquina nova numa seção só, sem as exceções antigas

**Aceite**: R6.1 a R6.11 do `docs/TESTING.md` sem regressão; o cenário "editor trunca o arquivo e depois escreve" reproduzido por teste com `holdSave`/`holdRead` e resolvido como conflito, não como recarga; nenhum teste fixa `status === 'error'` com gravação em curso.

#### 8.2 — Revisão de propostas

**Achados P1 a P11 e R3** (seções 2 e 4). Nove consumidores leem `store.committed`/`store.project` na revisão em vez do projeto da visão (`shownProject`), e o canvas tem outra definição própria (P1); a chave do retomar por nome da pasta colide (P2/R3); "vista"/"Nova" é efeito colateral do resume, com corte global em 12 entradas que faz propostas voltarem a "nova" e `seen` lido uma vez (P3); três noções de "nova" sem contrato (P4); modelo do resume como pilha de casos (P5); conflitos surgidos durante a revisão nunca são "novos" (P6); `write-failed` depois do `flush` deixa estado dividido (P7); "sugerida numa rejeição" sem rejeição (P8); filtro de camada saneado pelo projeto atual (P9); regra de negócio no store e na interface (P10); miudezas (P11).

**Toca em:** `src/store/review.ts`, `src/store/derived.ts`, `src/store/proposals.ts` (fila/notices), `src/store/proposalActions.ts` (P7), `src/model/proposalView.ts` (novo ou ampliado: `levelType`, `proposalListStatus`; `changeImageFile` já exportado pela 8.5), `src/canvas/CanvasController.ts` (`drawnProject` derivado de `shownProject`), `src/ui/Breadcrumbs.tsx`, `src/ui/StatusBar.tsx`, `src/ui/Minimap.tsx`, `src/ui/LayersWindow.tsx`, `src/ui/ListView.tsx`, `src/ui/IncompleteView.tsx`, `src/ui/review/*` (só consumo do estado), `src/app/useEditorShortcuts.ts` (leituras do projeto), `src/i18n/*`, `docs/ARCHITECTURE.md` (seção "Revisão"), `tests/store/review*.test.ts`, `tests/store/proposals.test.ts`, `tests/components/review/*`, `tests/model/proposal*`, `tests/tooling/*` (catraca).

- [x] Nota de desenho aprovada: o blob `mapping.reviewResume` v2 (`seen` separado de `resume`, chaves `copyId|proposalId`, zod, versão ≠ 2 descartada), o contrato de "nova" e o uso de `shownProject` em todo consumidor (`docs/history/etapa-8-notas/etapa-8-2.md`, revisão 4)
- [x] Testes que reproduzem: trilha, barra de status, cursor, minimapa e Camadas com item só da proposta (P1); duas pastas com o mesmo nome (P2); eviction da 13ª entrada não muda `seen` e `localStorage` bloqueado não volta tudo a "nova" (P3); aviso `added` depois de abrir pela lista e contagem × selo (P4); conflito surgido durante a revisão aparece como novo (P6); `writeProposal` falhando após o `flush` (P7); "sugerida" só com rejeição (P8); camada criada pela proposta sobrevive ao retomar (P9)
- [x] `shownProject` como única fonte do projeto à vista: canvas deriva `drawnProject` dele; trilha, status, cursor, atalhos, minimapa, Camadas, Lista e Incompletas o leem (o estado derivado do editor recebe `shownProject`; sem aviso "visão Atual")
- [x] `resumeScope` = `storage.copyId` (só `copyId`: a 8.4 entrou antes, sem fallback; sem o campo, escopo vazio e registro no Diagnóstico)
- [x] Resume v2: `seen` sem LRU, `resume` com LRU por cópia; `entriesOf`, `known: null` e o ramo legado somem; `resumed` passa a `'full' | 'none'`
- [x] "Nova": `rows[].fresh` é a verdade; selo e ação principal em toda linha `fresh`; `open()` remove o `notice.added` da proposta (`proposals.dismissNotice`, ação do store)
- [x] P7: no `write-failed` após `flush`, compensar como no `save-failed` (undo da entrada, `abandoned`, `flush` da regravação e só então o rollback das cópias)
- [x] P6, P8, P9, P11; `levelType`, `proposalListStatus` e `needsExitReminder` em `src/model/proposalView.ts` com testes de modelo
- [x] Regras automáticas: teste de contrato do "projeto à vista" (`tests/components/review/shownProject.test.tsx`, mais `tests/canvas/reviewCursor.test.ts`); catraca em `tests/tooling/shownProjectReaders.test.ts` com a allowlist dos arquivos de `src/ui/**` e `src/app/**` que leem `store.committed`/`store.project`; teste do esquema v2 do resume (`tests/store/review.test.ts`)
- [x] `docs/ARCHITECTURE.md` atualizado (seção "Revisão": retomar por cópia, blob v2, conflitos novos, "Nova", projeto à vista, falhas do aplicar); `docs/PROPOSAL-FORMAT.md` sem mudança (o formato da proposta e as regras da revisão do modelo não mudaram)

**Aceite**: R4.1 a R4.11, R5.2 a R5.7 e R8.2 do guia sem regressão; os itens O5, O6, O7 e O9 do relato da rodada 4 fechados; o cenário P7 reproduzido e compensado.

#### 8.3 — Foco, diálogos e teclado

**Achados F1 a F10** (seção 3). O `Dialog` abre e registra o retorno em `useEffect`, e o `user-event` usa outra versão de `@testing-library/dom` (10.4.2 na raiz, 8.20.1 aninhada no `@testing-library/preact`), então o clique pode chegar antes do efeito: é a causa do flake (F1, alta); duas autoridades de foco em Home e no "ir para anotação" (F2); Configurações → Ver atalhos → Esc deixa o foco no primeiro controle da app, porque a troca de diálogo no mesmo slot desmonta o antigo antes de o novo capturar a origem (F3); nove seletores de DOM atravessando componentes (F4); quatro Enters e quatro Escs sem política (F5); menus que largam o foco no `body` (F6); botão cru no `RefPicker` (F7); `modalFocus` aplicado de forma desigual (F8); duplicações (F9); acessibilidade menor (F10).

**Toca em:** `src/ui/Dialog.tsx`, `src/ui/RefPicker.tsx`, `src/ui/TableField.tsx`, `src/ui/CodeRefField.tsx`, `src/ui/ActionMenu.tsx`, `src/ui/Popover.tsx`, `src/ui/MenuPopover.tsx`, `src/ui/CanvasContextMenu.tsx`, `src/ui/KeyValueGrid.tsx`, `src/ui/CommitInput.tsx`, `src/ui/AnnotationsPanel.tsx`, `src/ui/TypedFields.tsx`, `src/ui/controls/Button.tsx` e `IconButton.tsx` (`buttonRef`), `src/ui/toolWindowLayout.ts`, `src/app/ExportDialog.tsx`, `src/app/EditorMainBar.tsx`, `src/app/useEditorDialogs.ts`, `src/app/EditorDialogs.tsx`, `src/app/Home.tsx` (só o foco), `src/app/useEditorShortcuts.ts` e `src/app/useImageIntake.tsx` (`dialog[open]` → signal), `src/app/shortcuts.ts` (`ariaKeys`), `src/i18n/*`, `eslint.config.js`, `package.json` (`overrides`, se decidido), `tests/setup.ts`, `tests/components/*`, `docs/ARCHITECTURE.md` (seção nova "Foco e teclado").

- [x] Nota de desenho aprovada: o modelo único de retorno de foco (um dono por fechamento), a política de teclado (Enter, Esc, Alt+Enter, menus) e a decisão sobre `overrides` do `@testing-library/dom`
- [x] Testes que reproduzem: o flake de forma determinística (clique antes do efeito; F1); Configurações › Ver atalhos › Esc volta ao botão Configurações (F3); Home e "ir para anotação" com um só dono (F2); menus devolvem o foco em todo fechamento (F6); Enter em campo de texto mantém o foco (F5, se a política for essa)
- [x] `Dialog` e `RefPicker`: `showModal` + `focusFirst` + registro do cleanup em `useLayoutEffect`; `origin?: FocusOrigin` vindo do host (`useEditorDialogs`/`Home` capturam uma vez e a troca de diálogo herda)
- [x] Um dono por fechamento: Home passa `returnFocus={() => rowAt(index)}` e perde `refocusRow`; `goToAnnotation` vira o `returnFocus` do `RefPicker`; `Dialog` não adivinha contêiner quando recebe alvo
- [x] Seletores de DOM entre componentes removidos: `buttonRef` em `Button`/`IconButton`, `triggerRef` no `ActionMenu`, `returnFocus` do Exportar vindo da barra, signal `modalOpen` no lugar de `document.querySelector('dialog[open]')`, `data-*` para classes próprias
- [x] Política de teclado documentada e aplicada: Enter confirma e mantém o foco no campo (exceto Chave → Valor); Esc em campo reverte, sem o que reverter sobe; menus e popovers devolvem o foco ao gatilho em todo fechamento; `aria-keyshortcuts` sempre na sintaxe ARIA (`ariaKeys`), o rótulo humano só na dica
- [x] F7 (`IconButton` no `RefPicker`), F8 (`simulateModalFocus` em `tests/setup.ts` com `restoreModalFocus` global e helper `openDialog()`), F9 (`NameField` sem foco duplicado; `canvas.focusSelection` → `centerSelection`), F10 (`aria-describedby` no corpo; `role="alertdialog"` nas confirmações destrutivas)
- [x] Regras automáticas: ESLint `no-restricted-syntax` contra `document.querySelector*`/`getElementById` em `src/ui/**` e `src/app/**` (exceções nominais) e contra seletor por classe em `querySelector`; teste em `tests/tooling/` que exige sintaxe ARIA em todo `aria-keyshortcuts=`

**Aceite**: "Visual: diálogos (foco)" da rodada 3 repetido sem nenhum `body`; R1.7 a R1.10, R1.15, R1.22 e R0.7 do guia; o teste do flake roda 20 vezes seguidas sem falhar no CI (`vitest --repeat` ou laço no PR); O5 do relato da rodada 3 decidido e registrado.

#### 8.4 — Recentes e controller

**Achados R1, R2, R4 a R10** (seção 4; R3 vai pela 8.2 com o `copyId` desta fase). `controller.ts` tem oito responsabilidades em 713 linhas (R9); `openFolderId` pode vazar para o projeto seguinte numa corrida fechar × guardar (R1); o nome da pasta nos recentes só acompanha o rename ao Fechar projeto (R2); reparar e abrir um local não conta como uso (R4); falha de permissão que não é `NotFound` não oferece Localizar/Remover (R5); `requestPersistentStorage` só nos fluxos locais (R6); duas pastas com o mesmo nome ficam indistinguíveis na lista (R7); regra da ativação sem guarda documentada no teste (R8); `list()` ordena por um campo que ninguém usa (R10).

**Toca em:** `src/app/controller.ts` (split), novos `src/app/recents.ts` e `src/app/pageLifecycle.ts`, `src/storage/types.ts` (`copyId`), `src/storage/local.ts`, `src/storage/folder.ts`, `src/app/Home.tsx` (só `folderName` com nome repetido e o que o split exigir; o foco é da 8.3), `src/i18n/*`, `eslint.config.js`, `docs/ARCHITECTURE.md` (seção dos recentes), `tests/app/controller.test.ts` (e novos `recents.test.ts`), `tests/storage/*`, `tests/i18n/*`, `tests/components/Home.test.tsx`.

- [x] Nota de desenho aprovada: responsabilidades de `controller.ts`, `recents.ts` e `pageLifecycle.ts`; onde mora `openFolderId`; o contrato `ProjectStorage.copyId` (local: id; pasta: id da entrada dos recentes; pasta sem recentes: id por sessão)
- [x] Testes que reproduzem: fechar durante `rememberFolder` não vaza `openFolderId` (R1); rename do projeto em pasta reflete nos recentes sem Fechar (R2); reparar e abrir local conta como uso (R4); `SecurityError` no `requestPermission` oferece Localizar/Remover (R5); duas pastas com o mesmo nome mostram `folderName` (R7); `copyId` preenchido nos três casos
- [x] Split do controller sem mudar a API usada por `Home.tsx` e pelos testes (re-exports)
- [x] R1, R2 (`touchFolder` no `onChanged`), R4, R5, R6 (`requestPersistentStorage` ao guardar pasta), R7, R8 (comentário no teste), R10 (`list()` sem ordenação morta)
- [x] Regras automáticas: ESLint `no-restricted-globals` para `localStorage`/`sessionStorage`/`indexedDB` em `src/**` exceto `src/utils/safeStorage.ts` e `src/storage/local.ts`; teste em `tests/i18n/` que exige `error.<code>` para todo `AppErrorCode`; `max-lines` (`warn`, 600) em `src/app/**`
- [x] `docs/ARCHITECTURE.md` atualizado (recentes, `copyId`, módulos novos)

**Aceite**: R0.2 a R0.7, R2.1 a R2.4 e R7.2 do guia sem regressão; `controller.ts` abaixo de 450 linhas; O5 do relato da rodada 4 fechado junto com a 8.2.

#### 8.5 — Servidor MCP 0.3.3

**Achados M1 a M10 e M12 a M14** (seção 5; M11, cache e paginação, fica fora). `root` relativo recusado (M1, O8); `images/` vazia no `create_project` (M2, O4); as três promessas de concorrência do `docs/MCP.md` sem teste por stdio (M3); `link()` sem fallback em sistemas sem hard link (M4); imagens aceitas da proposta substituída deixam de ser reservadas (M5); janela de sobrescrita do `proposal.json` e ordem gravar → marcar a documentar (M6, M7); guardas estáticas não recursivas (M8); códigos de erro sem registro e tabela incompleta (M9); duplicações com `model`/`storage` (M10); `root` ignorado com `path` absoluto (M12); versão fixada em três lugares (M13); Windows sem teste unitário (M14).

**Toca em:** `mcp/**`, `src/model/proposalView.ts` (exportar `changeImageFile`), `src/model/backups.ts` (predicado do `.gitignore`), `src/model/images.ts` ou `src/storage/types.ts` (constantes `MAPPING_FILE`/`IMAGES_DIR`, só mover), `src/storage/folder.ts` (só usar o predicado movido), `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `docs/ARCHITECTURE.md` (limites conhecidos M6/M7), `tests/mcp/**`, `tests/model/*` dos itens movidos.

- [x] Nota de desenho aprovada: resolução do `root` (como `main.ts`), fallback do `link`, registro `ToolErrorCode`, o que entra na 0.3.3
- [x] Testes que reproduzem: `root` relativo e `./` (M1); `create_project` sem `images/` (M2); `revision-conflict` do `propose` com `mapping.json` mudando no meio, `read-only` com `schemaVersion` maior, `supersede-failed` (M3); `link` falhando com `EPERM` cai para `wx` (M4); reserva das aceitas da substituída (M5); `root` + `path` absoluto fora da raiz → `invalid-arguments` (M12); `isWithin`/`hasParentSegment` com `path.win32` (M14)
- [x] M1, M2, M4, M5, M12 implementados; M6 e M7 documentados em `docs/ARCHITECTURE.md`
- [x] M10: `changeImageFile` exportado e reutilizado; predicado do `.gitignore` em `src/model/backups.ts` usado pelos dois lados; constantes num só lugar
- [x] Regras automáticas: guarda estática recursiva e nominal dos escritores (`mcp/**/*.ts`); `ToolErrorCode` como união literal + teste "todo código de `new ToolError(` está em `docs/AGENT-GUIDE.md` ou `docs/MCP.md`"; teste versão × docs (`SERVER_VERSION` ⇔ `mcp-v…` em `docs/MCP.md`)
- [x] `SERVER_VERSION = '0.3.3'`; `docs/MCP.md` e `docs/AGENT-GUIDE.md` atualizados (o `docs/TESTING.md` passa a dizer "a versão em `mcp/version.ts`", pela 8.6)

**Aceite**: `npm run build:mcp` e os testes por stdio verdes; a Release `mcp-v0.3.3` criada pelo dono depois do merge; R5.2 a R5.7 do guia com o `mapping-mcp.js` novo.

#### 8.6 — Guia do testador e prompt do Cowork

**Achados G1 a G16** (seção 6). O guia fala com humano e agente ao mesmo tempo (G1, alta para quem testa à mão); a convenção [pessoa] é um parágrafo de ~1.100 caracteres (G2); o mapa da interface está escondido num bullet (G3); passos cujo esperado só se observa no DOM ou no JSON do MCP (G4); passos com duas leituras ou ação dentro do esperado (G5); resíduos de rodadas anteriores nos passos (G6); passos gigantes (G7); ordem de execução fora do lugar (G8); nomes que não existem na interface (G9); seção 5 divergindo do `docs/MCP.md` (G10); o prompt não manda o agente perguntar e dizer que está esperando nos [pessoa] (G11, alta); modo dirigido só por achados (G12); passada visual presa à etapa 6 (G13); redundância com o guia (G14); templates sem os campos que os relatos inventaram (G15); pequenos (G16).

**Toca em:** `docs/TESTING.md`, novo `docs/TESTING-COWORK.md` (o prompt vivo, fora de `history/`), `docs/history/etapa-6-testes-cowork.md` (só o aviso de histórico apontando para o novo), `README.md`, `CLAUDE.md` (só o ponteiro do prompt).

- [x] Nota de desenho aprovada: a estrutura nova do guia (seção "Comece aqui", "Mapa da interface", roteiros com convenções em ≤ 6 bullets, apêndice A "Para o agente testador", apêndice B "Operações de disco por sistema") e o esboço do prompt
- [x] Guia humano: todo "Agente: …" vai para o apêndice A; [pessoa] em quatro bullets; "Permitir em todas as visitas" e "perfil limpo ou registre o estado prévio" na seção 2; mapa da interface com tabela ícone → nome → atalho; ordem e tempo estimado no topo da seção 7 (ou R5 depois de R7)
- [x] Passos: G4 (esperados observáveis por humano, JSON do MCP com a leitura em prosa), G5 (R1.20, R1.13, R4.6, R4.2, R6.1, R0.7, R1.23), G6 (regressões conhecidas em itálico no fim do esperado), G7 (R5.4, R6.8, R0.4, R7.2, R6.10 divididos), G9 ("lista da revisão, coluna **Nível**"; coluna **Origem**), G10 (sha256, aviso ESM, **Verificar a pasta agora**), G16
- [x] Templates: cabeçalho com Modo, Pasta de trabalho, Ferramenta, DPR e viewport, Estado prévio do navegador, Tempo por roteiro; seção **Resumo** obrigatória; **Observações (sem severidade)**; escala de severidade definida (bloqueia, alta, média, baixa); template do marco com Tempo, Navegador/SO, Modo, Tamanho do projeto e a tabela "Sessões"
- [x] Seção nova "Teste manual avançado" com os passos A1 a A18 da revisão (sessão longa, projeto grande, app + MCP simultâneos, duas abas, fechar o navegador, reinício, `file://` × Pages × preview, Edge, DPR, offline, imagens-limite, pasta sincronizada, git, undo profundo, só teclado, zip grande, especialização evoluindo), cada um com o risco que sonda
- [x] Prompt `docs/TESTING-COWORK.md`: só o que é do agente; **pergunta explícita + "estou esperando" em cada [pessoa]** e aviso em espera > 30 s; três alvos do modo dirigido (achados de um relato, lista explícita de passos, fases de um plano) com lista mostrada e confirmada antes; passada visual com lista do dono ou padrão fixo (sete janelas + diálogos principais); item do estado prévio em uma frase
- [x] `README.md` e `CLAUDE.md` apontam para `docs/TESTING-COWORK.md`; `docs/history/etapa-6-testes-cowork.md` ganha o aviso de histórico

**Aceite**: um agente **novo, sem contexto** lê `docs/TESTING.md` como testador humano e executa R0 e R1 "de cabeça" (sem a app), apontando toda frase que exigiria DOM, shell ou conhecimento de rodada anterior; o coordenador cola o resultado no PR e corrige até zerar. Um segundo agente lê só o apêndice A e o prompt e confirma que tem tudo o que os quatro relatos registraram em "O que atrapalhou".

#### 8.7 — Fechamento e portão

**Toca em:** `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-8.md`, `docs/prompts/etapa-8-coordenador.md` (vai para `docs/history/`), `docs/history/revisao-tecnica-2026-10-12.md` (linha no topo apontando para o histórico da etapa), relato da rodada do portão em `docs/history/`.

- [x] Esta seção vai para `docs/history/PLAN-etapa-8.md` com as decisões consolidadas dos PRs, o que valeu de "Decisões a confirmar" e as notas de desenho (ou links); o prompt do coordenador vai junto; `PLAN.md` volta a "nenhuma etapa em andamento"; `docs/ROADMAP.md` marca a etapa 8 concluída; `CLAUDE.md` atualiza "Etapa atual" e a lista de etapas
- [x] Auditoria da entrega (como nas etapas 5 a 7) com os resíduos num PR pequeno
- [x] O `docs/TESTING.md` reflete o comportamento visível das fases 8.1 a 8.5 (a lista "Guia desatualizado" da auditoria; regra "Sem mudar comportamento visível sem registro")
- [x] **Portão:** rodada completa do Cowork sobre o build final, com o prompt novo (`docs/TESTING-COWORK.md`); o relato vai para `docs/history/`; achados altos ou médios voltam para a fase dona antes de fechar a etapa
- [x] `docs/ROADMAP.md`: a seção do marco "Uso real" diz que o teste manual avançado do dono (seção nova do guia) é o próximo passo

**Aceite**: `PLAN.md` sem fases pendentes; relato do portão sem achado alto ou médio; `CLAUDE.md`, `ROADMAP.md` e `docs/history/` coerentes entre si.

### Decisões a confirmar

1. Fila única no `AutoSaver` para gravação e conferência, no modelo de `proposals.ts`; `writing`/`writes`/`stalled()` somem. Proposto: sim.
2. `mapping.json` vazio na gravação = "tente depois", não "de ninguém". Proposto: sim.
3. `write-failed` depois do `flush` compensa como `save-failed` (undo, rollback, `abandoned`), em vez de "proposta primeiro em memória". Proposto: sim (coerente com a 5.2).
4. `ProjectStorage.copyId` (id local; id da entrada dos recentes; id por sessão sem recentes) como chave do retomar; sem id de projeto no schema. Proposto: sim.
5. Resume v2 com `seen` separado e versão ≠ 2 descartada (entradas legadas só existem nos dispositivos do dono). Proposto: sim.
6. Enter em campo de texto confirma e **mantém o foco** (muda o O5 da rodada 3); Chave → Valor continua. Proposto: sim.
7. `overrides` no `package.json` para uma só versão de `@testing-library/dom`. Proposto: sim, com a suíte inteira verde no PR; se mudar o tempo de muitos testes, registrar e decidir caso a caso.
8. Prompt do Cowork sai de `docs/history/` para `docs/TESTING-COWORK.md`. Proposto: sim.
9. MCP 0.3.3 sem cache/paginação (M11). Proposto: sim.
10. Selo **Nova** em toda linha `fresh` (em vez de uma por janela). Proposto: sim; alternativa: contagem "1 nova + N sem revisar".

### Fora desta etapa

- **M11** (cache e paginação de propostas no MCP): aguardar o uso real.
- **A1 a A18** do teste manual avançado são **roteiro**, não correção: o que eles acharem vira a etapa seguinte.
- Evoluções do `docs/ROADMAP.md` ("Diário de recuperação", etc.) e os itens de "Fora desta etapa" das etapas 5 a 7.
- **Flag `unexported` persistido com duas fontes** (resíduo 2 da auditoria; S4): o signal vem do `onChanged` da sessão, mas o `src/storage/local.ts` ainda grava `unexported: true` por conta própria ao gravar o `mapping.json` e a proposta de um projeto local. Aceito como resíduo nas notas 8.1 (D1) e 8.4 (§4).
- **Duas pastas com o mesmo nome de projeto e de pasta** (resíduo 3; R7): continuam com linhas iguais nos recentes, porque o navegador não dá o caminho da pasta, só o nome; a coluna **Último uso** as distingue. Limite escrito no `docs/ARCHITECTURE.md` (recentes).
- **`src/app/Home.tsx` acima de 600 linhas** (resíduo 4; o único aviso de `max-lines`): dividir a tela inicial (tabela de recentes, diálogos) é trabalho de foco e interface, não de fechamento.

---

## Fechamento (fase 8.7)

### Decisões a confirmar: o que valeu

As dez foram adotadas como **Proposto**, sem comentário do dono que as mudasse:

1. Fila única no `AutoSaver` para gravação e conferência; `writing`, `writes` e `stalled()` sumiram (8.1, #126; também `checkStalled`, `syncing` e as três checagens de `idle()`).
2. `mapping.json` vazio na gravação é "tente depois": nova tentativa dentro da gravação, 4 × 250 ms (`EMPTY_RETRY_ATTEMPTS`, `EMPTY_RETRY_DELAY_MS`), depois **Erro ao salvar** com `session.emptyMapping` no Diagnóstico e três saídas: Exportar, apagar o arquivo ou o conflito pela conferência (8.1, D2).
3. `write-failed` depois do `flush` compensa como o `save-failed`: desfaz a entrada (`abandoned`, `undo`, `discardRedoOf`), confirma a regravação com `flush` e só então tira as cópias de `images/` (8.2, #131; ordem D6 da nota).
4. `ProjectStorage.copyId` como chave do retomar, sem id de projeto no schema (8.4 define e preenche, #130; a 8.2 lê só o `copyId`, sem fallback, porque a 8.4 entrou antes do código dela).
5. Resume v2 com `seen` separado e versão ≠ 2 descartada: a perda única do retomar e do "vista" nos dispositivos do dono está escrita na seção 2 do guia (8.2).
6. Enter num campo de texto confirma e **mantém o foco**; Chave → Valor continua (8.3, #127; muda o O5 da rodada 3). A guarda contra a gravação dupla nasceu sem zerar e foi corrigida na devolução #137.
7. `overrides` do `@testing-library/dom` (uma versão só, 10.4.2): a suíte inteira passou sem ajuste de tempo; o único ajuste foi um `exact: true` em `tests/components/CodeRefs.test.tsx` (8.3).
8. O prompt do Cowork saiu de `docs/history/` para `docs/TESTING-COWORK.md` (8.6, #124).
9. MCP sem cache nem paginação (M11 fora). A etapa publicou a 0.3.3 (8.5, #125) e a 0.3.4 (devolução do portão, #138).
10. Selo **Nova** em toda linha `fresh`, com o botão principal também (D2 da nota da 8.2), em vez da contagem "1 nova + N sem revisar".

### Decisões consolidadas dos PRs

**Coordenação**

- Plano no #123. **Onda 1**, em paralelo: #125 (8.5), #124 (8.6), o relato da rodada 4 (#128) e o complemento da 8.6 com ele (#129), #126 (8.1) e #127 (8.3), mergeados nessa ordem; a 8.1 e a 8.3 mergearam a `main` antes, sem rebase, juntando os blocos de `no-restricted-syntax` do `eslint.config.js` (no flat config o último bloco vence). **Onda 2:** #130 (8.4), depois #131 (8.2), que já partiu do `copyId`. **Onda 3:** #133 (8.7 parte 1), a segunda leitura do dono (#135) e as devoluções dela (#137 da 8.3 e #136 da 8.6); com elas na `main`, o portão (rodada 5, build `e701862`); depois as devoluções do portão (#138 da 8.5, #139 da 8.2, #140 da 8.4) e a rodada 6 (build `1710ed5`); por fim, o fechamento (#141).
- Toda fase teve a **nota de desenho aprovada antes do código**, hoje em [`etapa-8-notas/`](etapa-8-notas/), com as revisões feitas depois da implementação ou nas devoluções: 8.1 até a revisão 4 (C1 a C3), 8.2 até a 5 (achado 7 do portão), 8.3 até a 2 (devolução #137), 8.4 até a 3 (achado 1 do portão, com "Reprodução"), 8.5 até a 2 (EPERM, 0.3.4; a revisão 1, com a aprovação e os desvios, foi registrada no fechamento) e 8.6 até a seção 13 (devolução #136).
- Em toda fase com código, o commit do teste que reproduz o achado veio antes do da correção (exceções registradas na auditoria: o teste do F7, retroativo, e o `closest` por classe do #133, no mesmo commit).
- Nada do schema v8 nem do formato da proposta mudou. MCP: tag `mcp-v0.3.3` criada pelo dono depois do #125; Release `mcp-v0.3.4` publicada pelo dono em 2026-10-13, depois do #138.
- Fora da etapa, mergeados no meio dela: a skill `spec-author` (#132) e o esqueleto de pasta central de mapeamentos `examples/workspace/` (#134).

**8.1 — Sessão e gravação (#126)**

- **Fila única** no `AutoSaver`: gravação e os trabalhos de `enqueue()` (conferência, recarga, decisão do conflito) rodam um de cada vez; `saving` antes de toda gravação, inclusive a enfileirada atrás de uma que falhou (S2); `reset()` cancela a enfileirada ainda não iniciada (`generation`). Invariantes testadas por passeio aleatório (20 sementes × 200 passos).
- **D1 (S8):** `collectFiles().saved` e o snapshot exportado. O aviso "exportando com alterações não gravadas" ficou para depois e entrou no #133 (ver 8.7). **Resíduo aceito:** o flag `unexported` persistido tem duas fontes (abaixo, "Fora desta etapa").
- **D3 (S5):** com o conflito aberto e a pendência desfeita, o diálogo fica até a pessoa decidir; o status mostra "Salvo". **D4 (S7):** "Manter as minhas" com a leitura lançando segue como arquivo sumido; `resolveConflict` nunca rejeita. **D5:** `AutoSaver.enqueue`, sem `settled()`; a fila de `proposals.ts` não mudou.
- **Revisão 4 da nota (C1 a C3):** `written` compara por identidade no efeito e por conteúdo a menos do `updatedAt` no trabalho de gravação, porque o desfazer devolve um objeto novo com `updatedAt` novo (C1); o `stat` da abertura só vale se uma releitura logo depois confirma o arquivo (C2); uma `sync()` pedida com gravação em curso roda atrás dela e devolve `unchanged`, e `busy` fica para gesto em andamento e gravação agendada ou enfileirada (C3). O checkbox da nota no plano cita a revisão 3; a nota terminou na revisão 4.
- **Regras automáticas:** `sessionStorageSyntaxRules`, `sessionFileSyntaxRules` e `controllerFileSyntaxRules` no `eslint.config.js`, com `tests/tooling/sessionStorageLint.test.ts`.
- `docs/ARCHITECTURE.md`: os itens "Persistência" e "Revisão e mudanças externas" viraram a seção "Sessão e gravação".

**8.2 — Revisão de propostas (#131 e #139)**

- **Projeto à vista:** `review.derived.shownProject` é a única fonte do que a tela descreve; o canvas deriva `drawnProject` dele e o estado derivado do editor o recebe (D5): na visão Proposto, Camadas, Lista, Incompletas e os indicadores mostram o "como ficaria", sem aviso "visão Atual". Catraca `tests/tooling/shownProjectReaders.test.ts` com a allowlist exata de 12 arquivos.
- **Retomar por cópia** (`copyId|proposalId`) e blob `mapping.reviewResume` v2: `seen` sem limite, `resume` com as 12 mais recentes **por cópia**; o formato antigo é descartado, não migrado. Sem observador do evento `storage`: o que outra aba marcou como vista entra nesta na próxima gravação ou abertura (D4, limite no `ARCHITECTURE.md`).
- **"Nova":** `rows[].fresh` é a verdade, com selo e botão principal em toda linha `fresh` (D2; o HANDOFF-PROPOSALS dizia uma por janela); abrir tira só o aviso `added` da proposta (`dismissNotice`, D3).
- **Conflitos novos** ao vivo; ao fechar, ficam conhecidos os à vista na abertura, os anunciados nela e os decididos (F1 da nota: senão um conflito anunciado e sem decisão voltaria a cada reabertura).
- **P7:** compensação como no `save-failed` (acima, decisão 3).
- **Devolução do portão (#139, achado 7):** o "Aplicar aceitas" conferia as aceitas contra um projeto que já as tinha, porque `store.apply` vem antes de o `proposal.json` com `applied` ser gravado. `review.apply()` segura a revisão (`derived.hold()`) do clique ao fim do aplicar, com o retrato preso à proposta aberta e o botão em "Aplicando as aceitas…"; ao soltar, tudo é recalculado, então um conflito real que surgir no meio aparece. O "Aplicar bloqueado" cita camada, especialização e anotação pelo nome ("O alvo desta mudança (camada) não existe mais no projeto atual." quando o alvo sumiu). Catraca `tests/tooling/applyAcceptedCallers.test.ts`: só `src/store/review.ts` chama `.applyAccepted(`. **Limite registrado:** o refazer de uma aplicação (Ctrl+Z e Ctrl+Shift+Z) ainda pode mostrar os mesmos avisos falsos (lista do marco no `ROADMAP.md`).
- `docs/PROPOSAL-FORMAT.md` não mudou.

**8.3 — Foco, diálogos e teclado (#127 e #137)**

- **F1 na causa:** `Dialog` e `RefPicker` abrem por `useModal`, em `useLayoutEffect` (`showModal`, foco, `modalOpen` e o retorno no mesmo commit); o teste do flake roda 20 vezes no CI por `repeats: 19`.
- **Divergências aprovadas de dois `[x]` da fase** (registradas no #127 e na nota, §11): o checkbox dizia "`origin?: FocusOrigin` vindo do host"; virou a **origem por contexto**, `useDialogSlot` com `DialogSlotContext` e reivindicação única pelo primeiro `Dialog` montado, o mesmo contrato por outro meio (uma prop teria de passar por seis diálogos embrulhados e erraria nos irmãos que o `SpecsDialog` abre por cima). E dizia "`goToAnnotation` vira o `returnFocus` do `RefPicker`"; o dono do "ir para" virou o **painel** (`AnnotationsPanel`, no commit que desenha o cartão), porque o `goToAnnotation` também é chamado sem diálogo (backlinks, pendências, Incompletas, criação); o retorno do seletor ficou como rede de segurança.
- Na tela inicial, **Excluir** e **Remover da lista** pelo diálogo fecham **depois** da ação, com o botão desabilitado por um instante, e devolvem o foco à linha que ficou.
- **Esc** num campo com o que reverter só reverte; sem o que reverter, sobe e fecha o diálogo. Menus e popovers devolvem o foco ao gatilho em todo fechamento, só quando o foco estava no menu; na escolha, antes da ação do item. `alert` (`role="alertdialog"` + `aria-describedby`) só nas confirmações destrutivas. `aria-keyshortcuts` sempre por `ariaKeys()`.
- Exceções nominais da regra de seletores: `focus.ts`, `toolWindowLayout.ts` e o Alt+N de `useEditorShortcuts.ts`.
- **Devolução da segunda leitura (#137):** o **alto** da auditoria (gravar, desfazer e redigitar o mesmo texto: o Enter não gravava) corrigido: a guarda vale só enquanto o valor externo ainda é a base daquela gravação e o rascunho do par passa a ser o par gravado; com um `onCommit` que normaliza para o próprio valor atual, redigitar o mesmo texto é ignorado (escolha do coordenador). O médio do `MenuPopover`: fecha na captura do clique, então o gatilho recebe o foco antes de o item agir.

**8.4 — Recentes e controller (#130 e #140)**

- Ordem **ler → guardar → abrir**: o editor aparece depois do `remember` (R1 some por construção; `openFolderId` virou `OpenProject.folderId`, opcional para não mexer nos harnesses); se o `remember` falha, o projeto abre com o id por aba.
- `ProjectStorage.copyId`: local, o id do projeto; pasta nos recentes, o id da entrada (sobrevive ao Localizar); pasta fora dos recentes, um id por aba em `sessionStorage` (`readSessionSetting`/`writeSessionSetting`), com um `Map` de reserva.
- Split do `controller.ts` em `recents.ts`, `pageLifecycle.ts` e `appResult.ts` (fora de "Toca em", aprovado, para evitar um ciclo de imports), com re-exports; 435 linhas na fase e 449 depois do #133 (aceite: menos de 450).
- `loadMapping` proibido no `controller.ts` (`hasMappingFile`); `showFolderName` considera só as pastas da lista. Duas pastas com o mesmo nome de projeto **e** de pasta continuam iguais (limite no `ARCHITECTURE.md`).
- `max-lines` (600, `warn`) em `src/app/**` com `skipBlankLines` e `skipComments`: o `Home.tsx` ficou com 604 linhas e um aviso. **Resolvido no #140:** `recentRowIndex`/`recentRowTarget` foram para `src/app/recentRows.ts` e o aviso sumiu.
- **Devolução do portão (#140, achado 1):** não reproduziu em duas tentativas na prévia, porque o Chrome não pediu a permissão; achado registrado como **limite**, sem correção (decisão do dono antes da reprodução). Ficou o **rastro** `folders.reopen` (`src/app/reopenTrace.ts`), diagnóstico permanente: grava só quando o caminho passou pelo pedido de permissão e não abriu o projeto, ou quando o resultado não virou nem o aviso na tela nem o projeto aberto. O `Dialog` ganhou a origem do `onCancel` e um `dialogRef`.

**8.5 — Servidor MCP 0.3.3 e 0.3.4 (#125 e #138)**

- Q1 a Q5 como propostos: nome de raiz repetido dá `unknown-root` com "use o caminho"; numa `superseded`, só as aceitas reservam nome em `images/`; qualquer falha ao marcar a anterior vira o aviso `supersede-failed`; o teste de versão lê só `docs/MCP.md` e `docs/AGENT-GUIDE.md`; as restrições de import dos escritores de `mcp/**` entraram no ESLint.
- Códigos de erro com o mesmo nome de um do modelo não mudaram de nome; `image-exists` é código novo. Desvios da nota: o gancho de disco é `tests/mcp/fsHooks.mjs` (`node --import`) e os testes por stdio de M3 a M5 ficaram em `tests/mcp/proposalDisk.test.ts`.
- **Devolução do portão (#138, MCP 0.3.4):** numa pasta montada, o `rm` do temporário depois do `link` subia `EPERM` com o `proposal.json` já gravado, e o agente recebia `internal-error` (e duplicaria a proposta). A limpeza do temporário passou a ser em melhor esforço: qualquer erro do `rm` vira um aviso no stderr, sem mudar a resposta nem criar código de aviso; `EEXIST` com o `rm` recusado dá `image-exists`. O `docs/MCP.md` diz que o `.tmp` que sobra pode ser apagado à mão.

**8.6 — Guia do testador e prompt do Cowork (#124, #129 e #136)**

- Códigos de passo estáveis (os relatos os citam); passo dividido ganhou letra (R0.4a/b, R5.4a/b, R6.8a/b, R8.1a/b) e o R7.2 virou uma lista de oito passos. Seções renumeradas (5 é o mapa da interface, 9 o teste avançado, 10 os templates). Um template para todos os modos. Os textos do plano que citam "quatro bullets" no [pessoa] e "o topo da seção 7" descrevem o pedido: o bloco ficou com seis bullets e a ordem foi para o "Comece aqui".
- **#129:** as observações da rodada 4 no guia (avisos curtos, nome atual na lista e em Detalhes, campo de nota, hachura na visão Atual e selo **+** só com zoom, os dois por desenho).
- **#136 (devolução da segunda leitura):** o build id esperado na pergunta única e na mensagem da rodada (M6), **[pessoa]** nos pedidos ao Claude Code do R5 (M4) e a raiz `assets/` no `.mcp.json` com o R5.2 pedindo a raiz `design/mapeamentos` (M3), com quatro checagens novas em `tests/tooling/testingGuide.test.ts`.

**8.7 — Fechamento e portão (#133 e #141)**

- **Parte 1 (#133):** os 15 itens "Guia desatualizado" da auditoria do coordenador, mais R5.2b, R6.3b (`mapping.json` vazio) e R6.9b (exportar com a gravação em erro). O aviso do Exportar com alterações não gravadas (`export.unsaved`, resíduo 1). **Exportar só conta quando o arquivo sai** (decisão do dono): `collectFiles()` não marca mais nada; o controller guarda o snapshot do último zip e o repassa no `markExported`. `closest('.classe')` virou `data-*` e a regra passou a pegar `closest` (resíduo 5); teste do fechar do `RefPicker` (resíduo 7); limite do R7 e a terceira exceção de foco (o `afterPaint` da Árvore) no `ARCHITECTURE.md` (resíduos 3 e 6); `.claude/worktrees` ignorado pelo ESLint e pelo Prettier (resíduo 12: só os worktrees, porque `.claude/skills/` é do repositório).
- **Parte 2 (#141):** os relatos das rodadas 5 e 6 (o da 6 com o anexo do rastro do R0.7); esta seção e as decisões; as notas para [`etapa-8-notas/`](etapa-8-notas/) (a pasta `docs/design/` deixou de existir) e o prompt do coordenador para esta pasta (`docs/prompts/` também); `PLAN.md` sem etapa em andamento; o `docs/ROADMAP.md` com a etapa concluída e a lista do marco; o `CLAUDE.md`. No guia: R4.4 e R5.6 (a dica do item trancado fica na lista da revisão e no cartão da mudança, não na Árvore), R2.6 (o foco vai ao **Abrir** da linha que ocupou o lugar da excluída; o contorno só pelo teclado), R3.6 e R6.8a (**Aceitar tudo** na barra; **Em lote** abaixo de 1200 px), o `file` relativo à raiz no R5, e os médios M1, M2 e M5 e os baixos de documentação da segunda leitura; no `ARCHITECTURE.md`, o M7 e os baixos de documentação das seções 3.1 a 3.6; no prompt do Cowork, o que a seção 3.6 apontou.

### Auditoria

- **Auditoria do coordenador** (sobre `af9d21f`, depois dos PRs #124 a #131; não foi guardada no repositório): 12 resíduos, todos tratados ou registrados no #133 (tabela "Resíduo → onde" da descrição dele): 1, 3, 5, 6, 7, 8, 10 e 12 corrigidos; 2 e 4 em "Fora desta etapa" (o 4 depois resolvido no #140); 9 e 11 no fechamento (#141: as divergências da 8.3, acima, e os links das notas).
- **Segunda leitura do dono** ([`auditoria-etapa-8.md`](auditoria-etapa-8.md), #135, sobre `312915f`): 1 alto, 8 médios e uns 30 baixos. O alto e o médio do `MenuPopover` foram para a 8.3 (#137); os médios M3, M4 e M6 do guia e do prompt, para a 8.6 (#136), antes do portão; M1, M2, M5 e M7 e os baixos de documentação, para o fechamento (#141); os baixos de código que nenhuma devolução tocou, para a lista do marco no `ROADMAP.md`. Seção 4 (para o Fable): a **pergunta 1** (a correção do alto) foi respondida na revisão do #137; as **perguntas 2 a 4** (a corrida teórica do P7, a imagem que sai e volta durante uma gravação e a premissa do `close()` que rejeita no navegador) foram fechadas pela terceira leitura, em 2026-10-15 (seção 6 da auditoria): a corrida do P7 **confirmada e reproduzida** (vai num PR pequeno, com a guarda `undone` na compensação e o teste que falha antes: #144); a imagem que sai e volta **confirmada sem defeito** (o disco nunca cita arquivo ausente; a invariante depende só de `readImage` devolver o arquivo recém-gravado); a premissa do `close()` **confirmada**, com um limite registrado na lista do marco (um `close()` que rejeitasse depois da troca deixaria a proposta presa como "aplicada").

### Portão

- **Rodada 5, completa** (2026-10-13, build `e701862`, MCP 0.3.3; [`relato-2026-10-13-portao.md`](relato-2026-10-13-portao.md)): 98 linhas, 91 ✅ e 7 ❌; 10 achados, nenhum alto, 2 médios. Os médios e o EPERM do MCP ("O que atrapalhou") voltaram às fases donas: o achado 7 (avisos falsos ao aplicar) à 8.2 (#139, corrigido); o EPERM à 8.5 (#138, MCP 0.3.4, corrigido); o achado 1 (pasta renomeada: depois do pedido de permissão, o aviso não aparece) à 8.4 (#140, não reproduziu; limite e rastro). O achado 3 e o 5 eram texto do guia (corrigidos no fechamento, #141); os baixos 2, 4, 6, 8, 9 e 10 e as observações foram para a lista do marco.
- **Rodada 6, dirigida** (2026-10-14, build `1710ed5`, MCP 0.3.4: R0, R4.1 a R4.8 e R5.2 a R5.7; [`relato-2026-10-14-dirigida.md`](relato-2026-10-14-dirigida.md)): 23 ✅, 1 ❌ e R0.5 parcial. Nenhum aviso falso nos quatro Aplicar (R4.7, R5.3, R5.4a e R5.6) e o Conflito real no R5.5; `propose_changes` sem `internal-error` na pasta montada, com os `.tmp` e o aviso no stderr como desenhado. **R0.7:** o caminho do achado 1 foi exercido com o pedido de permissão (`query=prompt`, `request=granted` 45 s depois do clique, `branch=no-mapping`), o aviso montou visível (`shown=open,modal,visible`) e foi fechado por **Localizar pasta…** (`relocate`) 104 s depois: o defeito não apareceu (anexo no fim do relato). O único ❌, R4.4, é o achado 5 do portão, erro do guia.
- **Resultado:** nenhum achado alto ou médio aberto; a etapa fecha.

### Fora desta etapa (acrescentado no fechamento)

Tudo abaixo está na lista do marco "Uso real" do [`../ROADMAP.md`](../ROADMAP.md), com o detalhe:

- **Achado 1 do portão como limite:** não reproduziu em três tentativas depois do portão (duas sem o pedido de permissão, na prévia do #140; uma com o pedido, na rodada 6); o rastro `folders.reopen` fica no código.
- **O refazer de uma aplicação** pode mostrar os avisos falsos que o #139 tirou do aplicar (não apareceu no R4.8 nem no R5.3 da rodada 6).
- **O cadeado da Árvore na revisão** mostra a dica "Destrancar <nome>" (botão desabilitado), não "Item trancado…": decisão de produto.
- **`home=unmounted` do rastro**, documentado mas inalcançável pelo hook: a limpeza do `useReopenTrace` chama `end()` antes de o resultado chegar. Duas saídas: não encerrar um rastro pendente na limpeza (3 linhas) ou tirar do `ARCHITECTURE.md` e da nota.
- **Baixos do portão** 2, 4, 6, 8, 9 e 10 e as **observações** (foco no `body` depois de desenhar, a dica do Desenhar sobre os nomes das imagens, o plural "(s)" em inglês, recentes que não atualizam entre janelas, texto do Formulário cortado no canvas no R3.3, **Último uso** que não muda ao reabrir pelo zip no R2.5).
- **Baixos de código da segunda leitura** (seções 3.1 a 3.5) que nenhuma devolução tocou, e as perguntas 2 a 4 da seção 4.
- **Flag `unexported` persistido com duas fontes** (resíduo 2; S4) e **duas pastas com o mesmo nome de projeto e de pasta** (resíduo 3; R7, limite escrito no `ARCHITECTURE.md`), como já estavam em "Fora desta etapa".
- **M11** (cache e paginação de propostas no MCP), os itens A1 a A18 do teste manual avançado (roteiro, não correção) e os itens de "Fora desta etapa" das etapas 5 a 7 continuam valendo.
- **Resolvidos depois de registrados aqui:** o `Home.tsx` acima de 600 linhas (resíduo 4) saiu no #140 (`recentRows.ts`); o lint local com worktrees em `.claude/worktrees/` (resíduo 12) saiu no #133.
- **Próximo passo:** o teste manual avançado do dono (seção 9 do [`../TESTING.md`](../TESTING.md)), antes do uso com pessoas.
