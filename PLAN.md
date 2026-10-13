| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, a etapa 8). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes) e 7 (correções da rodada dirigida) concluídas; etapa 8 (consolidação por subsistema) em andamento**. As demais (marco de uso real e evoluções) estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

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
| [`docs/history/PLAN-etapa-6.md`](docs/history/PLAN-etapa-6.md) | Histórico: etapa 6, correções da primeira rodada de testes (fases 6.1 a 6.7 concluídas; decisões consolidadas dos PRs; relato da rodada 1 e prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-7.md`](docs/history/PLAN-etapa-7.md) | Histórico: etapa 7, correções da rodada dirigida (fases 7.1 a 7.4 concluídas; decisões consolidadas dos PRs; relato da rodada 2 e prompt do coordenador ao lado) |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/prompts/etapa-8-coordenador.md`](docs/prompts/etapa-8-coordenador.md) | Prompt do coordenador de agentes da etapa 8 (nota de desenho antes do código; modelo e esforço por fase; modos de execução) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas, marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |

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

Prompt em `docs/prompts/etapa-8-coordenador.md` (modelo e esforço por fase, modos completa, parcial, paralela e sequencial, e o passo novo de aprovar a nota de desenho). Regras:

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

- [x] Nota de desenho aprovada: a máquina de estados alvo (estados, transições, quem dispara), a fila única e o contrato de `flush`/`FlushResult` que a 8.2 vai usar (`docs/design/etapa-8-1.md`, revisão 3)
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

- [x] Nota de desenho aprovada: o blob `mapping.reviewResume` v2 (`seen` separado de `resume`, chaves `copyId|proposalId`, zod, versão ≠ 2 descartada), o contrato de "nova" e o uso de `shownProject` em todo consumidor (`docs/design/etapa-8-2.md`, revisão 4)
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

- [ ] Esta seção vai para `docs/history/PLAN-etapa-8.md` com as decisões consolidadas dos PRs, o que valeu de "Decisões a confirmar" e as notas de desenho (ou links); o prompt do coordenador vai junto; `PLAN.md` volta a "nenhuma etapa em andamento"; `docs/ROADMAP.md` marca a etapa 8 concluída; `CLAUDE.md` atualiza "Etapa atual" e a lista de etapas
- [ ] Auditoria da entrega (como nas etapas 5 a 7) com os resíduos num PR pequeno
- [ ] O `docs/TESTING.md` reflete o comportamento visível das fases 8.1 a 8.5 (a lista "Guia desatualizado" da auditoria; regra "Sem mudar comportamento visível sem registro")
- [ ] **Portão:** rodada completa do Cowork sobre o build final, com o prompt novo (`docs/TESTING-COWORK.md`); o relato vai para `docs/history/`; achados altos ou médios voltam para a fase dona antes de fechar a etapa
- [ ] `docs/ROADMAP.md`: a seção do marco "Uso real" diz que o teste manual avançado do dono (seção nova do guia) é o próximo passo

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
