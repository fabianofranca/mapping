> **Documento da revisão técnica dirigida** feita em 2026-10-12 sobre a `main` `48f8e32`, depois das etapas 5 a 7 e das quatro rodadas de teste do Cowork. Só leitura: seis revisores, um por área, e a conferência das causas principais no código. É a origem da **etapa 8** (`PLAN.md`), que cita os achados pelo código da área mais o número do achado no relatório correspondente: **S** = seção 1 (sessão e persistência), **P** = seção 2 (revisão de propostas), **F** = seção 3 (foco, diálogos e teclado), **R** = seção 4 (armazenamento e recentes), **M** = seção 5 (servidor MCP), **G** = seção 6 (guia e prompt do testador). Ex.: S1 é o achado 1 da seção 1. Guardado como foi entregue; a síntese do topo foi escrita pelo coordenador da revisão.

---

# Revisão técnica dirigida — Mapping, `main` 48f8e32 (2026-10-12)

> Só leitura. Seis revisores, um por área, mais a conferência das causas principais no código. Depois da síntese vêm os seis relatórios na íntegra, com `arquivo:linha` em cada achado.

## Resumo

A base está sólida: as camadas de baixo (`model`, `store`, `storage`) estão limpas e impostas por lint e teste; o modelo de segurança de caminho do MCP, a ordem de gravação do `mapping.json`, o `committed` separado do gesto e o aplicar aceitas como uma entrada de undo são desenhos corretos e bem testados. O que a revisão encontrou é o efeito previsto de três etapas de correção pontual: cada remendo certo, o conjunto com costuras. São 71 achados em seis áreas; 3 altos de código, 2 altos de documentação, 16 médios, o resto baixo. Nenhum é do tipo "a app perde dados no uso normal", mas dois são do tipo "perde em condição plausível e em silêncio", e esses dois vão primeiro.

## Os achados que decidem a etapa

| # | Área | Achado | Sev. | Custo |
|---|---|---|---|---|
| S1 | Sessão | `mapping.json` vazio na hora de gravar é tratado como "de ninguém": um editor que trunca e depois escreve faz a app gravar por cima e, no `sync` seguinte, recarregar o arquivo do editor; a edição local some com o aviso "Projeto atualizado por fora", sem conflito. | alta | pequeno |
| P7 | Revisão | Aplicar aceitas: `mapping.json` grava, `proposal.json` falha → projeto com as mudanças, proposta sem `applied`, reaplicar dá conflito, imagens duplicadas; a 5.2 só tratou a falha do `mapping.json`. | média (integridade) | médio |
| S2/S3 | Sessão | O `AutoSaver` deixa `status='error'` durante uma gravação enfileirada; a 6.2 corrigiu o sintoma com `writing`/`writes`/`stalled()` em vez da origem; `adopt`/`resolveConflict` não esperam a fila e uma gravação em curso pode sobrescrever o arquivo recém-adotado. Desenho: uma fila para gravação e conferência, como `proposals.ts` já faz. | média | médio |
| F1 | Foco | Causa do flake: o `Dialog` abre e registra o retorno em `useEffect`; o `user-event` usa outra versão de `@testing-library/dom` (10.4.2 na raiz, 8.20.1 aninhada no `@testing-library/preact`), então não roda em `act` e o clique pode chegar antes do efeito. Fix: `useLayoutEffect` + helper de teste que espera o foco entrar no diálogo + decidir `overrides` da versão. | alta | pequeno |
| F3 | Foco | Bug real: Configurações → Ver atalhos → Esc deixa o foco no primeiro controle da app, porque a troca de diálogo no mesmo slot desmonta o antigo antes de o novo capturar a origem. | média | pequeno |
| F2/F4/F5 | Foco | Duas autoridades de foco (Dialog × `useEffect` do host) em Home e no "ir para anotação"; nove seletores de DOM atravessando componentes; quatro Enters e quatro Escs sem política. Desenho: um dono por fechamento (`returnFocus` por ref), `buttonRef`/`triggerRef` nos controles, política de teclado em `ARCHITECTURE.md`, regra ESLint contra `document.querySelector` em `ui/`/`app/`. | média | médio |
| P1 | Revisão | Nove consumidores leem `store.committed` na revisão (trilha, barra de status, cursor, atalhos, minimapa, Camadas, Lista, Incompletas); só Árvore, canvas e avisos usam `shownProject`, e o canvas tem outra definição própria. | média | pequeno |
| P2/R3 | Revisão + Recentes | Chave do retomar por nome da pasta colide; não há id de projeto no schema; o id da entrada dos recentes é a chave estável. `ProjectStorage.copyId`. | média | pequeno |
| P3/P4 | Revisão | "Vista"/"Nova" é efeito colateral do resume (corte em 12 globais evicta e a proposta volta a "nova"; `localStorage` bloqueado idem); três noções de "nova" sem contrato. Separar `seen` do resume num blob versionado. | média | pequeno |
| M1/M3 | MCP | `root` relativo recusado (O8); as três promessas de concorrência do `docs/MCP.md` (`revision-conflict`, `read-only`, `supersede-failed`) sem teste por stdio. Mais 10 baixos; tudo cabe numa 0.3.3. | média | pequeno |
| R9 | Recentes | `controller.ts` com 8 responsabilidades em 713 linhas; split de baixo risco (`recents.ts`, `pageLifecycle.ts`). Mais uma corrida fechar × guardar (`openFolderId`) e 8 baixos. | média | pequeno-médio |
| G1/G2/G11 | Guia | O guia fala com humano e agente ao mesmo tempo (15 bullets de convenções, 5 só de agente); a convenção [pessoa] é um parágrafo de 1.100 caracteres; o prompt não manda o agente perguntar e dizer que está esperando. Mais 13 achados editoriais e 18 passos candidatos para o teste manual avançado. | alta (para o teste) | médio |

## O que está bom (consenso dos seis)

- Camadas: `store/` e `storage/` não importam `ui/` nem `app/`; `model/` puro e compartilhado de verdade com o MCP (19 imports, só de `src/model`).
- Gravação: ordem arquivos → re-conferência → `mapping.json` → limpeza; `revision` fora do store; comparação por texto; `committed` nunca vai ao disco com gesto em curso.
- MCP: `..`/absolutos/symlinks tratados e testados; "só a app grava o `mapping.json`" é verdadeiro e tem guarda dupla; limites de memória de ponta a ponta; 22 tools testadas por stdio no bundle real.
- Recentes: a lista nunca lê handles; permissão pedida dentro do gesto; migração dos bancos pensada; todo caminho de falha passa por `reportError`.
- Revisão: conflitos recalculados e memoizados, nunca persistidos como tal; toda gravação da proposta relê o disco e refaz a mutação pura.
- Foco: um só lugar decide o retorno, `tryFocus` confere `activeElement`, `closable={false}` robusto.

## Etapa 8 proposta — consolidação por subsistema

Formato combinado: uma fase por subsistema, um executor que vê o todo, nota de desenho aprovada pelo coordenador antes do primeiro commit, sequencial dentro do subsistema e paralelo só entre arquivos disjuntos, uma regra automática por padrão a evitar, auditoria no fim e uma rodada completa do Cowork como portão antes do teste manual do dono.

| Fase | Conteúdo | Modelo/esforço | Onda |
|---|---|---|---|
| 8.1 Sessão e gravação | S1 a S10: fila única para gravar e conferir; vazio = "tente depois"; `adopt` dentro da fila; `unexported` com uma fonte; teste de invariantes do `AutoSaver`; regra ESLint para `loadMapping`/`saveMapping`. | Fable 5.1 alto | 1 |
| 8.2 Revisão de propostas | P1 a P11 + R3: `shownProject` como única fonte (inclusive canvas); `copyId`; `seen` separado do resume (blob v2); compensação do `write-failed` após `flush`; "Nova" com um contrato; `levelType`/status para `model/`. | Fable 5.1 alto | 2 (depende do contrato de `flush` da 8.1) |
| 8.3 Foco, diálogos e teclado | F1 a F10: `useLayoutEffect`; origem no host (troca de diálogo); um dono por fechamento; `buttonRef`/`triggerRef`; política de teclado documentada (Enter mantém o foco); menus devolvem o foco em todo fechamento; ESLint contra `querySelector` global; `modalFocus` no setup global; decisão sobre `overrides` do `@testing-library/dom`. | Opus 5.5 alto | 1 |
| 8.4 Recentes e controller | R1, R2, R4 a R10: split do `controller.ts`; corrida `openFolderId`; `touchFolder` no `onSaved`; `requestPersistentStorage` nas pastas; `folderName` quando há nome repetido; ESLint para `indexedDB`/`localStorage` fora de `local.ts`/`safeStorage.ts`. | Opus 5.5 médio | 2 (depende da 8.3 em `Home.tsx`) |
| 8.5 MCP 0.3.3 | M1 a M10, M12 a M14: `root` relativo; sem `images/` vazia; `link` com fallback; reservas da substituída; testes por stdio da concorrência; registro de códigos de erro; guarda estática recursiva; versão × docs; release. | Opus 5.5 alto | 1 |
| 8.6 Guia e prompt | G1 a G16: guia humano com apêndice do agente; mapa da interface; passos divididos; templates com Resumo e severidades; prompt do Cowork em `docs/TESTING-COWORK.md` com "pergunte e diga que está esperando" e os três alvos do modo dirigido; roteiro do teste manual avançado (A1 a A18) como seção nova. | Opus 5.5 médio | 1 |
| 8.7 Fechamento e portão | Histórico, decisões consolidadas, rodada completa do Cowork sobre o build final. | Opus 5.5 médio | 3 |

Fora: cache/paginação de propostas no MCP (M11), aguardar o uso real; "Diário de recuperação" e demais evoluções do ROADMAP.


---

# 1. Sessão e persistência

# Revisão (somente leitura): sessão e persistência

## Mapa — a máquina de estados como está no código

**Camada 1 — `AutoSaver` (`src/storage/autosave.ts`)**: estado = `status` ∈ {saved, saving, error} + `dirty` + `timer` + `queue` (fila de promessas).
- `schedule()` (L75): `dirty=true`, `status='saving'`, reinicia o timer (250 ms) → `flush` interno.
- `flush` interno (L54): limpa o timer, enfileira: se `!dirty` → ok; `dirty=false`; `save()`; sucesso → `status='saved'` só se `!dirty && timer===undefined`; erro → `dirty=true`, `status='error'`, `reportError('save')`.
- `flush()` público (L82): `error`→`saving` só se `dirty`; depois o interno.
- `reset()` (L86): zera timer/dirty, `status='saved'` — **não toca na fila**.
- `dispose()` (L91): só bloqueia `schedule` e limpa timer; `dirty` fica.

**Camada 2 — sessão (`src/store/session.ts`)**: acrescenta `disk` {revision, text, lastModified} (L210), `conflict` (L215), `writing`/`writes` (L220-221), `syncing`/`closed` (L448-449), `pendingBackup` (L204), `stored`/`trash`/`writtenSpecs`.
- Quem dispara a gravação: `effect` sobre `store.revision` → `saver.schedule()` (L394-400); `saveNow` nas operações caras (L362-374); `addImages`/`replaceImage` (L600, L629); `applyAccepted` via `deps.flush` (proposalActions L374); `collectFiles` (L647); `close()` (L671); `resolveConflict('keep')` (L543); fora da sessão: `pagehide`/`visibilitychange:hidden`/`beforeunload` (controller L698-706), `closeProject` (useProjectCommands L43), `UpdateBanner` (L12), `ErrorBoundary` (L14), "Tentar de novo" (StatusBar L28, CanvasNotices L58).
- `persist` (L307) = `writing=true; writes++` → `writeProject(committed)` (L267): `assertNotChangedExternally` (L249: lê o arquivo; **arquivo nulo ou vazio passa**; texto ≠ `disk.text` → `conflict` + `ExternalChangeError`) → backup → imagens da `trash` → `specs/` → re-confere se gravou algo → `saveMapping(revision+1)` → `disk=…` → `onSaved` → `cleanUp` (erro só no Diagnóstico).
- Predicados: `idle()` = `saved && !gesto` (L451); `stalled()` = `error && !writing && !gesto` (L457).
- `sync()` (L514): guarda `watchable/syncing/closed`; → `syncProject` (L482): `conflict` → unchanged; `stalled()` → `checkStalled` (L464: stat → se mudou, lê; se `!stalled() || writes!==started` → busy; texto igual → só atualiza `lastModified`; diferente → `conflict`, 'conflict'); `!idle()` → busy; senão stat/lê/`loadProject`/`adopt` (L403: `store.load`, `saver.reset()`, zera `stored/trash/writtenSpecs`, `disk` novo, `reloads++`) → 'reloaded'. Depois sempre `proposals.scan()` (L523).
- `resolveConflict` (L532): `keep` → adota revisão/texto do disco, `conflict=null`, `saver.flush()`; `reload` → `loadProject` + `adopt` (falha → `reloadFailed:true`).
- Interface: `saveStatus==='error' && !conflict` → aviso no canvas (CanvasNotices L15); barra de status mostra erro mesmo com conflito (StatusBar L24); fechar → `flush` e, se `error`, "Fechar sem salvar?" (useProjectCommands L43-45); `beforeunload` bloqueia se `status!=='saved'` (controller L704).

Transições em fila distinta: `proposals.ts` serializa gravações **e** conferências numa só fila (`enqueue`, L160-166), enquanto a sessão separa a conferência da fila do autosave e a protege com `writing`/`writes`.

## Achados

1. **(alta · pequeno) Arquivo vazio no momento da gravação é tratado como "de ninguém" e permite perda silenciosa.** `assertNotChangedExternally` L253: `text.trim()===''` → grava. Um escritor não atômico (editor de texto, `git checkout`; o MCP usa `writeFileAtomic`, `mcp/createProject.ts` L6) trunca e depois escreve. Caminho real: usuário edita (debounce 250 ms) → editor salva → a app lê vazio, grava `revision+1` → o editor termina e sobrescreve → `disk.text` ≠ arquivo e `status='saved'` → o `sync` seguinte (3 s) recarrega por `adopt` → a edição local **some com o toast "Projeto atualizado por fora"**, sem conflito. A exceção foi criada na 3a.2 (979b336) para "criação interrompida", mas um `mapping.json` vazio nunca abre (`loadProject` falha), então a sessão só encontra vazio quando alguém está escrevendo. Nenhum teste cobre o vazio (só o `null`, externalChanges L171). **Proposta:** vazio = "ilegível, tente depois" (como `syncProject` L499-500 já faz): não gravar, `saver.schedule()` e sair sem erro; só `null` segue gravando.

2. **(média · médio) `writing`/`writes`/`stalled()` existem porque o `AutoSaver` deixa `status='error'` durante uma gravação em curso.** `flush` interno (autosave L56-69) nunca põe `saving`: a segunda gravação enfileirada atrás de uma que falhou roda com `status='error'` (cimentado pelo teste externalChanges L598-626, "com o status em erro e uma gravação em curso"). A 6.2 corrigiu o sintoma na sessão com dois flags e um contador (session L220-221, L457-479) em vez de na origem; a interface mostra "Erro ao salvar / Tentar de novo" com uma gravação rodando, e "Tentar de novo" enfileira uma terceira. **Proposta:** (a) o `flush` interno marca `status='saving'` antes de `save()` e expõe `inFlight`/`pending`; (b) melhor ainda, a conferência de `checkStalled` vira um job na mesma fila do saver (modelo de `proposals.ts` L160-166): gravação e conferência nunca se cruzam por construção, e `writing`, `writes` e o `if (!stalled() || writes !== started)` desaparecem.

3. **(média · pequeno) `resolveConflict`/`adopt` não conhecem `writing`: uma gravação em curso pode sobrescrever o arquivo recém-adotado com o projeto antigo.** `persist` captura `p` (L308) antes dos `await`; `adopt` (L403-423) troca `disk` e `store` sem esperar a fila; a gravação em curso passa em `assertNotChangedExternally` (o disco agora é igual a `disk.text`) e grava o `p` velho com `revision+1`. Caminho: gravação 1 lenta (imagens) falha com `ExternalChangeError`; gravação 2 já enfileirada começa; o usuário clica **Recarregar** enquanto a 2 está lendo o arquivo. Janela curta na prática, mas o buraco é de desenho: `saver.reset()` (autosave L86) descarta `dirty` e não a fila. Também `syncProject` re-testa `idle()` três vezes (L491, L497, L501) por falta de uma fila. **Proposta:** `adopt` e `resolveConflict` executam dentro da fila do saver (ou aguardam `saver.settled()`), e `reset()` passa a cancelar a gravação enfileirada ainda não iniciada.

4. **(média · trivial) Gravação da proposta marca "não exportado" só no IndexedDB.** `local.ts` L211-214 grava `unexported:true` ao decidir/anotar, mas o signal `open.unexported` só muda em `onSaved` (controller L243) e `markExported` (L654): a barra de status (StatusBar L123) não mostra "Alterações não exportadas" depois de decidir uma proposta até reabrir o projeto; a lista da tela inicial mostra. Dois mecanismos para o mesmo flag (signal em memória × meta no IDB). **Proposta:** `onSaved` vira `onChanged` chamado também pelo `ProposalStore` após gravar, ou o signal deriva do meta do IDB.

5. **(média · pequeno) Desfazer após `save-failed` agenda uma gravação redundante.** Já documentado em PLAN-etapa-5 (decisões consolidadas, "Regravação redundante"); continua: `store.undo()` sobe `revision` (history L250) → effect (session L394-400) → `schedule()` → grava o projeto base sem mudança (revisão a mais) e, com `ExternalChangeError`, reabre o conflito. **Proposta:** `apply`/`undo` com `link` abandonado não sobem `revision`, ou a sessão compara `committed` por identidade antes de agendar.

6. **(baixa · pequeno) Arquivos de imagem órfãos após "Recarregar".** `addImages`/`replaceImage`/`putProjectImage` gravam o arquivo antes do `mapping.json` (L583, L621, L383); se a gravação do mapping falha e o usuário escolhe **Recarregar**, `adopt` faz `stored.clear()` (L409) e os arquivos ficam na pasta para sempre (o `cleanUp` só vê `stored`). **Proposta:** em `adopt`, remover os `stored` não referenciados pelo projeto carregado (são escritas da própria sessão), ou não limpar `stored` e deixar o próximo `cleanUp` resolver.

7. **(baixa · trivial) Erros de `loadMapping` em `resolveConflict` viram rejeição solta.** `keep` (L535) e `reload` (`loadProject` L44 não captura `loadMapping`) rejeitam com permissão revogada; `EditorDialogs` L198/L201 faz `void …` → cai no `unhandledrejection` e o diálogo fica sem feedback (`reloadFailed` só cobre `!loaded.ok`). **Proposta:** `try/catch` em `resolveConflict` → `conflict={reloadFailed:true}` e `reportError('session.reload')`.

8. **(baixa · trivial) Exportar com a gravação em erro limpa "não exportadas" e ela volta sozinha.** `collectFiles` (L647) ignora o `FlushResult`; o zip leva o `committed` (bom, é o resgate) e `markExported` zera o flag; quando a gravação pendente enfim passa, `onSaved` (controller L243) marca `unexported=true` de novo, embora o conteúdo já tenha saído. **Proposta:** `collectFiles` devolve `saved:boolean`; a exportação avisa "exportando com alterações não gravadas" e `markExported` passa a registrar a revisão exportada (comparar em `onSaved`).

9. **(baixa · trivial) `syncing` descarta o pedido com `images:true`.** `useExternalChanges` L34-37 dispara `focus` e `visibilitychange`; se um poll de 3 s está em curso, `sync` (L517) devolve 'unchanged' sem conferir as imagens, que ficam para o próximo foco. **Proposta:** com `syncing`, guardar `images` pendente e aplicá-lo no fim do `sync` em curso (ou enfileirar, ver 2b).

10. **(baixa · trivial) Acreções e comentários desatualizados.** `disk.lastModified` nasce `null` (L213) e o primeiro `sync` sempre lê o arquivo inteiro (poderia `statMapping()` ao abrir). `writeProject` L297 re-confere "se gravou algo" mas o backup (L273) não conta em `wrote`. `close()` (L667-674) não espera um `sync` em curso: `adopt` depois de `store.close()` recarrega um projeto numa sessão fechada (`closed` só barra syncs novos). Comentário de `SyncResult` L93 diz que `busy` vale com "gravação agendada ou em curso", mas com `status='error'` e gravação em curso a resposta também é `busy` por outro caminho (L470), e o comentário de `stalled()` L453-456 descreve a exceção em vez da regra.

## Regra automática sugerida

- **Teste de propriedade da fila** (`tests/storage/autosave.test.ts`): `status === 'saved'` ⇒ nenhuma `save()` em curso e `dirty === false`; `save()` em curso ⇒ `status === 'saving'`. Hoje o segundo invariante falha (achado 2) e o teste de externalChanges L598 fixa o contrário.
- **ESLint `no-restricted-syntax` em `src/store/session.ts`**: proibir `storage.loadMapping(` fora de `assertNotChangedExternally`/`checkStalled`/`resolveConflict` e `storage.saveMapping(` fora de `writeProject` (hoje já é assim; a regra impede regressão). E em `src/**` exceto `session.ts`/`controller.ts` (criação) proibir `saveMapping(` — controller L608 é a única exceção legítima.
- **Teste de sessão com `MemoryDirectory`**: "arquivo vazio durante a gravação não é sobrescrito" (achado 1) e "Recarregar com gravação em curso não grava o projeto antigo" (achado 3), usando os ganchos `holdSave`/`holdRead` que já existem em externalChanges L507-566.

## Testabilidade (resumo)

Os testes afirmam bem as **transições felizes e os bugs reproduzidos** (revisão +1, conflito, keep/reload, touch, ilegível, gesto, operações caras, pagehide). Sem teste: arquivo vazio na gravação; `reset()`/`adopt` com gravação em curso; `beforeunload` com `status==='error'`; `collectFiles` com `flush` falhando; `checkStalled` com arquivo apagado (`modified===null`); `sync` rejeitando (`loadMapping` lança); `close()` com `sync` em curso; `resolveConflict` lançando; "não exportadas" após gravar proposta. O teste externalChanges L598-626 **fixa** o estado incoerente do achado 2 (`status==='error'` com gravação em curso) como comportamento esperado.

## Export (`share.ts`, `ExportDialog.tsx`)

Correto: `saveFileWithPicker` é chamado antes de qualquer `await` do handler (ExportDialog L58-60; `setError` é síncrono), `saved` só após `close()`, `abort()` descarta escrita parcial (share L89-94), `AbortError` → `cancelled` sem mexer no flag, `markExported` só em `saved`/`shared` e ignora pasta (controller L653). Os achados 4 e 8 são os únicos pontos.

## O que está bom

- `writeProject` tem a ordem certa e explicada: restaura/grava arquivos → re-confere → `mapping.json` → só então apaga; o disco nunca aponta para arquivo inexistente; a `trash` em memória resolve o `File` ilegível após remoção.
- `revision` mora em `disk`, fora do store: gravar não cria undo nem renderiza; comparação por **texto** pega edição à mão sem mudar `revision`.
- `applyAccepted` só conclui com `FlushResult.ok` e faz rollback completo (proposalActions L372-379); limpeza pós-gravação isolada (`session.cleanup`) sem subir revisão duas vezes.
- `committed` vs `project`: a prévia do gesto nunca chega ao disco nem ao zip (L308, L648), com testes dedicados (fase 5.1).
- `proposals.ts` já tem o desenho que a sessão deveria copiar: uma fila para gravações e conferências (`enqueue`, L160-166).

---

# 2. Revisão de propostas

# Revisão técnica — subsistema "revisão de propostas" (somente leitura, origin/main 48f8e32)

## Mapa

**Chave do retomar (`mapping.reviewResume`, localStorage, via `safeStorage`):**
- `resumeScope(storage)` → `` `${kind}:${id ?? folderName ?? ''}` `` (`src/store/review.ts:173-176`). Local = `local:<id IndexedDB>`; pasta = `folder:<nome da pasta>` (`src/storage/folder.ts:207`, `folderName: root.name`). Entrada = `<scope>|<proposalId>` (`review.ts:179,259`). Legado = chave sem `|` (só o id da proposta), reconhecida em `entriesOf` (`review.ts:182-191`).
- Conteúdo (`resumeSchema`, `review.ts:134-145`): `selected`, `view`, `filters`, `knownConflicts[]` (≤500, `review.ts:127`).
- Gravação `remember()` (`review.ts:252-271`): relê tudo, troca a própria entrada (e apaga a legada do mesmo id), reordena MRU e corta em 12 **globais** (`MAX_RESUME`, `review.ts:125,269`). Efeito colateral: adiciona o id a `seen` (`review.ts:270`).
- Leitura: `seen` nasce das entradas da própria cópia na criação do estado (`review.ts:208-211`); `storedOf(id)` relê no `open` (`review.ts:226-237`), legado → `known: null`.
- `open` (`review.ts:339-383`): conflitos = `derived.conflictIds` vs `known` → `newConflicts`; alvo = guardado se existe (`exists`, `review.ts:240-245`) senão `firstPending`; filtros saneados (imagem pela árvore, **camada pelo `store.committed`**, `review.ts:360-372`); visão só se não legado (`review.ts:377`); `remember(conflitos atuais)` logo na abertura (`review.ts:381`); `resumed = stored !== null` (inclui legado, `review.ts:382`).
- `close` (`review.ts:287-305`): `remember(conflictIds à vista)` e zera UI. `dispose` → `close` (grava no unmount).

**Grafo derivado (`src/store/derived.ts`, `createReviewDerived`, 383-647):** `project = store.committed` (387) → `proposal` (389) → `changesOf`/`appliedOf` (396-397) → `tree` (429), `order`, `changeTypes`, `levelTypes` (451-481, regra de negócio no store), `situation`/`conflictIds` (483-509, cache `conflictsOf` 357-375), `levels`, `progress`, `counts`, `validation`→`invalid`→`canApply` (544-570), `preview` (572) → **`shownProject`** (578-583: prévia se `proposalId≠null && view==='proposed'`, senão `committed`), `visibleIds`, `pendingIds`, `notes`, `supersession`. `rows`/`freshIds` (407-427) dependem de `sources.seen`.
- Consumidores de `shownProject`: só `TreeWindow.tsx:21`, `Editor.tsx:74` (estado vazio), `CanvasNotices.tsx:25`. O canvas tem **outra** definição do "à vista": `drawnProject` em `CanvasController.ts:101-111` (`proposedDisplay(preview.project, proposal)` sobre `store.project`, não `committed`).

## Achados

1. **Breadcrumbs, barra de status, cursor e atalhos leem `store.committed`/`store.project` na revisão.** Sev. média · custo pequeno. Evidência: `src/ui/Breadcrumbs.tsx:53`, `src/ui/StatusBar.tsx:53` (`SelectionItem`), `src/canvas/CanvasController.ts:347` (`requestCursor` usa `committed.images` → sem coordenadas sobre imagem só proposta), `src/app/useEditorShortcuts.ts:169,180,227`, `src/ui/Minimap.tsx:37`, `src/ui/ReviewCanvasControls.tsx:44,166`, `src/ui/LayersWindow.tsx:11`, `src/ui/ListView.tsx:97`, `src/ui/IncompleteView.tsx:21`. Caminho real: importação nova (projeto vazio) → Revisar → clicar numa imagem proposta → caminho e status dizem "Nada selecionado"; Camadas vazia enquanto a Árvore lista as camadas propostas. Desenho: `shownProject` vira a **única** fonte do "projeto à vista" e o canvas deriva `drawnProject` dela (`proposedDisplay(shownProject)`), em vez de reimplementar a escolha; `resolveSelection`/`crumbsOf`/minimapa/cursor recebem `shownProject`. Lista/Incompletas/Camadas na revisão: ou leem `shownProject`, ou mostram aviso "visão Atual" — decidir, não deixar misto.

2. **`folder:<nome>` identifica a cópia pelo nome da pasta.** Sev. média · custo pequeno. Evidência: `review.ts:173-176`; os recentes de pasta já têm um `id` estável (`src/storage/local.ts:328,412`, `controller.ts:124-127`). Caminho: duas pastas `loja` (ex.: `projetos/loja` e `backup/loja`) com a mesma proposta → a segunda herda posição, filtros e `knownConflicts` da primeira e nunca marca conflito novo (achado da rodada 4). Desenho: `ProjectStorage` ganha `copyId: string` preenchido por quem abre (id local; id da entrada dos recentes; para pasta sem recentes, id gerado por sessão e guardado em `sessionStorage`); `resumeScope` passa a ser `storage.copyId`, sem `'id' in storage` nem fallback para nome.

3. **"Vista"/"Nova" é efeito colateral do retomar.** Sev. média · custo pequeno. Evidência: `seen` deriva das chaves do resume (`review.ts:211,270`); corte em 12 globais (`review.ts:269`); `fresh` em `derived.ts:415-419`. Caminhos reais: (a) 13ª proposta aberta em qualquer projeto evicta a 1ª → ela volta a "Nova" na barra de status sem ter mudado; (b) `localStorage` bloqueado (perfil restrito/`file://` com dados bloqueados) → todas as não decididas voltam a "Nova" a cada recarga; (c) outra aba abre a proposta e esta aba continua contando-a como nova até reler (`seen` é lido uma vez em `createReviewState`). Desenho: separar `seen` (conjunto `{copyId}|{proposalId}` sem limite prático, só ids) do resume (posição/filtros/visão/conflitos, com LRU); ambos num só blob versionado (ver achado 5).

4. **Três noções de "nova" sem contrato comum.** Sev. baixa · custo pequeno. (a) `freshIds.length` na barra (`StatusBar.tsx:184-194`); (b) um só selo "Nova" por janela (`ProposalList.tsx:322`, HANDOFF-PROPOSALS §139), mas as outras `fresh` ficam com `flag: null` e `primary: true` (`ProposalRow.tsx:35-40`) → dois botões primários e a contagem "2" com um selo; (c) `session.proposals.notices` (`proposals.ts:141-145`) só limpa em `clearNotices`, chamado apenas pelo X do aviso (`ProposalNotices.tsx:56`), e esconde o aviso só enquanto **essa** proposta está aberta (`ProposalNotices.tsx:54`). Caminho: proposta chega → aviso → pessoa abre pela janela Propostas, revisa, sai → o aviso "Nova proposta · Revisar" volta ao canto do canvas embora `fresh=false`. Desenho: `rows[].fresh` é a verdade; o selo vai em toda linha `fresh` (ou a contagem passa a ser "1 nova + N sem revisar"), e `open()` da revisão remove da fila o `notice.added` daquela proposta (ação do store, não da interface).

5. **Modelo do resume: pilha de casos (legado, `known: null`, `resumed` meio-verdadeiro, `previous ?? all[id]`).** Sev. baixa · custo pequeno. Evidência: `review.ts:181-191,226-237,260,353-354,377,382`; `resumed: true` com legado produz o toast "voltou ao ponto onde você parou" e a visão resetada (O8). Chaves legadas de proposta com id só de dígitos (`PROPOSAL_ID_RE` permite) saem da ordem MRU (índices inteiros ordenam primeiro em `Object.entries`). Desenho consolidado: `{ v: 2, seen: string[], resume: Record<"copyId|proposalId", {selected, view, filters, knownConflicts}> }` validado por zod; versão ≠ 2 → descartar (as entradas legadas existem só nos dispositivos do dono; `resumed` passa a ser `'full' | 'none'`). Remove `entriesOf`, `known: null` e o ramo `all[id]`.

6. **Conflitos que surgem durante a revisão nunca são "novos".** Sev. baixa · custo trivial. Evidência: `newConflicts` fixado em `open` (`review.ts:379`), `close` grava `conflictIds` como conhecidos (`review.ts:291-295`), teste em `tests/store/review.test.ts:484` fixa isso como esperado. Caminho: recarga externa durante a revisão (`session.sync` → `reloaded`) adiciona conflitos que a pessoa não notou; na reabertura, zero "Conflito novo". Desenho: `newConflicts` vira `computed(conflictIds − knownAtOpen)` e `close` grava `knownAtOpen ∪ (conflitos que a pessoa selecionou/decidiu)`; ou, mais simples, `close` grava só `knownAtOpen` e deixa os surgidos aparecerem como novos na próxima abertura.

7. **Aplicar: `mapping.json` grava, `proposal.json` falha → estado dividido sem saída clara.** Sev. média · custo médio. Evidência: `proposalActions.ts:337-383` (`before`: cópias → `store.apply` → `flush`), depois `proposals.ts:220-224` (`writeProposal` falha → `write-failed`, e `after` que apaga as origens não roda). O projeto fica com as mudanças, a proposta sem `applied`; reaplicar dá `entity-exists` → `blocked` (`proposalApply.ts:186`), as criações viram "conflito", "N aceitas aguardando aplicação" fica para sempre e as imagens ficam duplicadas em `proposals/<id>/images` e `images/`. `abandoned` não é setado (só na falha do `flush`, `proposalActions.ts:376`), então o `store.undo()` ainda reverte, mas nada avisa. A fase 5.2 só tratou a falha do `mapping.json` (`tests/store/proposals.test.ts:287-364`). Desenho: no `write-failed` depois do `flush`, compensar como no `save-failed` (undo da entrada, `rollback`, `abandoned=true`) **ou** adotar "proposta primeiro em memória, confirmar depois" com um `pendingApplied` que a próxima abertura reconcilia (mudança aplicada = entidade já igual a `to` ⇒ marcar `applied` sem conflito). A primeira é a coerente com a fase 5.2.

8. **"sugerida numa rejeição" aparece sem rejeição.** Sev. baixa · custo trivial. Evidência: `ReviewDetails.tsx:255` (`rejectedLevel = levelState === 'rejected' || levelState === 'partial'`) → `suggest` em `:408`; `partial` inclui "parte aceita, parte sem decisão". Caminho: nível Projeto/Proposta com uma aceita e o resto pendente → título "Notas · sugerida numa rejeição". Fix: `summary.rejected > 0`.

9. **Filtro de camada saneado pelo projeto atual.** Sev. baixa · custo trivial. `review.ts:367-371` usa `project.layers` (committed) enquanto o filtro de imagem usa a árvore; camada criada pela proposta (importação nova) não sobrevive ao retomar. Usar `shownProject`/prévia.

10. **Regra de negócio no store e na interface, fora de `src/model/`.** Sev. baixa · custo pequeno. `levelTypes` (`derived.ts:451-481`, "tipo dominante do nível"), `fresh` (`derived.ts:415-419`), `proposalStatus` (`ProposalRow.tsx:28-70`: status → selo/ação/primária), `needsExitReminder` (`ExitReviewDialog`), `conflictsOf` (`derived.ts:363-375`, duplica `changeStatuses`). Nenhum vazamento de UI no modelo (`proposalReview.ts`/`proposalCompare.ts` são puros; `addNote` usa `crypto.randomUUID`, permitido). Desenho: mover `levelType(tree, node, types)` e `proposalListStatus(p, progress, fresh)` para `src/model/proposalView.ts` com testes de modelo.

11. **Miudezas:** `decide` usa `proposalId.peek() ?? ''` em vez de `withOpen` (`review.ts:410-413`); `close` com proposta apagada por fora ainda grava entrada de resume para ela (`review.ts:291-295`); `undoable.proposalId ?? ''` (`review.ts:313`).

## Regra automática sugerida

1. **Teste de contrato do "projeto à vista"** (`tests/components/review/shownProject.test.tsx`): monta o editor com projeto vazio + proposta que cria imagem/marcação/camada, visão Proposto, seleciona a marcação proposta e exige: Breadcrumbs com 2 níveis, barra de status com o nome, Camadas com a camada, minimapa com 1 imagem, cursor com coordenadas. Mais um teste de catraca (como `tokenLiterals.test.ts`): a lista de arquivos em `src/ui/**` e `src/app/**` que contêm `store.committed`/`store.project` deve ser igual a uma allowlist explícita (hoje ~20); qualquer novo leitor precisa justificar.
2. **Esquema versionado do `mapping.reviewResume`** com `v` obrigatório; teste que grava o blob, relê e exige toda chave casando `^(local|folder):[^|]+\|[A-Za-z0-9._-]+$` (ou `copyId|proposalId`), e um teste de eviction (13 propostas) garantindo que `seen` não muda.
3. ESLint `no-restricted-globals: localStorage/sessionStorage` em `src/**` exceto `src/utils/safeStorage.ts` (o review já passa por lá; a regra impede regressão).

## Tests: cobertura

- **Só por reprodução de bug:** chave por cópia (`review.test.ts:360`), idioma (`:389`), outra aba (`:409`), legado (`:426,454`), conflito durante revisão (`:484`), `supersededBy` de aplicada (`:679`, `proposalList.test.tsx:95`), Árvore pela prévia (`reviewTree.test.tsx`).
- **Sem teste:** scope `local:<id>` (harness só usa pasta `folder:projeto`, `proposalHarness.ts:81`); duas pastas com o mesmo nome; eviction `MAX_RESUME` e efeito em `seen`; `layerId` saneado; `step('conflict', …)`; aviso `added` depois de abrir pela lista; contagem da barra × um selo; `writeProposal` falhando após o `flush`; undo/redo do `HistoryLink` quando a proposta mudou por fora; `decide` sem revisão aberta; `dispose` gravando o resume; toast "voltou ao ponto" com legado (O8) no componente; `resumed` com `view` resetada.

## O que está bom

- Conflitos nunca persistidos como tal: recalculados contra o projeto atual e memoizados por `(changes, applied, project)` (`derived.ts:357-375`); decidir não refaz níveis nem conflitos (teste `review.test.ts:966`).
- Toda gravação da proposta relê o disco e refaz a mutação pura sobre a versão nova (`proposals.ts:182-236`); decisões/notas/aplicar são funções puras do modelo, então o "refazer sobre o disco" é seguro.
- Aplicar aceitas é uma entrada de undo com `HistoryLink`, `mapping.json` antes da proposta, `abandoned` + rollback das cópias quando o `flush` falha (`proposalActions.ts:267-321,372-381`), e `discardRedoOf` ao decidir depois de desfazer.
- `remember()` relê e troca só a própria entrada (multi-aba sem perda), zod + try/catch em toda leitura.
- Trava respeitada na revisão como aviso, não bloqueio (`proposalReview.ts:444-465`), coerente com `docs/PROPOSAL-FORMAT.md`.

---

# 3. Foco, diálogos e teclado

# Revisão: foco, diálogos e teclado (somente leitura, `origin/main` 48f8e32)

## Mapa — quem move o foco programaticamente

**A. Dentro do modelo do `Dialog`** (quem abriu → `returnFocus` → contêiner do abridor → `[data-focus-root]`; nunca o `body`):
- `src/ui/Dialog.tsx:25-31` `focusFirst` (abertura: `[autofocus]` → corpo → rodapé); `:47-59` `captureFocusOrigin` (na renderização); `:61-67` `tryFocus` (confere `activeElement === el`); `:79-102` `restoreFocus`; `:109-116` `restoreFocusAfterRender` (**`queueMicrotask`**); `:170-189` abre/fecha no `useEffect`.
- `src/ui/RefPicker.tsx:137,150,159` mesmos auxiliares; `:283` refoca a busca ao trocar aba (interno, ok).
- `src/ui/TypedFields.tsx:545` `returnFocus={() => button.current}` — o **único** chamador que usa `ref` (é o modelo a seguir).
- `src/ui/TableField.tsx:55-66` `focusAfterConfirm` — consistente, mas acha o alvo por **classes de outros componentes** (`.grid-cell-menu .icon-button`, `.table-field-head button`).
- `src/app/ExportDialog.tsx:21-24` `exportButton` — consistente, mas por **seletor global** `.main-bar button[aria-keyshortcuts="Ctrl+E"]`.

**B. Fora do modelo (segunda autoridade ou idioma próprio):**
- `src/app/Home.tsx:77-83` `refocusRow` + `useEffect([busy])` → `focusRecentRow` `:486-494` (`.project-actions button`, `h2`); `:508` `NameField` foca na montagem (duplica `focusFirst`).
- `src/ui/AnnotationsPanel.tsx:111-131` foco do "ir para anotação" (`useEffect`; `input, select, textarea` → `.props-value button`).
- `src/ui/ActionMenu.tsx:33` 1º item ao abrir (`useEffect`); `:39` fechar → `.icon-button` (síncrono); `:58` setas.
- `src/ui/Popover.tsx:97`, `src/ui/MenuPopover.tsx:44`: só o **Esc** devolve ao `querySelector('button')`; escolher item/clique fora não devolvem.
- `src/ui/CanvasContextMenu.tsx:32` 1º botão ao abrir (`useLayoutEffect`); fechar não devolve.
- `src/ui/KeyValueGrid.tsx:24-31` `focusGrip` (**rAF**); `:106` Enter → `blur()`; `:163-169` Enter na Chave → `[data-kv-value]`; `:260` par novo (`useEffect`).
- `src/ui/TableField.tsx:89-96` e `src/ui/CodeRefField.tsx:86-91` linha nova (**rAF**, seletores de `SimpleEditor`/`[data-focus$=":path"] input`).
- `src/ui/toolWindowLayout.ts:26-37` `showAndFocusToolWindow` (**`queueMicrotask`**).
- `src/ui/MarkingTree.tsx:21-31` `scrollToSelected(…, true)` via `afterPaint` (**rAF**), usado em `TreeWindow.tsx:27`.
- `src/ui/CommitInput.tsx:45` Enter → `blur()` (foco → `body`, O5).
- `src/ui/controls/Tabs.tsx:52` roving tabindex (ok, interno).
- Ruído de nome: `canvas.focusSelection()` (`Editor.tsx:91,97`, `useEditorShortcuts.ts:131,248`, `review/*`) **centraliza o viewport**, não é foco de DOM.

Quatro idiomas de "depois da renderização": `queueMicrotask` (Dialog, toolWindowLayout), `requestAnimationFrame` (focusGrip, addRow ×2, afterPaint, `useReviewCommands.ts:38`, `useEditorShortcuts.ts:232`), `useEffect` (ActionMenu, KeyValueGrid, AnnotationsPanel, Home), `useLayoutEffect` (CanvasContextMenu). Não há um modelo único: há o do `Dialog` e cinco especiais.

## Achados

**1. (alta · pequeno) Causa do flake "sem linhas, vai à tabela": o `Dialog` só abre e só registra o retorno no `useEffect`, e o `user-event` não roda dentro de `act`.**
Evidência: `@testing-library/preact@3.2.4` configura `eventWrapper/asyncWrapper` no **seu** `@testing-library/dom@8.20.1` aninhado (`node_modules/@testing-library/preact/node_modules/@testing-library/dom`), enquanto `user-event@14.6.7` usa o `@testing-library/dom@10.4.2` da raiz (`package-lock.json:1893,1930`). Resultado: eventos do `user-event` renderizam por microtask e os `useEffect` rodam em `requestAnimationFrame` (~16 ms no jsdom) ou 35 ms (`preact/hooks/src/index.js:31,469-480`). Sequência em `tests/components/TypedFields.test.tsx:342-350`: `vi.waitFor` devolve assim que o `<dialog>` existe; `getByRole` dentro do diálogo pequeno é rápido; `user.click(Excluir)` pode chegar **antes** do efeito do `Dialog` (`Dialog.tsx:170`). O componente desmonta com o efeito pendente, `flushAfterPaintEffects` o descarta (`index.js:445` `if (!component._parentDom) continue`), nenhum cleanup é registrado → nenhum `restoreFocus`; o botão Excluir (focado pelo pointerdown) sai do DOM → `body`. `editorShell.test.tsx:410-414` já espera "o foco entrou no diálogo" e por isso não flaka; `TypedFields` e `Home` não esperam. Não é corrida entre store e `setConfirm(null)`: ambos caem na mesma `process()` do Preact e o microtask roda depois dela.
Correção determinística: (a) produção: `showModal()` + `focusFirst` + registro do cleanup em **`useLayoutEffect`** (um `<dialog>` no DOM está sempre aberto e sempre tem retorno; hoje há um quadro em que ele está no DOM fechado); (b) teste: helper `openDialog()` em `modalFocus.ts` que espera `dialog.open && dialog.contains(document.activeElement)`; (c) decidir se as versões de `@testing-library/dom` devem ser alinhadas (`overrides`) para o `act` valer — muda o timing de todos os testes de componente, então é decisão explícita, não efeito colateral.

**2. (média · médio) Duas autoridades de foco após remoção.** Em `Home`, ao Excluir/Remover pelo diálogo, rodam o `restoreFocus` do `Dialog` (microtask; cai no contêiner mais próximo = 1ª linha da `tbody`) **e** o `refocusRow` de Home (`useEffect`, rAF) — o certo vence só porque microtask < rAF no navegador; sob `act` a ordem inverte. Mesmo desenho em "ir para anotação" (`AnnotationsPanel.tsx:111-131`) vs. retorno do `RefPicker` (o Ctrl+Enter registrado como fora da etapa em `PLAN-etapa-7.md:168` é este conflito). Nenhum teste distingue as duas (em `Home.test.tsx:338-372` as linhas esperadas coincidem para ambas). Proposta: **um dono por fechamento** — quem fecha e sabe que o abridor vai sumir passa `returnFocus` (função) e o `Dialog` não adivinha contêiner; Home troca `refocusRow` por `returnFocus={() => rowAt(index)}`; o `goToAnnotation` passa a ser o `returnFocus` do `RefPicker` (`() => cardOf(target)`), e o painel só rola.

**3. (média · pequeno) Bug real: Configurações → "Ver atalhos" → Esc deixa o foco no primeiro controle da app, não no botão Configurações.** `useEditorDialogs.show` e `Home.tsx:323` **substituem** o diálogo no mesmo slot; o Preact desmonta o antigo antes de renderizar o novo (`preact/src/diff/children.js:326-331`), então `captureFocusOrigin()` do Help (`Dialog.tsx:165`) vê `body` (o botão "Atalhos" já saiu) → `opener: null, containers: []` → ao fechar, `restoreFocus` cai em `[data-focus-root]` → 1º botão da barra. Caminho: Ctrl+, → Ver atalhos → Esc. Proposta: a **origem mora no host** (`useEditorDialogs`/`Home`): `show()` captura uma vez ao abrir o 1º diálogo, uma troca herda a origem, `close()` descarta; `Dialog` ganha `origin?: FocusOrigin` e só captura quando não recebe.

**4. (média · médio) Acoplamentos por seletor atravessando componentes** (cada um é um contrato invisível): `ExportDialog.tsx:21-24` (texto do atalho como seletor: trocar `SHORTCUT_LABELS.export` ou adotar a sintaxe ARIA quebra o retorno em silêncio); `TableField.tsx:63-64,90-94`; `CodeRefField.tsx:87-89`; `ActionMenu.tsx:33,39` (`.icon-button` é classe do `IconButton`); `Popover.tsx:97`/`MenuPopover.tsx:44` (`'button'` genérico, confia que o gatilho é o 1º); `Home.tsx:151,488-492`; `AnnotationsPanel.tsx:113-130` (`.props-value button`); `useEditorShortcuts.ts:265` + `useImageIntake.tsx:84` (`dialog[open]` duplicado); `Dialog.tsx:28-29` (`.dialog-body`/`.dialog-actions`, próprios). API para removê-los: (i) `Button`/`IconButton` aceitam `buttonRef` (como `TextField.inputRef`; `ref` não atravessa function component sem `forwardRef`); (ii) `ActionMenu` aceita `triggerRef`; (iii) `EditorDialog` de `export` carrega `returnFocus` vindo do `EditorMainBar` (`useRef` do botão) em vez de `document.querySelector`; (iv) um signal `modalOpen` (incrementado pelo `Dialog`/`RefPicker`) substitui `document.querySelector('dialog[open]')`; (v) hook `useFocusTarget()` → `{ ref, focus }` para linhas/cards.

**5. (média · pequeno) Não há política de teclado documentada, e o código tem quatro Enters e quatro Escs.** Enter: `CommitInput.tsx:45` grava e tira o foco (`body`, O5); Chave → Valor (`KeyValueGrid.tsx:163-169`) mas Valor → `blur` (`:106`); `RefPicker` escolhe; `ReviewLevels.tsx:513` navega; `<form>` dos diálogos de Home envia. Esc: `CommitInput` reverte + `stopPropagation`; menus fecham e devolvem foco só no Esc; `Dialog` via `cancel`; editor cancela gesto/desseleciona (`useEditorShortcuts.ts:164`); Shift+Esc esconde janela; `Tooltip.tsx:84`. `aria-keyshortcuts` em dois formatos: "Ctrl+E"/"Alt+Enter" (`SHORTCUT_LABELS`, fora da sintaxe ARIA) e "Control+B"/"Control+Enter" (`TypedFields.tsx:153`, `ReviewBar.tsx:190`). Política proposta (uma seção em `ARCHITECTURE.md`): **Enter confirma e mantém o foco no campo** (`CommitInput`: chamar `commit(e.currentTarget.value)` no Enter, sem `blur`), exceto Chave → Valor; Alt+Enter = nova linha; **Esc em campo = reverter; sem o que reverter, sobe** (fecha menu/diálogo/desseleciona); menu/popover devolvem o foco ao gatilho em **todo** fechamento (Esc, escolha, clique fora); `aria-keyshortcuts` sempre ARIA via `ariaKeys(label)`, o rótulo humano só na dica.

**6. (baixa · trivial) Menus que largam o foco no `body`.** `MenuPopover.tsx:59` fecha ao escolher sem devolver (salvo quando o item abre um diálogo, cujo fallback acha o gatilho por acaso); `Popover.tsx:164-166` idem no clique fora; `CanvasContextMenu` não devolve ao fechar (só mouse; baixo). `MenuPopover` não tem setas (`ActionMenu` tem).

**7. (baixa · trivial) `RefPicker.tsx:236-243`: botão fechar cru `<button class="picker-close icon-button">`** em vez de `IconButton` (regra do CLAUDE.md) — e é a classe que `ActionMenu` usa como seletor.

**8. (baixa · pequeno) `modalFocus.ts` aplicado de forma desigual.** Ligado em `dialogs.test.tsx` (só o describe da 7.1; o teste 6.4 `:211-230` roda sem), `TypedFields` (ref e tabela), `editorShell` (Export). Fora: `Home.test.tsx:338-372` (Excluir, Pasta indisponível), `LayersPanel`, `AnnotationEditor`, `SpecsDialog`, review. O simulador não cobre o foco que o `showModal` nativo dá ao `<dialog>` nem o Tab preso. Proposta: ligar em `tests/setup.ts` para todo teste de componente (um comportamento só) e manter `restoreModalFocus` no `afterEach` global.

**9. (baixa · trivial) Duplicações/ruído:** `Home.tsx:508` `NameField` foca na montagem embora `focusFirst` já foque o 1º controle do corpo (e `[autofocus]` de `Dialog.tsx:27` não é usado por ninguém); `canvas.focusSelection` → renomear `centerSelection`.

**10. (baixa) Acessibilidade dos diálogos:** `aria-labelledby` ok em `Dialog.tsx:195` e `RefPicker.tsx:222`; trap nativo do `<dialog>`; `closable={false}` correto (`:200-210` reabre; tipo discriminado exige `onCancel`). Faltas menores: sem `aria-describedby` no corpo; confirmações destrutivas sem `role="alertdialog"`; `RefPicker.tsx:334` esconde as dicas de teclado com `aria-hidden`; o fallback de contêiner pode focar o `section.tool-window[tabindex=-1]` (`ToolWindow.tsx:53`) em vez de um controle — aceitável, mas documentar.

## Regra automática sugerida
ESLint `no-restricted-syntax` em `src/ui/**` e `src/app/**` (duas seletoras):
1. `CallExpression[callee.object.name="document"][callee.property.name=/^(querySelector|querySelectorAll|getElementById)$/]` → "consulta global ao DOM: use ref, `returnFocus` ou um signal; exceções só em `src/ui/Dialog.tsx` e `src/ui/toolWindowLayout.ts`" (via `files`/`ignores` por arquivo).
2. `CallExpression[callee.property.name=/^querySelector(All)?$/] > :matches(Literal, TemplateLiteral)[value=/\./], …[quasis.0.value.raw=/\./]` → "seletor por classe atravessa componentes: use `[data-…]`/`[role=…]` dentro do próprio `ref`". Classes só do próprio componente passam a `data-*` (`.dialog-body` → `[data-dialog-body]`, `.grid-grip` → `[data-grip]`).
Complemento: teste em `tests/tooling/` (como `tokenLiterals.test.ts`) que varre `src/` por `aria-keyshortcuts=` e exige a sintaxe ARIA; e `overrides` no `package.json` para uma só versão de `@testing-library/dom` (decisão explícita, ver achado 1).

## O que está bom
- Um só lugar decide o retorno (`restoreFocus`), com ordem explícita, documentada em `ARCHITECTURE.md:142` e reaproveitada pelo `RefPicker`; `returnFocus` é lido na hora de fechar (`returnTo.current`), o que permite alvo calculado.
- `tryFocus` confere `document.activeElement === el` em vez de confiar no `focus()`; o `body` é excluído em todos os ramos.
- `closable={false}` robusto contra o Chrome fechar o `<dialog>` à força, com tipagem que impede `onCancel` solto.
- `simulateModalFocus` é um insight correto (a inércia do modal não existe no jsdom) e `editorShell.test.tsx:410-414` mostra a espera certa.
- Atalhos puros e testados (`shortcutFor`, `reviewShortcutFor`, `isTextInput`/`worksInTextInput`), Ajuda gerada de `TOOL_WINDOWS`; `Tabs` com roving tabindex e `RefPicker` com combobox + `aria-activedescendant` corretos.

---

# 4. Armazenamento, recentes e abertura

# Revisão: armazenamento, recentes e abertura de projeto

## Mapa

**Dados dos recentes (dois bancos, duas formas, unificadas só no controller)**

- Projetos locais: `mapeador-imagens` (IndexedDB), store `projects` → `LocalProjectMeta { id, name, updatedAt, unexported, openedAt? }` (`src/storage/local.ts:33-42`). `create` grava `openedAt = agora` e `updatedAt` = o de dentro do mapping (7.3, `local.ts:134-141`); `saveMapping` atualiza `name`/`updatedAt` via `readInfo` e marca `unexported` (`local.ts:154-166`); `markOpened` só toca `openedAt` (`local.ts:258-263`). `list()` ordena por `updatedAt` (`local.ts:121-124`) — ordenação morta, o controller reordena.
- Pastas: `mapping-folders` v2, stores `folders` (`StoredFolder { id, name, folderName, usedAt }`) e `handles` (id → handle) (`local.ts:313-335`). Identidade: `isSameEntry` só contra entradas com o mesmo `handle.name` (`local.ts:388-399`); `replaceId` ("Localizar") funde entradas (`local.ts:401-417`). `touch` atualiza nome e data (`local.ts:421-426`).
- Unificação: `recentProjects` computed (`src/app/controller.ts:137-156`): local `usedAt = latest(updatedAt, openedAt)` (`:130-131`); pastas só se `features.folder`; ordena por `Date.parse(usedAt) || 0`.
- Estado de módulo no controller: `library`, `folderLibrary`, `openFolderId`, `knownHandles` (`controller.ts:158-166`).
- **Não existe id estável de projeto**: `project` tem só `name/createdAt/updatedAt` (`docs/FORMAT.md:95`, `src/model/types.ts`). Confirma a nota da 6.6 ("o formato não tem id de projeto", `PLAN-etapa-6.md:236`).

**Fluxos de abertura**

| Fluxo | Caminho |
|---|---|
| Local | `openLocalProject` → `openFromStorage(library.open(id), id)` → `markOpened` só se `ok` (`controller.ts:378-391`) |
| Zip | `importZip` → `readProjectZip` → `deserialize` antes de criar; inconsistente só cria após aceitar reparo (`:403-431`) |
| Pasta (seletor) | `openFolder` → `pickDirectory` → `loadMapping()===null` ⇒ `needs-setup`, senão `openFolderHandle` (`:443-487`) |
| Recente de pasta | `openRecentFolder`: `entry` e `known` lidos **sincronamente** antes do `guarded` (`:541-542`); `handleOf` (IndexedDB) só sem handle em memória; `ensurePermission` (query→request, `folder.ts:81-85`); pré-checa `loadMapping`; `NotFound` ⇒ `missing`; outras exceções ⇒ `storage-failed` (`:540-561`) |
| Localizar | `relocateFolder` → picker → exige `mapping.json` (`no-project`) → `openFolderHandle(handle, id)` (`:570-581`) |
| Guardar | `rememberFolder` depois de `start()` (projeto já aberto): `isReopenable` + `isOriginPrivate` (OPFS fora), try/catch, `refreshRecentFolders` (`:500-515`) |
| Fechar | `closeProject` lê `openFolderId` e nome, zera, `session.close()`, `touchFolder` (`:663-686`) |

Erros: `AppErrorCode` = 5 códigos de `DeserializeError` + `invalid-zip|missing-mapping|not-found|storage-failed` (`controller.ts:64-69`); todos têm `error.<code>` em `pt-BR.ts:313-317, 363-366`. `Home.run` mostra `t('error.'+code)` ou o diálogo de inconsistente (`Home.tsx:101-115`).

## Achados

1. **`openFolderId` pode vazar para o projeto seguinte (corrida fechar × guardar).** Severidade baixa · custo trivial. `rememberFolder` zera `openFolderId` e só o define depois de `await isOriginPrivate` + `await folderLibrary.remember` (`controller.ts:501-509`); mas `start()` já publicou `openProject` antes (`openFromStorage` → `start`, `:285`), e o `Editor` monta na hora (`App.tsx:8-14`). Caminho real: Abrir pasta → clicar **Fechar projeto** enquanto o IndexedDB grava o handle → `closeProject` lê `openFolderId = null` (`:667-668`) → `rememberFolder` termina e deixa `openFolderId = <id>` com nenhum projeto aberto → próxima abertura de um projeto **local**, ao fechar, chama `touchFolder(idDaPasta, nomeDoLocal)` (`:679`): a linha da pasta ganha o nome do projeto local e data nova. Proposta: capturar `const current = openProject.value` no início de `rememberFolder` e só atribuir `openFolderId` (e `knownHandles`) se `openProject.value === current` ainda; ou guardar o id dentro do `OpenProject` em vez de módulo.

2. **Nome da pasta nos recentes só acompanha o rename se a pessoa clicar em Fechar projeto; o local acompanha a cada gravação.** Baixa · trivial. Local: `saveMapping` grava `readInfo(text)` (`local.ts:160`). Pasta: só `touchFolder` no `closeProject` (`controller.ts:679`); fechar a aba (o caso comum, há `pagehide` para isso em `:695-713`) deixa nome e `usedAt` da abertura. Incoerência entre os dois tipos na mesma lista. Proposta: em `start`, no `onSaved` (`:239`), chamar `touchFolder(openFolderId, nome)` com debounce natural do autosave; `touch` já é idempotente.

3. **`resumeScope` de pasta por nome colide; a chave certa já existe (id da entrada dos recentes), falta transportá-la.** Média · pequeno. `review.ts:173-176` usa `storage.folderName`; duas pastas `projeto/` (ex.: o zip descompactado duas vezes) dividem posição, filtros e `knownConflicts` — exatamente o achado 11 que a 6.5 quis evitar. Não há `project.id` no schema para servir de chave (ver Mapa); criar um seria schema v9 e não resolve "mesma proposta em duas cópias" (as cópias teriam o mesmo id). O id da entrada de `mapping-folders` é por pasta física (`isSameEntry`) e sobrevive a "Localizar". Proposta: `ProjectStorage` ganha `copyId?: string` opcional (local: o id; pasta: o id da entrada, definido pelo controller após `remember`, ou `undefined` sem recentes → cai no `folderName`), e `resumeScope` usa `copyId ?? folderName`. Custo: a entrada legada `folder:<nome>|…` vira legado (já tratado como tal pelo `entriesOf`, `review.ts:182-191`).

4. **Reparar e abrir um projeto local não conta como uso; na pasta conta.** Baixa · trivial. `openLocalProject` só chama `markOpened` quando `opened.ok` (`controller.ts:382-388`); o `repair()` passa por `guarded(open)` → `openRepaired` (`:297-345`) sem `markOpened`. `openFolderHandle` envolve o `repair` para chamar `rememberFolder` (`:473-486`); o local não tem o simétrico. Proposta: envolver o `repair` em `openLocalProject` do mesmo jeito.

5. **Falha de `queryPermission`/`requestPermission` (não `NotFound`) não oferece Localizar/Remover.** Baixa · trivial. Em `openRecentFolder`, só `isNotFound(e)` vira `unavailable('missing')`; outra `DOMException` (handle de volume desmontado, `SecurityError` por ativação expirada) sobe para `guarded` → `storage-failed` → só a mensagem "Não foi possível acessar os arquivos" (`controller.ts:548-558`, `Home.tsx:140-149`), sem saída além de tentar de novo. Proposta: dentro do `try`, qualquer exceção do `ensurePermission` ⇒ `unavailable('denied')` (mantendo `reportError`), e as do `loadMapping` como hoje.

6. **`requestPersistentStorage` só nos fluxos locais; o banco dos handles é evictável.** Baixa · trivial. Chamado em `createLocalProject`, `openLocalProject`, `importZip` (`controller.ts:372, 380, 414`), nunca ao guardar pasta (`rememberFolder`). Quem só usa pastas pode perder a lista sob pressão de espaço ("best effort" do navegador). Proposta: `void requestPersistentStorage()` em `rememberFolder` após gravar.

7. **Entradas duplicadas e indistinguíveis quando projeto e pasta têm o mesmo nome em duas pastas.** Baixa · pequeno. `remember` cria duas entradas (correto, `isSameEntry` false); a tabela só mostra `folderName` quando difere do `name` (`Home.tsx:602-604`), então duas linhas "projeto · Pasta · data" iguais. Caminho real: pasta renomeada no disco e reaberta pelo **seletor** (não pelos recentes) deixa a entrada velha morta ao lado da nova com o mesmo nome. Proposta: mostrar `folderName` sempre que houver outra pasta com o mesmo `name` na lista (derivado no `recentProjects`), ou sempre.

8. **`ensurePermission` aceita `prompt` só se o `requestPermission` for alcançado dentro da ativação — a documentação exige, o código cumpre, mas sem guarda.** Baixa · trivial (documental). `handleOf` faz `reportError` + leitura IndexedDB antes do `queryPermission` numa visita nova (`controller.ts:517-527, 547`). Está dentro dos ~5 s; o teste `controller.test.ts:817-827` cobre só o caso `known`. Sem ação de código; registrar no teste "numa visita nova" (`:908-918`) que a leitura precede a consulta, para a regra não se perder.

9. **`controller.ts` é um god-module de 713 linhas com 8 responsabilidades.** Média · pequeno-médio. (a) detecção/`initApp` (`:184-197`); (b) signals e lista unificada (`:106-156`); (c) `start`/`openFromStorage`/reparo (`:217-358`); (d) local + zip (`:361-431`); (e) pasta (`:443-487, 594-626`); (f) recentes de pasta: `rememberFolder`, `handleOf`, `openRecentFolder`, `relocateFolder`, `forgetFolder`, `touchFolder`, `knownHandles`, `openFolderId` (`:489-592, 680-686`); (g) exportar/fechar (`:635-678`); (h) ciclo de vida da página (`:688-713`). Split de baixo risco: `src/app/recents.ts` (f + `recentFolders`/`refreshRecentFolders`, recebendo `folderLibrary` em `initRecents()`, expondo `rememberFolder/handleOf/touchOpenFolder/forgetFolder`), `src/app/pageLifecycle.ts` (h), e o controller re-exporta `openRecentFolder/relocateFolder/forgetFolder/recentFolders` para `Home.tsx` e `tests/app/controller.test.ts` não mudarem. O computed `recentProjects` fica no controller (depende de `features` e `localProjects`). Fazer junto do achado 1 (o estado `openFolderId` vai para `recents.ts`).

10. **`LocalLibrary.list()` ordena por `updatedAt` e o teste afirma isso, mas a ordem visível é por `usedAt`.** Baixa · trivial. `local.ts:121-124` e `tests/storage/local.test.ts:38`; `recentProjects` reordena (`controller.ts:155`). Nada quebra; é código que mente. Proposta: `list()` sem sort (ou por `latest(updatedAt, openedAt)`), com o teste alinhado.

**Verificações sem achado**: todo acesso a IndexedDB/`localStorage` está em try/catch ou atrás de `guarded`/`reportError` (`local.ts:276-292, 448-464, 471-476`; `safeStorage.ts`; único uso direto de `localStorage` é `safeStorage.ts:7,15`); canal preview isolado para ambos os bancos e chaves (`channel.ts:17-24`, `local.ts:18, 320`); `file://` detectado (`controller.ts:193`) com aviso (`Home.tsx:206-208`) e timeout de abertura do banco (`local.ts:21, 298-312`); `showDirectoryPicker`/`showSaveFilePicker` com guarda de iframe (`folder.ts:99-105`, `share.ts:50-56`); `AbortError` do seletor ⇒ cancelado (`folder.ts:108-117`); OPFS excluído (`folder.ts:59-74`) e testado (`controller.test.ts:920-939`). Nenhum erro engolido sem `reportError`: os únicos `catch {}` vazios são `isOriginPrivate`, `isFolderModeSupported`, `requestPersistentStorage`, `readInfo` e `writable.abort`, todos com degradação documentada.

## Regra automática sugerida

1. ESLint, para `src/**` fora de `src/utils/safeStorage.ts` e `src/storage/local.ts`: `no-restricted-globals` em `localStorage`, `sessionStorage`, `indexedDB` ("use `readSetting`/`writeSetting` ou `storage/local.ts`"). Hoje a regra só existe para `src/model/**` (`eslint.config.js:14, 86-89`); a conformidade atual é por disciplina.
2. Teste em `tests/i18n/dictionaries.test.ts`: para cada membro de `AppErrorCode` (lista literal no teste), `error.<code>` existe nos dois dicionários. Hoje está completo, mas um código novo em `controller.ts:64-69` quebraria só em runtime (`Home.tsx:112`).
3. `max-lines: ['warn', 600]` em `src/app/**` para sinalizar o próximo god-module.

## Lacuna conhecida (não é achado)

Reler do IndexedDB um handle do **seletor de verdade** e o `isSameEntry` entre handle guardado e novo não têm cobertura automática (Chromium derruba a página com handles do OPFS, `PLAN-etapa-6.md:233`; e2e usa entrada semeada sem handle, `folder.spec.ts:324-336`). Fica no R0.4/R0.7 manual (`TESTING.md:158, 161`); a rodada 3 passou. Cobertura com handles falsos está completa: granted/prompt/denied/NotFound, visita nova, OPFS, sem `isSameEntry`, sem modo pasta (`controller.test.ts:799-955`; `folder.test.ts:175-198`; `local.test.ts:312-418`; `Home.test.tsx:352-430`).

## O que está bom

- A lista nunca lê handles e o handle só é lido no clique (`local.ts:325-328, 377-380`; `controller.ts:517-527`): a tela inicial não depende do navegador reconstruir nada, e a consulta de permissão começa sincronamente no gesto (teste `controller.test.ts:817-827`).
- Dois bancos separados com justificativa de versão/aba antiga (`local.ts:304-310`) e v1 descartada sem ler (`local.ts:456-459`): migração pensada para não travar o modo local.
- `relocateFolder` + `remember(replaceId)` funde entradas e nunca toca o disco; `forgetFolder` idem, com testes que conferem o `mapping.json` antes/depois (`controller.test.ts:853-906`).
- Importar zip só cria o projeto local depois de o reparo ser aceito (`controller.ts:420-428`, teste `:680-695`): recusar não deixa rastro.
- Todo caminho de falha passa por `guarded` + `reportError` para o Diagnóstico, e os `catch` vazios são só de detecção de recurso.

---

# 5. Servidor MCP

# Revisão técnica do servidor MCP (`mcp/`, main `48f8e32`, SERVER_VERSION 0.3.2)

## Mapa

**Entrada e transporte**: `mcp/main.ts:186-224` (parseArgs → `resolve(root)` → `createServer` → `StdioServerTransport` com `maxBufferSize = MAX_MESSAGE_BYTES`; stdout só protocolo, `console.log`→stderr). `mcp/server.ts:256-273` registra tools e os 3 recursos `mapping-docs://`. `mcp/tools.ts:156-709` declara as 22 tools (zod), `respond`/`respondWithImage`/`failure` (`tools.ts:44-97`: `ModelError`→`modelToolError`, `ToolError`→`isError` JSON, resto → `internal-error` + stack no stderr).

**Raízes e caminhos**: `mcp/paths.ts` — `isWithin` (léxico, `path.relative`), `hasParentSegment` (trata `\`), `Roots.locate/assertInside` (sobre `realpath`), `resolveExisting` (`:91`), `resolveNew` (`:124`, sobe até o ancestral existente e confere o `realpath`), `resolveRoot` (`:180`), `resolveProjectFile` (`:196`, recusa `\`, absoluto, `..`, e exige `realpath` dentro das raízes), `writeFileAtomic` (`:215`, tmp `wx` + `rename`). `mcp/projects.ts` — descoberta (`walk`, não segue symlink, `MAX_DEPTH 16`, pula `.`/`node_modules`), `findProject`, `loadProject` (teto 64 MB, specs via `resolveProjectFile`). `mcp/codeFiles.ts` — só `realpath`+`stat`, confinado ao `workDir`.

**Caminhos de escrita (todos os que existem)**:
1. `create_project` → `mcp/createProject.ts:93-97`: `mkdir(dir/images)`, `assertInside(realpath(dir))`, `.gitignore` e **`mapping.json` novo** via `writeFileAtomic`. Só em pasta que ainda não tem `mapping.json` (`:70`); não há caminho que reescreva um `mapping.json` existente.
2. `propose_changes` → `mcp/proposalStore.ts:163-190` (`writeNewProposal`): `mkdir proposals/` + `assertInside`, `mkdir proposals/<id>` sem `recursive` (falha se existe), imagens via `writeNewFile` (`:145`, tmp `wx` + `link`, nunca sobrescreve) e por último o `proposal.json`; `rm -r` da pasta em caso de erro.
3. `propose_changes` com `supersedes` e `withdraw_proposal` → `proposalStore.ts:199-230` (`updateStored`): lê, transforma, relê e compara o texto, grava `revision + 1` atômico; 3 tentativas, depois `revision-conflict`.
4. Conferência antes de gravar a proposta: `mcp/proposals.ts:148-156` compara `sha256(mapping.json)` com `baseHash` lido em `prepareBatch` (`mcp/changes.ts:122-144`).

Nenhum outro módulo grava (`grep writeFile|rename|link|mkdir|rm`: só `paths.ts`, `createProject.ts`, `proposalStore.ts`), o que o teste estático `tests/mcp/proposals.test.ts:1145` já impõe. A alegação "o `mapping.json` só muda pela app" **confere** para todas as tools de proposta (nem `prepareBatch` nem `planChanges` gravam; a migração de schema antigo é só em memória, `write.test.ts:690`).

**Imagens**: `mcp/imagePrepare.ts` usa as decisões puras do modelo (`planOutputSize`, `chooseOutputFormat`, `shouldUseEncoded`, `withExtension`); `mcp/image/formats.ts` detecta formato e lê dimensões pelo cabeçalho antes de decodificar (40 MP, 64 MB, 16 MB em base64). Lote: `mcp/batch.ts:418-470` (`file` ou `base64`, nunca os dois; nome via `uniqueImageFile` do modelo contra `images/` em disco + imagens reservadas por propostas abertas).

**Modelo compartilhado**: `grep "from '../src"` em `mcp/` só acha `../src/model` (19 imports); o ESLint (`eslint.config.*:117-150`) recusa os outros diretórios, libs de navegador e rede.

## Achados

1. **O8 — `root` relativo recusado com `unknown-root`** · média · trivial · `mcp/paths.ts:180-188`, `mcp/tools.ts:205-208`. `resolveRoot` compara o `hint` com `this.roots` (já absolutos por `main.ts:205`), o `realpath` e o `basename`. Um agente que copia `design/mapeamentos` do `.mcp.json` recebe `unknown-root` (basename é `mapeamentos`). Caminho real: `create_project({path:'loja', root:'design/mapeamentos'})` com duas raízes → erro e um round-trip extra lendo `roots` do detalhe. **Desenho**: resolver o hint como `main.ts` faz (`resolve(this.workDir, hint)`, sem barra final, e também `realpath` dele) antes de comparar; manter o `basename`; descrever o campo como "um dos `roots` de `list_projects`, o caminho como passado em `--root`, ou o nome da pasta". Teste em `read.test.ts` "várias raízes" com o hint relativo e com `./`.

2. **O4 — `create_project` cria `images/` vazia** · baixa · trivial · `mcp/createProject.ts:9,93`; a app só cria a pasta ao gravar a primeira imagem (`src/storage/folder.ts:167-176`, `resolveDir(..., true)` sob demanda; `src/app/controller.ts:594-616` não cria). Git nem versiona pasta vazia, então o resultado diverge do da app sem ganho. **Desenho**: `mkdir(dir, { recursive: true })` e remover `IMAGES_DIR` do módulo; ajustar a descrição em `tools.ts:197`, a tabela em `docs/MCP.md` e o título do teste `read.test.ts:786` (que já não afirma a existência de `images/`; acrescentar `expect(existsSync(join(dir,'images'))).toBe(false)`).

3. **Garantias centrais sem teste por stdio** · média · pequeno · `mcp/proposals.ts:148-156` (`revision-conflict` quando o `mapping.json` muda durante o cálculo), `mcp/changes.ts:127-131` (`read-only` para schema mais novo), `mcp/proposals.ts:253-263` (aviso `supersede-failed`). `grep` em `tests/mcp` só acha `revision-conflict` no teste unitário do `proposalStore`. São as três promessas da seção "Concorrência com a app" do `docs/MCP.md`. **Desenho**: em `proposals.test.ts`, um `BatchIo.readSource` lento (imagem por `file`) com um `writeFileSync` no `mapping.json` no meio; um `mapping.json` com `schemaVersion: 99`; e uma `supersedes` cujo `proposal.json` é reescrito a cada leitura (como `proposalStore.test.ts:132`).

4. **`link()` para gravar imagem da proposta falha em sistemas de arquivos sem hard link** · baixa · trivial · `mcp/proposalStore.ts:151-152`. exFAT (pendrive/HD externo comum em designers), alguns compartilhamentos de rede e sincronizadores devolvem `EPERM`/`ENOSYS` em `link` → `propose_changes` vira `internal-error` sem pista. **Desenho**: se `link` falhar com `EPERM`/`ENOTSUP`/`ENOSYS`/`EXDEV`, cair para `writeFile(path, data, { flag: 'wx' })` (mesma garantia de não sobrescrever, só sem a atomicidade do rename); e mapear `EEXIST` para um `ToolError` (`image-exists`).

5. **Imagens aceitas de uma proposta substituída deixam de ser reservadas** · baixa · trivial · `mcp/proposals.ts:101-107` pula `previous` ao montar `reserved`. Mas `PROPOSAL-FORMAT.md:176` diz que numa `superseded` "as aceitas ainda podem ser aplicadas": se a anterior tinha `images/tela.webp` aceita e não aplicada e a nova propõe outra `tela.webp`, as duas reivindicam o mesmo nome e a segunda a aplicar sobrescreve ou falha na app. **Desenho**: para `previous`, manter reservados os arquivos das mudanças de imagem **aceitas** (não aplicadas); liberar só as pendentes. `reservedImages` já tem o filtro por decisão; falta um parâmetro.

6. **Janela de sobrescrita entre app e MCP no `proposal.json`** · baixa · (aceitar e documentar) · `mcp/proposalStore.ts:219-222` relê e compara o texto imediatamente antes do `rename`; `src/store/proposals.ts:200-220` faz o mesmo do lado da app. Nenhum dos dois trava o arquivo: uma decisão gravada pela app nos microssegundos entre o `again` e o `rename` do MCP é perdida em silêncio (a app depois "adota a versão do disco", sem reaplicar a decisão perdida). Impacto só em `superseded`/`withdrawn` (mudança de `status`), com a app gravando no mesmo instante. **Desenho**: registrar como limite conhecido em `docs/ARCHITECTURE.md`; se um dia doer, gravar status via arquivo-marcador em vez de reescrever o JSON.

7. **Ordem gravar nova → marcar anterior** · baixa · trivial · `mcp/proposals.ts:157-165`. Se o processo morre entre as duas, ficam duas propostas `open` com `supersedes` apontando; o caso sem queda já vira o aviso `supersede-failed`. **Desenho**: `list_proposals` já calcula `supersededBy` (`:274-281`); a app poderia derivar "substituída" do `supersedes` da nova também para `open` (como já faz para `applied`), tornando o `status` redundante. Alternativa menor: documentar.

8. **Testes estáticos de guarda não descem a `mcp/image/`** · baixa · trivial · `tests/mcp/proposals.test.ts:1146-1147` e `tests/mcp/noCodeRead.test.ts:139-140` usam `readdirSync('mcp')` sem recursão; um `writeFile` ou `node:fs` novo em `mcp/image/*.ts` passaria. **Desenho**: `readdirSync(dir, { recursive: true })` filtrando `.ts`.

9. **Códigos de erro: sem registro único e tabela da documentação incompleta** · baixa · pequeno · `mcp/errors.ts` aceita `code: string` livre; há colisão de nomes entre camadas (`invalid-name` em `createProject.ts:67` e em `modelErrors.ts:298`; `not-found` em `tools.ts:316` e no modelo; `invalid-path` em `paths.ts:28` e `modelErrors.ts:340`), e a tabela de `docs/MCP.md` não lista `already-exists`, `nested-project`, `root-required`, `unknown-root`, `path-not-found`, `read-only`, `invalid-image-source`, `invalid-base64`, `not-a-file`, `file-too-large`, `image-file-missing`, `wrong-kind`, `project-mismatch`, `invalid-title`, `invalid-spec`, `invalid-ref`, `supersede-failed`, `superseded-incomplete`. **Desenho**: `type ToolErrorCode = ...` em `errors.ts` (união literal) e um teste que extrai `new ToolError('x'` de `mcp/**` e exige cada código em `docs/AGENT-GUIDE.md` ou `docs/MCP.md`.

10. **Duplicação com modelo/storage** · baixa · pequeno. (a) `reservedImages` (`proposalStore.ts:128-142`) reimplementa `changeImageFile` (`src/model/proposalView.ts:210`, não exportado no índice) + filtro de decisão; exportar e reutilizar. (b) `ensureGitignore` e o predicado "linha cobre `backups/`" (`createProject.ts:35-45`) copiam `src/storage/folder.ts:258-276`; mover o predicado e a montagem do texto para `src/model/backups.ts` (que já tem `BACKUPS_DIR`) e deixar só o I/O nos dois lados. (c) `MAPPING_FILE` (`projects.ts:14`) e `IMAGES_DIR` (`changes.ts:29`, `createProject.ts:9`) duplicam `src/storage/types.ts`; `src/model/images.ts:120` já fixa `images/` — levar as constantes ao modelo. (d) `createdRefs` (`changes.ts:70-81`) usa `.some`/`.find` em laço, contra a regra do `CLAUDE.md` (`projectIndex`); `ProposalRefs.ref` (`proposalRefs.ts:70`) idem, escala pequena.

11. **`list_proposals`/`propose` relêem e parseiam todas as propostas a cada chamada** · baixa hoje · médio · `proposalStore.ts:86-125` (`listStored`), chamado por `propose` (reservas), `list`, `get`, `review`, `withdraw` (códigos curtos) e `find_by_source`. Sem paginação em `list_proposals` e sem cache por `mtime`; cada arquivo pode ter até 64 MB (`:34`). Um projeto com dezenas de rodadas de agente cresce linearmente. **Desenho**: cache `Map<id, {stamp, parsed}>` por `mtimeMs+size` dentro de uma chamada e entre chamadas; `list_proposals` com `limit/offset` e, por padrão, só `open`. Adiar até o uso real indicar.

12. **`root` ignorado em silêncio com `path` absoluto** · baixa · trivial · `mcp/paths.ts:163-166` devolve o candidato absoluto sem olhar `rootHint`. **Desenho**: `invalid-arguments` quando os dois vêm e o absoluto não está sob a raiz indicada.

13. **Versão do MCP fixada à mão em 3 lugares** · baixa · trivial · `docs/MCP.md:160-163`, `docs/TESTING.md:70-71` repetem `0.3.2`; o workflow (`.github/workflows/mcp-release.yml:407-414`) confere só a tag × `SERVER_VERSION`. Em toda release alguém esquece um. **Desenho**: teste que lê `SERVER_VERSION` e exige `mcp-v${SERVER_VERSION}` em `docs/MCP.md` e `docs/TESTING.md`; ou os docs dizerem "a versão em `mcp/version.ts`". O workflow em si está correto (checkout da tag, lint/typecheck/test, smoke `--version` fora do repo, `--clobber`, cria ou anexa à Release).

14. **Windows sem cobertura** · baixa · (observação) · o código trata `\` (`paths.ts:17`, `:201`, `createProject.ts:100`, `projects.ts:51`) e `path.win32.relative` é insensível a caixa, mas o CI roda só `ubuntu-latest` e não há teste de `isWithin`/`hasParentSegment` com entradas Windows. Um `it.each` unitário com `path.win32` cobre o essencial sem runner Windows.

## Regra automática sugerida

1. **Guarda de escrita recursiva e nominal**: evoluir `proposals.test.ts:1145` para varrer `mcp/**/*.ts` e afirmar (a) só `paths.ts`, `createProject.ts`, `proposalStore.ts` chamam `writeFile|rename|link|mkdir|rm`; (b) `MAPPING_FILE`/`'mapping.json'` só aparece em `projects.ts`, `changes.ts` (leitura) e `createProject.ts`; (c) `writeFileAtomic(` com um caminho que contenha `MAPPING_FILE` só em `createProject.ts`.
2. **Registro de códigos**: `ToolErrorCode` como união literal em `errors.ts` + teste "todo código de `new ToolError(` está em `docs/AGENT-GUIDE.md` ou `docs/MCP.md`" (achado 9).
3. **Versão × docs** (achado 13).

## Release 0.3.3 — o que entra e custo

| Item | Custo |
| --- | --- |
| O8: `root` aceita relativo/`./`/realpath + descrição do campo + teste (achado 1) | trivial |
| O4: não criar `images/` + descrição + docs + teste (achado 2) | trivial |
| `link` com fallback `wx` e `EEXIST` → ToolError (achado 4) | trivial |
| Reservar as imagens aceitas da proposta substituída (achado 5) | trivial |
| `root` + `path` absoluto → `invalid-arguments` (achado 12) | trivial |
| Testes por stdio: `revision-conflict` do `propose`, `read-only`, `supersede-failed` (achado 3) | pequeno |
| Testes estáticos recursivos + registro de códigos + versão×docs (achados 8, 9, 13) | pequeno |
| Dedup `changeImageFile`, gitignore no modelo, constantes (achado 10) | pequeno |
| Documentar a janela do `proposal.json` e a ordem gravar→marcar (achados 6, 7) | trivial (docs) |
| Cache/paginação de propostas (achado 11) | médio — adiar |

Os dois primeiros mudam a saída do MCP; tudo o mais é compatível com o formato v8/proposta v1. Lembrar `docs/MCP.md`, `docs/TESTING.md` e `SERVER_VERSION`.

## O que está bom

- Modelo de segurança de caminho coerente e testado: `..` recusado na forma, absolutos conferidos léxica e por `realpath`, symlinks nunca seguidos na descoberta (`projects.ts:76`) nem em `proposals/` (`proposalStore.ts:95`), `mapping.json` hostil não lê fora (`read.test.ts:740-783`); conferência de código confinada ao `workDir` e garantida por teste estático e dinâmico (`noCodeRead.test.ts`).
- O "só a app grava o `mapping.json`" é verdadeiro no código e já tem guarda dupla: hash do arquivo depois de cada tool (`proposals.test.ts:1104`) e teste estático dos escritores (`:1145`).
- Reaproveitamento do modelo é real: lote (`batch.ts`) só chama funções puras do `src/model/`; `propose` usa `buildProposal`/`compareProposals`/`reviewTree`; a otimização de imagem segue exatamente as decisões da app (`imagePrepare.ts` + `imageOptimization.ts`), e a divergência proposital (formato pelo conteúdo, não pela extensão) está comentada.
- Limites de memória pensados de ponta a ponta: cabeçalho antes de decodificar, 40 MP, 16 MB base64 com o teto do transporte alinhado (`formats.ts:94-109`, `main.ts:208`), tetos de 64 MB para `mapping.json`/`proposal.json`/fontes, stdout limpo com testes (`stdout.test.ts`).
- Cobertura por stdio de todas as 22 tools no bundle real (`globalSetup` gera o `dist-mcp`, `images.test.ts:461` roda copiado para fora do repo), e o release confere tag × versão e testa o artefato fora do repositório.

---

# 6. Guia de testes e prompt do testador

# Revisão editorial de `docs/TESTING.md` e do prompt do testador (somente leitura)

Base: `origin/main`; strings conferidas em `src/i18n/pt-BR.ts`, `src/i18n/review.ts`, `src/app/shortcuts.ts`.

## Achados

**1. O guia fala com dois leitores ao mesmo tempo e o humano paga por isso.** Severidade alta (para quem testa à mão) · custo médio (reorganização, sem mudar conteúdo).
Evidência: `docs/TESTING.md:3` "Serve para uma pessoa e para um agente com controle do computador"; o bloco "Convenções" (`:107-121`) tem 15 bullets, dos quais 5 são total ou parcialmente para agente: `:111` ("O que o guia supõe de um agente testador…", 900+ caracteres), `:114` ("Agente: confira o atributo `title` do elemento (ou o `aria-label`)"), `:117` ("Agente: espere o campo aparecer antes de digitar… dispare o mesmo `keydown` por script"), `:61` ("Agente: antes de cada seletor, peça à pessoa…"), `:28` ("Um agente pode ler e regravar o arquivo por um script"), `:89`, `:137` ("um agente pode gerá-la com o Chrome sem janela"). Nos passos: `R1.8` ("pessoa: use o seletor de data… agente: preencha o valor do campo"), `R1.20` ("Agente sem `Ctrl+=`: veja as convenções"), `R6.2` ("Antes, o agente fecha o `principal` na aba dele"), `R5.1` ("Sem a pessoa, o agente testador faz o mesmo pelo seu cliente MCP"), `R3.6`.
Proposta: mover todo "Agente: …" para um apêndice "A. Para o agente testador" (shell, `title`/`aria-label`, `keydown` sintético, injeção em `<input type=file>`, `Set-Clipboard`, cliente MCP próprio) e deixar na seção 7 só o que um humano faz. Marcar **[pessoa]** só interessa ao agente: no guia humano vira uma nota de rodapé ("passos marcados [pessoa] no apêndice A são os que o agente não faz sozinho").

**2. A convenção [pessoa] é um parágrafo único com cinco regras.** Alta · custo baixo.
Evidência: `docs/TESTING.md:110`, um bullet de ~1.100 caracteres que junta: definição de [pessoa], os dois passos inteiros da pessoa (R0.6, R6.2), "seletor de pasta só na primeira abertura", "Permitir em todas as visitas" e "Abrir pasta e Localizar pasta… mostram dois diálogos seguidos".
Proposta: quatro bullets curtos; a regra "Permitir em todas as visitas" vira item próprio da seção 2 (Requisitos) porque vale para humano e agente e aparece antes de R0.2.

**3. O "mapa da interface" está escondido num bullet de convenções.** Média · custo baixo.
Evidência: `docs/TESTING.md:113` descreve a barra principal, a janela Camadas, a barra do canvas e o comportamento de zoom num único bullet de ~1.300 caracteres ("o ícone de lápis é **Desenhar**, a seta circular para trás é **Desfazer**, a engrenagem é **Configurações**…").
Proposta: nova seção "Mapa da interface" (antes dos roteiros) com uma tabela ícone → nome da dica → atalho, mais a lista das janelas (`:112`) e a lista "Adicionar imagem de três jeitos" (`:115`). Resolve também a colisão de nomes do item 9.

**4. Passos cujo "Esperado" só se observa no DOM ou no JSON da resposta do MCP.** Média · custo baixo.
Evidência:
- `R1.4`: "cada quadrado tem o código da cor, ex.: `#E65100`, no `aria-label`" e Disco "`color` igual ao código escolhido": um humano não vê o código sem inspecionar. Propor "qualquer cor diferente; Disco: `color` mudou em relação à leitura anterior".
- `R4.5`: "o nome acessível dele é 'Rejeitar Marcação Campo Cupom criada'" (é `review.decide.reject` = 'Rejeitar {name}', `review.ts:23`, aria-label de botão de ícone). Dizer "o ícone de rejeitar na linha da mudança (dica 'Rejeitar Marcação Campo Cupom criada')".
- `R1.4`, `R1.14`, `R4.4`, `R5.6`: Esperado é tooltip ("com a dica (tooltip, atributo `title`)"). Para humano: "passe o mouse e confira a dica"; a menção a `title` vai para o apêndice.
- `R5.4` e `R5.7`: Esperado "Agente: … a resposta traz `superseded` com `status: "applied"` e uma `note`… `superseded-incomplete` com `inNewProposal`", "a resposta é `no-changes`". Quem usa o Claude Code vê a prosa do Claude, não o JSON. Dar a leitura equivalente ("o Claude diz que a proposta anterior já estava aplicada e continua assim / que nada mudou") ou pedir para o dono dizer ao Claude "mostre a resposta bruta da tool".

**5. Passos com duas leituras válidas ou com ação dentro do Esperado.** Média · custo baixo.
- `R1.20`: "clique no ícone de olho (**Mostrar todas**) e volte a 'Mostrar todas' as marcações": dois controles diferentes com o mesmo rótulo (`layer.showAll` = ícone de olho, `pt-BR.ts:163`; `layer.display.all` = opção da lista "Marcações sem anotação", `:181`). Escrever: "ícone de olho **Mostrar todas** (visibilidade das camadas) e, na lista **Marcações sem anotação**, a opção **Mostrar todas**".
- `R1.13`: a Ação não manda clicar, mas o Esperado diz "Clicar num deles seleciona o Input na marcação dele". Pôr o clique na Ação.
- `R4.6`: a Ação carrega Esperado ("na visão Proposto ela mostra o nome proposto… a linha do item tem só o ícone ⚠ (dica 'Contém conflito')… a Árvore não mostra nenhum dos dois"). Separar.
- `R4.2`, Esperado: "(Num navegador com revisões de rodadas anteriores, o primeiro **Revisar** pode dizer 'A revisão voltou ao ponto onde você parou.'…)": depende de estado de rodada anterior; mover para uma nota "Se o navegador já foi usado em outra rodada" na seção 2 (o prompt já tem isso em `etapa-6-testes-cowork.md:27`).
- `R6.1`: "Em menos de um segundo, comece a arrastá-la": o porquê (gesto durante o autosave de ~250 ms) não é dito e um humano não sabe se acertou a janela. Dizer o objetivo e aceitar "repita até 3 vezes".
- `R0.7`, Esperado: "em geral 'A pasta "fumaca-web" não foi encontrada…'": há três mensagens possíveis (`home.folderDenied`, `home.folderMissing`, `home.folderNoProject`, `pt-BR.ts:474-479`); para pasta renomeada a esperada é a `folderMissing`; dizer qual é a certa e que a `folderDenied` ("O navegador não deu acesso…") indica outra coisa (permissão).
- `R1.23`, Esperado "`atributos[1].nome: email`": índice 1 com uma linha só é confuso; escrever a chave achatada como ela aparece.

**6. Resíduos de rodadas anteriores dentro dos passos (ruído para o recém-chegado).** Média · custo baixo.
Evidência: `R0.4` "Se a aba cair, abra `chrome://version`… cair, com a página de erro 'Ah, não!'…" (achado de rodada 1 que não se repetiu); `R4.10` "O Diagnóstico não registra nenhum erro `drawImage` em todo o R4" (achado 10); `R5.3` "O título da mudança rejeitada mantém a caixa do tipo da especialização" e "(Numa importação nova tudo é criação…)"; `R6.10` "O diálogo não tem botão de fechar (X), e **Esc** e o clique fora dele não fazem nada" (achado 9); `R1.3` "cada linha mostra o nome e o selo inteiros, sem cobrir a linha de baixo" (achado 3); `R1.8` "as colunas ficam lado a lado (o 'sim / não' de `obrigatório` não cobre o `exemplo`)" (achado 5). Rastro em `:120` ("Os passos de celular dos roteiros antigos saíram").
Proposta: manter as verificações, mas como coluna/linha "Regressão conhecida" ou em itálico no fim do Esperado, para o testador saber que são checagens de regressão e não o objetivo do passo. Apagar `:120`.

**7. Passos gigantes que são dois ou três cenários.** Média · custo baixo.
Evidência: `R5.4` (~1.600 caracteres: "Substituição de uma proposta concluída" + "Substituição antecipada" + aviso sobre **Aceitar tudo** + breakpoint "na barra da revisão com a janela a partir de 1200 px; abaixo disso, no menu **Em lote**"); `R6.8` (~1.000: preparação, ramos macOS/Linux × Windows e a saída "marque R6.8 a R6.11 como não executado"); `R0.4` (reabrir + permissão + aba cai + janela estreita + Delete); `R7.2` (8 sub-passos numerados numa célula); `R6.10` (edição + one-liner Python + ramo Windows + espera + Esc).
Proposta: dividir em R5.4a/R5.4b, R6.8-prep/R6.8, R0.4a/R0.4b; o Python e o `attrib` vão para o apêndice "Operações de disco por sistema".

**8. Ordem de execução não está onde o leitor começa.** Média · custo baixo.
Evidência: "Ordem e dependências" (`:122-133`) vem depois das convenções e antes de R0, mas a ordem padrão é "R0, R1, R2, seção 5, R3, R4, R6, R7, R5, R8", diferente da ordem em que os roteiros estão escritos (R5 antes de R6 no texto). Um humano lendo de cima para baixo executa R5 na hora errada.
Proposta: um quadro "Comece aqui" no topo da seção 7 com a ordem e o tempo estimado por roteiro; ou reordenar as seções (R5 depois de R7) para o texto seguir a execução.

**9. Nomes do guia que não existem na interface (invenções úteis, mas não sinalizadas).** Baixa · custo baixo.
- "lista **Nível**" (`R4.2`, `R4.6`, `R4.9`, `R5.4`): 'Nível' é o cabeçalho de uma coluna da janela Propostas (`review.column.name`, `review.ts:127`), não o nome de uma lista. Foi exatamente a confusão da rodada 2 (`relato-2026-10-12-dirigida.md`, "O que atrapalhou": "os selos … estão na lista Nível da janela Propostas; a Árvore … sem selos"). Escrever "na janela Propostas, lista da revisão (coluna **Nível**)".
- "**Abrir** na linha" / "**Excluir** › **Excluir**" / "**Criar**": são `common.open/delete/create` (`pt-BR.ts:20-22`), corretos.
- "selo **Pasta**" / "**Neste dispositivo**": `status.targetFolder/Local` (`:239-240`), corretos; na tela inicial a coluna chama-se **Origem** (`home.colOrigin`, `:470`), que o guia não cita: dizer "coluna **Origem**".
- Demais nomes conferidos e corretos: Abrir pasta, Abrir zip, Novo projeto, Começar, Projetos recentes, Localizar pasta…, Remover da lista, Pasta indisponível, Criar projeto nesta pasta?, Ações do projeto, Fechar projeto, Adicionar imagens, Nova camada, Tornar ativa, Mais ações da camada, Texto no canvas, Enquadrar tudo, Aplicar especialização…, Atualizar versão…, Nada a fazer, Converter em camadas livres, Apagar dados, Rótulo da instância (opcional), Escolher alvo de "dado", Referências vão quebrar, Só incompletas, Incompleta: 1 pendência, Repositórios de código, Abrir no repositório, Copiar caminho, Projeto atualizado por fora., Projeto alterado fora da app, Recarregar / Manter as minhas, Fechar sem salvar?, Fechar mesmo assim, Erro ao salvar / Tentar de novo, Projeto com dados inconsistentes / Problemas / O que o reparo faz / Reparar e abrir, "id de par repetido", "retângulo fora da imagem", "recortada aos limites da imagem", as duas mensagens de backups/, Imagem ausente, "O zip saiu sem…", Alterações não exportadas, Instalar, Nova versão disponível. / Atualizar, PREVIEW — dados separados da versão principal, Tema/Claro/Escuro, Idioma, Sobre/Versão/Canal/Versão do formato; revisão: Revisar, Continuar, Ver, Nova, Parcial, Aplicada, Substituída, Somente leitura, Atual / Proposto, Em lote, Aceitar tudo, Aceitar N visíveis, Aceitar o grupo Projeto, Aceitar/Rejeitar imagem, Aceitar/Rejeitar item, Aplicar aceitas · N, Sair da revisão(?), Aplicar agora · N, Sair mesmo assim, Continuar revisando, Conflito, Conflito novo, junto, "Decidida junto, pelas dependências", Item trancado (texto igual), "Contém conflito", Limpar filtros, Sem decisão, Nova nota para o agente, Adicionar nota, "substituída por", "ficaram para trás", "igual/diferente na nova", "Esta proposta foi substituída por outra.", "Não foi possível gravar o mapping.json…", Alt+L e Alt+N (`shortcuts.ts:45,94`); en-US **Continue** (`review.ts:365`). Prompt `:26` cita "Não foi possível salvar o arquivo." sem o "Tente de novo." (inofensivo).

**10. Seção 5 (MCP) diverge de `docs/MCP.md` em dois pontos que pegam no repositório real do dono.** Baixa para o teste · média para o "Uso real" · custo baixo.
Evidência: `docs/MCP.md:9` manda conferir o `sha256` e `:26` avisa "Repositório com `"type": "module"` no `package.json`: … `{"type":"commonjs"}` em `tools/`"; `docs/TESTING.md:66-91` não tem nenhum dos dois (o repositório de teste nasce vazio, então não dói; o repositório do dono pode doer). Também falta no guia o botão **Verificar a pasta agora** (`proposals.scan`, `review.ts:60`), que a rodada 2 usou no R5.6 quando a varredura parou; `R3.5`/`R6.3`/`R5.x` dizem só "espere ~3 s".
Proposta: na seção 5, passo 1 com o `sha256sum -c`, e um aviso "se o seu repositório for ESM…" apontando para `MCP.md`; nas convenções, "se a proposta não aparecer em ~3 s, use **Verificar a pasta agora** na janela Propostas".

**11. Prompt (`etapa-6-testes-cowork.md`): falta a regra "pergunte e diga que está esperando" nos [pessoa].** Alta (foi o que fez o dono achar que o agente travou) · custo baixo.
Evidência: `:32` "chame-o só quando chegar a vez de cada um, sem novas explicações" (induz a mensagens curtas ou nenhuma); nenhuma ocorrência de "aguard"/"esperando". `:43` "Capturas que falham… espere um pouco e tente de novo" sem avisar o dono.
Proposta: bullet novo em "Passos [pessoa]": "Ao chegar num [pessoa], mande uma mensagem com uma pergunta explícita e termine com 'Estou esperando você fazer isto; me avise quando terminar.' Não faça nada até a resposta. Se for esperar mais de 30 s por qualquer outro motivo (captura, recarga, varredura), avise em uma linha."

**12. Prompt: o modo dirigido só prevê "achados N a M".** Média · custo baixo.
Evidência: `:8` e `:63` "Quando o dono pedir 'R0 e os passos dos achados N a M' de um relato"; a rodada 3 foi pedida como "itens A1 a A3 e G1 a G4" e o relato r3 (`relato-2026-10-12-dirigida-r3.md:7`) acrescentou "mais a passada visual pelos diálogos e o R4.1 com uma entrada antiga", ou seja, lista explícita de passos.
Proposta: aceitar três formas de alvo: achados de um relato (números ou códigos A/G/O), lista explícita de passos do guia ("R0, R4.1 a R4.5, R6.8 a R6.11"), ou fases de um `PLAN-etapa-*.md`; o agente monta a lista, mostra e pede confirmação antes de começar (`:65` já pede para mostrar).

**13. Prompt: a passada visual está presa à etapa 6.** Média · custo baixo.
Evidência: `:68` "(depois da etapa 6: Detalhes, Camadas, Diagnóstico e os diálogos, por causa da fase 6.4)"; título `:1` "depois da etapa 6"; `:3` "Escrito na fase 6.7".
Proposta: a passada visual recebe a lista de janelas do dono na mensagem inicial ("passada visual: Detalhes, Propostas"); sem lista, padrão fixo = todas as sete janelas (`TESTING.md:112`) + diálogos Configurações, Exportar, Especializações, Pasta indisponível, Sair da revisão?. Renomear o arquivo (ou criar `docs/TESTING-COWORK.md` fora de `history/`) para o prompt deixar de carregar número de etapa.

**14. Prompt: ordem e redundância com o guia.** Baixa · custo baixo.
Evidência: `:20` "Leia `docs/TESTING.md` inteiro" e depois `:33-34`, `:39-42`, `:75-76` repetem convenções do guia ("Salvar como é [pessoa]", "Seletor de pasta só na primeira vez", "Espere o campo aparecer", "Campos de texto gravam com Enter"). A "Rodada completa" `:52-59` repete a ordem de `TESTING.md:122`. Item 8 (`:27`, estado de rodadas anteriores) tem 700 caracteres e detalhes de implementação (`mapping.reviewResume`, `preview:`).
Proposta: o prompt só diz o que é do agente (modo, pasta, shell, foco, perguntar nos [pessoa], relato incremental, o que nunca fazer) e aponta para o guia para o resto; o item 8 vira "registre o que já existe na tela inicial e, se souber, a chave `mapping.reviewResume`; não apague nada".

**15. Templates (seção 8): faltam campos que os relatos reais já inventaram.** Média · custo baixo.
Evidência: os três relatos acrescentaram por conta própria "Pasta de trabalho", "DPR 1,25", "viewport 1536 × 639", "janela maximizada/restaurada", "shell Linux (VM) com pasta montada", "sha256 conferido", seção "Resumo" (contagens e "Impede o uso com pessoas?") e, no r3, "Estado do navegador antes da rodada" e "Observações (sem severidade)" (`relato-2026-10-12-dirigida-r3.md:18-28`, `relato-2026-10-12-dirigida.md:167`). O template `TESTING.md:288-323` não tem Resumo, Modo, DPR/viewport, Pasta de trabalho, Tempo gasto, Estado prévio do navegador, Observações sem severidade, nem define as severidades além de "bloqueia" (`:312`).
Proposta: cabeçalho com Modo, Pasta de trabalho, Ferramenta (pessoa / agente+shell), DPR e viewport, Estado prévio do navegador (perfil limpo | projetos pré-existentes), Tempo gasto por roteiro; seção **Resumo** obrigatória (passos/✅/❌, achados por severidade, "Impede o uso com pessoas? sim/não e por quê"); seção **Observações (sem severidade)**; escala definida: bloqueia = perda de dados / não abre / grava em silêncio; alta = impede concluir um fluxo sem contorno; média = há contorno, mas quem não leu o guia tropeça; baixa = cosmético/texto. Template "Uso real" (`:345-371`): acrescentar colunas **Tempo**, **Navegador/SO**, **Modo (pasta/dispositivo)** e **Tamanho do projeto (imagens/marcações)** na tabela "Telas mapeadas", e uma tabela "Sessões" (data, build, duração, quantas gravações com erro, quantos "Projeto alterado fora da app") para o teste avançado do dono alimentar.

**16. Pequenos.** Baixa.
- `TESTING.md:34` "Só para os roteiros com agente (R3.6 e R5)" mas o `R3` inteiro tem a seção 5 como pré-requisito (`:207`): dizer "R3 (repositório de teste) e R3.6/R5 (MCP)".
- `:40` "depois do schema (`schema v8`)": na barra de status o texto real vem de `status.schemaLabel` "Versão do formato: {version}" (`pt-BR.ts:246`) e `status.channelLabel` "Canal deste build: {channel}" (`:249`); conferir como está renderizado e citar o texto visível.
- `R2.2` "na seção da camada `Camada 1`": correto, mas a rodada 1 reclamou que não dizia em que marcação; agora diz (Formulário). OK.
- `R1.16` "(no onClick a ação é uma lista suspensa; no onHold e no onChange, um seletor segmentado)": detalhe de implementação; cortar.
- `R6.6` exemplo "imagem de 484 px e marcação de 290 px": depende do desenho do testador; dizer "leia `width` da imagem e do `rect` no arquivo e escolha x > width_img − width_rect".
- `README.md:111-113` e `CLAUDE.md` apontam para `docs/history/etapa-6-testes-cowork.md` como prompt vivo: um arquivo "vivo" em `history/` confunde (ver 13).

## Estrutura proposta

**`docs/TESTING.md` (guia humano)**
0. Comece aqui (meia página): o que é a app em 3 linhas; "para quem testa à mão: leia 1–4, pule 5 se não for usar MCP, depois R0→R1→R2→R4→R6→R7→R8; R3 e R5 só com MCP"; ordem e tempo estimado por roteiro; o que não é testado (usabilidade).
1. Onde pegar a app (como está) · 2. Requisitos (+ "Permitir em todas as visitas", + "perfil limpo ou registre o estado prévio") · 3. Build id · 4. Como a app grava (como está, sem a frase "Agente:").
5. Mapa da interface (novo: tabela ícone/nome/atalho; janelas; três jeitos de adicionar imagem; Exportar/Baixar).
6. Instalar o MCP (+ sha256, + aviso ESM, link para MCP.md).
7. Como relatar (como está).
8. Roteiros: convenções em ≤6 bullets curtos (código/Ação/Esperado; Tela/Disco; nomes em negrito são texto exato; marcações desenhadas; anotações; "Regressão conhecida" em itálico); tabelas R0–R8 com os passos divididos (7) e os resíduos marcados (6); R5 reposicionado depois de R7 ou o quadro "Comece aqui" mandando a ordem.
9. Templates (15).
Apêndice A — Para o agente testador: [pessoa] (definição, dois passos inteiros, seletor só na primeira vez), shell, `title`/`aria-label`, esperar o campo, `<select>` nativo, `keydown` sintético, injeção de arquivos, `Set-Clipboard`, headless para o print, cliente MCP próprio.
Apêndice B — Operações de disco por sistema (chmod/attrib, Python one-liner, mover pastas com o projeto fechado).

**Prompt do Cowork (mover para `docs/TESTING-COWORK.md`; `history/` guarda a cópia por rodada)**
1. Papel e limites (3 linhas) · 2. Antes de começar: modo (completo | dirigido por achados | dirigido por lista de passos | fases de um PLAN), confirmar o que o dono preparou numa pergunta só, pasta de trabalho, shell, foco/desbloqueio, estado prévio do navegador, build id · 3. Passos [pessoa]: bloco por roteiro **e** pergunta explícita + "estou esperando" em cada um; aviso de espera > 30 s · 4. Como agir (só o que é do agente; o resto é "siga o apêndice A do guia") · 5. O que executar: completa (ordem do guia) | dirigida (montar lista, mostrar, confirmar; passada visual com lista do dono ou padrão) · 6. Conferir e registrar (como está) · 7. Relato incremental e fechamento · 8. Nunca.

## Teste manual avançado (candidatos, além de R0–R8)

| Passo | O que faz | Risco que sonda |
| --- | --- | --- |
| A1 Sessão longa | Mapear uma tela real por 60–90 min no `principal` em pasta, sem fechar; conferir `revision` e Diagnóstico no fim | vazamento de memória, undo crescendo, gravação que para em silêncio |
| A2 Projeto grande | 10+ imagens de 2–4 MP, 150+ marcações, 300+ anotações (pode gerar via MCP `propose_changes` + aplicar); medir pan/zoom, abrir Lista e Incompletas, trocar camada ativa | orçamento por quadro, `projectIndex`, IndexedDB/FS com arquivos grandes |
| A3 App + MCP simultâneos | Com a app aberta e editando, pedir ao Claude Code 3 propostas seguidas; depois editar na app enquanto a proposta é gravada | `revision-conflict`, varredura de `proposals/`, "Projeto alterado fora da app" indevido |
| A4 Duas abas, mesmo projeto em pasta | Abrir `principal` em duas abas; editar nas duas em alternância; observar qual ganha | perda silenciosa, diálogo externo em loop, `revision` saltando |
| A5 Duas abas, mesmo projeto neste dispositivo | Igual, com projeto IndexedDB | sem `revision` por arquivo: regra de conflito do modo local |
| A6 Fechar o navegador com edição pendente | Editar e fechar o Chrome inteiro (não só a aba) < 250 ms depois; reabrir pelos recentes | "Sair da página?" não aparece ao fechar o navegador; condição de entrada do "Diário de recuperação" (ROADMAP) |
| A7 Reinício do SO / tela bloqueada | Deixar a app aberta, bloquear a tela 10 min, voltar; depois reiniciar o SO com a app aberta | varredura externa pausada, permissões de pasta após reinício, service worker |
| A8 `file://` × Pages × preview | Criar projeto neste dispositivo em cada origem; conferir que nenhuma vê as outras; abrir a mesma pasta nas três | isolamento de IndexedDB/localStorage, `preview:` prefixo, permissão de pasta por origem |
| A9 Edge | R0 + R1.1–R1.8 + R6.8–R6.11 no Edge | File System Access, "Salvar como", `attrib` + Edge |
| A10 DPR e zoom do navegador | Monitor 125 % e 150 %; zoom do Chrome 90 % e 125 %; conferir alinhamento do contorno com a imagem e legibilidade do texto do canvas | conversão tela/imagem, Konva com DPR, textos cortados |
| A11 Offline | Instalar como app, desligar a rede, abrir, criar projeto em pasta, exportar zip; religar, conferir "Nova versão disponível" | service worker, CSP `connect-src 'none'` sem rede, atualização |
| A12 Imagens-limite | PNG de 40 MP, JPEG com EXIF rotacionado, WebP animado, SVG, arquivo corrompido com extensão .png | recodificação WebP, orientação EXIF, rejeição com mensagem, `image-too-large` no MCP |
| A13 Pasta no OneDrive/Google Drive/rede | Criar projeto numa pasta sincronizada; editar; esperar o sync | gravação por arquivo temporário + renomear, "Projeto alterado fora da app" pelo sync, permissões |
| A14 Git de verdade | Projeto em pasta dentro de um repositório; commit, `git checkout` de um commit anterior com a app aberta, `git stash` | detecção externa em massa, `backups/` ignorado, propostas versionadas |
| A15 Undo profundo | 100 ações seguidas, 100 Ctrl+Z, 100 Ctrl+Shift+Z, aplicar proposta no meio | pilha de undo, "um gesto = uma entrada", undo de Aplicar aceitas |
| A16 Teclado só | Um fluxo R1.6–R1.12 sem mouse (Tab, setas, Enter, Alt+N, Alt+L, Delete, Esc) | foco perdido, controles sem nome, armadilhas de foco em diálogos |
| A17 Exportar/importar grande | Zip do A2 (>100 MB); Abrir zip dele num projeto neste dispositivo; exportar de novo e comparar | JSZip em memória, IndexedDB com blobs grandes, igualdade do `mapping.json` |
| A18 Especialização evoluindo | Aplicar `sdui.json` v2, editar o arquivo para v3 com um campo novo obrigatório, Atualizar versão…; conferir Incompletas e as propostas antigas | migração de especialização, pendências retroativas, `spec-unavailable` no MCP |

## O que está bom

- Cada passo tem código, Ação e Esperado separados em Tela/Disco, e o relato por código funcionou nas três rodadas (77, 58 e 32 linhas rastreáveis).
- Seções 3 e 4 (build id, service worker preso, como a app grava, WebP, "Sair da página?") respondem exatamente ao que confundiu a rodada 1; a seção 6 e o cabeçalho do Diagnóstico são precisos.
- Todos os nomes de botão, diálogo e mensagem conferidos existem na interface com o texto exato (item 9), inclusive os da revisão (`junto`, `Nível`, `Aceitar N visíveis`, `Aceitar o grupo Projeto`) e os atalhos Alt+L/Alt+N.
- As correções pós-rodadas estão incorporadas (R4.3 hachura, R4.5 duas mudanças, R5.5 ordem invertida, R6.10 "sem clicar em nenhum botão", R8 retoma a revisão sem o zip).
- O prompt já pede relato incremental, repro dupla antes de registrar, "nunca ajuste um passo para passar" e a seção "O que atrapalhou" como insumo da próxima etapa; isso é o que tornou os relatos úteis.
- O template dirigido com "Achado de origem" e "Regressões fora do alvo" é simples e foi seguido à letra.