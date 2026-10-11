# Histórico — Etapa 5, pré-voo para uso real (seção do antigo PLAN.md)

> Fases 5.1 a 5.9 concluídas. Referência atual: [`../TESTING.md`](../TESTING.md) (guia do testador), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../MCP.md`](../MCP.md) (MCP 0.3.1) e o [`README.md`](../../README.md). Os prompts usados na etapa estão ao lado: [`etapa-5-coordenador.md`](etapa-5-coordenador.md) (coordenador de agentes) e [`etapa-5-testes-cowork.md`](etapa-5-testes-cowork.md) (testador no computador do dono).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo (exceto os checkboxes da 5.9, marcados ao fechar a etapa), seguida das decisões consolidadas dos PRs e dos itens acrescentados a "Fora desta etapa" no fechamento. As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md); as etapas seguintes, nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 5: pré-voo para uso real

### Objetivo

Fechar, antes dos testes com pessoas de verdade, os buracos encontrados na avaliação de arquitetura de 2026-10-10 que causam **perda de dados silenciosa** ou deixam o testador **sem meios de relatar** o que viu. Nenhuma funcionalidade nova: cada fase corrige um caminho já existente, com teste que reproduz o problema antes da correção. A etapa termina com um guia do testador, para o marco "Uso real" do [`docs/ROADMAP.md`](../ROADMAP.md) começar com o relato padronizado.

Origem dos achados: revisão do código por camada (modelo, store/storage, canvas/UI, MCP e tooling), com todos os gates verdes no `main` (`ae4850f`: lint, typecheck, 2878 testes, build). O que não entrou aqui está registrado em "Fora desta etapa", no fim, para não se perder.

### Decisões

- **Só correções.** Refatorações de conforto (dividir `session.ts`, `derived.ts`, `batch.ts`, `ReviewLevels.tsx`) ficam fora: mexer em arquivo grande sem necessidade antes dos testes aumenta o risco, não o reduz.
- **Teste primeiro.** Toda fase começa com um teste que falha reproduzindo o cenário do achado, no projeto do Vitest da camada (`tests/store`, `tests/model`, `tests/mcp`…), e só então corrige. O PR cita o teste.
- **Sem mudar o formato.** Nenhuma fase altera o `mapping.json` (schema v8), o formato da proposta nem as tools do MCP; a 5.7 só muda limites e versão do servidor.
- **O que a app grava é o projeto confirmado** (`store.committed`), nunca a prévia de um gesto. Vale para o autosave e para o zip.
- **Falha de gravação é erro, não aviso**, para quem precisa saber se gravou (aplicar aceitas, fechar o projeto). O autosave por timer continua tolerante (mostra "erro ao salvar" e tenta de novo).
- **Projeto inconsistente abre reparado, com backup**, quando o reparo é mecânico e inequívoco; o resto continua recusado, mas com a lista exata do que está errado. Ler nunca grava: o backup e o arquivo reparado só são gravados pela sessão, na primeira gravação, como já acontece com a migração.
- **Só desktop** (decisão de 2026-10-11, fase 5.8). Ninguém testa nem vai usar a app no celular: o dono deixou de conferir os previews no aparelho, os testes reais serão no desktop (pessoas e o agente do Cowork) e o uso é de devs em estação de trabalho. Manter o layout de celular significaria código que todo PR paga e ninguém exercita. A app passa a ser **só desktop** (largura mínima com aviso abaixo dela), o que também encerra a regra "pronto só quando funciona nos dois" e o projeto `mobile` do e2e. A remoção entra **antes** do guia do testador, para o guia não nascer com seções a apagar.

### Execução por um coordenador de agentes

Esta etapa foi desenhada para um **agente coordenador** distribuir as fases entre agentes executores. Regras:

1. **Uma fase = um branch + um PR**, nomeado `claude/etapa-5-<n>-<assunto>` (ex.: `claude/etapa-5-1-autosave-gesto`). O executor recebe só a sua fase, lê `CLAUDE.md`, esta seção inteira (Objetivo, Decisões e a fase dele) e os arquivos listados em "Toca em"; não mexe nos arquivos de outra fase da mesma onda. Se precisar, registra a dependência no PR e para.
2. **Ondas.** As fases de uma onda rodam em paralelo, cada uma a partir do `main` atual; a onda seguinte só começa com todos os PRs da anterior mergeados. O coordenador rebaseia ou mergeia o `main` em cada branch antes de abrir o PR para revisão se outro PR da onda entrou antes (conflitos esperados: só em `src/i18n/pt-BR.ts` e `en-US.ts`, por chaves novas).
   - **Onda 1:** 5.1, 5.3, 5.4, 5.6 e 5.7 (arquivos disjuntos).
   - **Onda 2:** 5.2 (depende da 5.1, mesmo `session.ts`) e 5.5 (depende da 5.1 e da 5.3, por `session.ts` e `app/controller.ts`).
   - **Onda 3:** 5.8 (só desktop; depende das ondas 1 e 2, porque remove partes de celular que elas tocaram).
   - **Onda 4:** 5.9 (guia do testador e fechamento; depende da 5.8, para o guia já nascer só desktop).
3. **Gates antes de abrir o PR:** `npm run lint && npm run typecheck && npm test && npm run build` (e `npm run build:mcp` na 5.7). O executor cola o resumo dos gates no PR; o coordenador confere o CI verde e o e2e antes de mergear.
4. **Descrição do PR** com as três seções do `CLAUDE.md` (Resumo, Como testar, Decisões tomadas) e os checkboxes da fase marcados neste `PLAN.md`, no mesmo PR. A partir da 5.8, "Como testar" é só no desktop.
5. **Decisões pequenas** o executor toma e documenta no PR; **ambiguidade** que mude comportamento visível vira pergunta no PR (seção "Decisões a confirmar", abaixo) e o coordenador decide ou escala ao dono. O coordenador consolida as decisões tomadas de volta no histórico ao fechar a etapa (5.9).
6. **O que fica com o dono** (o coordenador registra no PR e avisa): criar o ruleset da `main` (5.6), criar a tag `mcp-v0.3.1` depois do merge da 5.7, disparar o deploy de preview quando quiser ver um branch publicado.
7. **Aceite** de cada fase é o descrito nela; o coordenador não mergeia fase sem o teste que reproduz o achado.

### Fases

#### 5.1 — Autosave grava o projeto confirmado, nunca a prévia do gesto

**Achado.** `persist` lê `store.project` (`src/store/session.ts`, `const p = store.project.value`), que durante um arrasto é a prévia. Se o timer do autosave (800 ms depois da última edição) dispara no meio de um gesto e o usuário cancela com Esc, o disco fica com a geometria da prévia, a memória volta ao original sem subir a `revision` e nada reagenda: divergência silenciosa, com status "salvo". O zip (`collectFiles`) tem o mesmo problema e ainda omite imagens ausentes sem avisar.

**Toca em:** `src/store/session.ts`, `src/storage/autosave.ts` (se precisar), `tests/store/session.test.ts`, `tests/store/externalChanges.test.ts`, `src/app/controller.ts` só na exportação (aviso de imagens ausentes), `src/i18n/*`.

- [x] Teste que reproduz: edição → `beginGesture` → timer dispara → `cancelGesture`; hoje o disco difere de `committed`
- [x] `persist` serializa `store.committed`; se há gesto em andamento no momento da gravação, grava o confirmado (a prévia não vai para o disco em nenhum caso)
- [x] Ao terminar um gesto (`commitGesture`), a gravação é agendada como hoje (pela `revision`); ao cancelar, nada é gravado e o disco já está igual ao confirmado
- [x] `collectFiles` (zip) usa `committed` e devolve a lista de imagens ausentes; a exportação avisa quais faltaram (toast ou diálogo) em vez de omitir em silêncio
- [x] Testes: gesto confirmado grava uma vez com a geometria final; zip com imagem ausente lista o arquivo

**Aceite**: os testes acima no projeto `store` do Vitest; `tests/components/editorRenders.test.tsx` continua no orçamento (a mudança não pode fazer a interface renderizar durante o gesto).

#### 5.2 — Aplicar aceitas só conclui se o `mapping.json` gravou

**Achado.** `applyAccepted` (`src/store/proposalActions.ts`, passo 3) chama `deps.flush()`, mas `AutoSaver.flush` (`src/storage/autosave.ts`) engole o erro e só muda `status` para `'error'`. Com a gravação recusada (alteração externa, quota do IndexedDB, pasta sem permissão), a proposta é gravada como `applied` e as imagens de origem em `proposals/<id>/images/` são apagadas. Se o usuário então escolhe "Recarregar" no diálogo de conflito, perde as mudanças, a proposta diz "aplicada" e as imagens ficam órfãs em `images/`. Além disso, uma falha **depois** do `saveMapping` (limpeza de imagens e `specs/`) marca "erro ao salvar" com o JSON já em disco e a próxima tentativa grava `revision + 2`.

**Toca em:** `src/storage/autosave.ts`, `src/store/session.ts`, `src/store/proposalActions.ts`, `src/store/review.ts` e `src/ui/review/*` só para mostrar o novo resultado, `tests/store/proposals.test.ts`, `tests/store/session.test.ts`, `tests/store/proposalHarness.ts`, `src/i18n/*`.

- [x] Testes que reproduzem: `applyAccepted` com `saveMapping` lançando `ExternalChangeError` e com erro genérico de storage; hoje a proposta fica `applied` e as origens somem
- [x] `flush()` passa a informar se gravou (devolve um resultado ou lança para quem pediu explicitamente); o caminho do timer continua como hoje
- [x] `applyAccepted`: se o `mapping.json` não gravou, desfaz a entrada do histórico, devolve as imagens copiadas (`rollback`) e **não** grava a proposta; resultado novo (`save-failed`) com mensagem na interface; o conflito externo abre o diálogo "Projeto alterado fora da app" normalmente, e a revisão continua aberta com as decisões intactas
- [x] Limpeza pós-gravação (`readImage`/`removeImage`/`removeSpec` depois do `saveMapping`) isolada em `try/catch` com `reportError('session.cleanup', …)`: não marca erro de gravação nem sobe a revisão de novo
- [x] Teste: falha na limpeza pós-gravação deixa `saveStatus` em `saved`, o erro no Diagnóstico e a próxima gravação em `revision + 1`

**Aceite**: os testes acima; o roteiro da etapa 4 (`docs/history/PLAN-etapa-4.md`), passos de aplicar aceitas, continua passando com o zip de exemplo.

#### 5.3 — Projeto com dados inconsistentes: lista exata e reparo com backup

**Achado.** `deserialize` (`src/model/serialization.ts`) é tudo-ou-nada: qualquer invariante violado devolve `invariant-violation` e a interface só diz "O mapping.json tem dados inconsistentes". Um par de anotação com `id` repetido, um `rect` fora da imagem depois de uma edição à mão ou um `images-overlap` por arredondamento deixam o usuário sem acesso a todo o resto. Agrava: as operações do modelo aceitam ids explícitos sem checar colisão (`createMarking`, `addImage`, `addAnnotation`, `addLayer`; `checkEntries` só confere dentro da anotação, e o invariante exige unicidade global), então um chamador sem `validateProject` pode gravar o que o carregador recusa. `z.iso.datetime()` sem `offset: true` recusa um `createdAt` com fuso escrito por ferramenta externa.

**Toca em:** `src/model/invariants.ts`, `src/model/serialization.ts`, novo `src/model/repair.ts`, `src/model/annotations.ts`, `markings.ts`, `images.ts`, `layers.ts`, `schema.ts`, `src/storage/loadProject.ts`, `src/app/controller.ts` (fluxo de abertura), um diálogo em `src/ui/` (reaproveitar `Dialog`), `src/i18n/*`, `docs/FORMAT.md`, `tests/model/*`, `tests/app/controller.test.ts`, `tests/fixtures/`.

- [x] Fixtures: um `mapping.json` por classe de invariante (`tests/fixtures/invalid/*.json`), gerados a partir do projeto do roteiro 13.9
- [x] Operações do modelo recusam `duplicate-id` para `id` explícito já existente (marcação, imagem, anotação, camada) e par com `id` já usado em **outra** anotação; teste por operação
- [x] `invariant-violation` carrega, por problema: código, entidade (`image`/`marking`/`annotation`/`layer`/`spec`), id e nome quando houver; o diálogo de erro lista tudo com "Copiar"
- [x] `repairProject(project, issues)` puro em `src/model/repair.ts`: devolve `{ project, repaired, unrepaired }`. Reparos mecânicos: par com id duplicado → id novo; `rect-out-of-image` → recorte aos limites da imagem (marcação que ficar sem área → removida, com registro); marcação com `imageId` inexistente, anotação com `markingId`/`layerId` inexistente → removida com registro; `parentId` inexistente ou ciclo na hierarquia → marcação vira raiz da imagem; `images-overlap` → a imagem de maior índice é deslocada para a direita da caixa das anteriores. Tudo o que não está nesta lista é `unrepaired`
- [x] Fluxo de abertura: com `unrepaired` vazio, o diálogo oferece **Reparar e abrir** (além de Fechar); ao aceitar, a sessão agenda o backup do original (`backups/`, mesmo mecanismo da migração) e grava o reparado na primeira gravação; o resumo do reparo entra no Diagnóstico e num aviso. Com `unrepaired`, só a lista e Fechar
- [x] `z.iso.datetime({ offset: true })` em `schema.ts` (e no formato da proposta); ao serializar, datas com fuso são normalizadas para UTC `Z`; teste de round-trip para as duas formas
- [x] MCP: `loadProject` continua recusando (ler nunca grava), mas a resposta traz a mesma lista de problemas; `docs/MCP.md` cita
- [x] `docs/FORMAT.md`: seção "Arquivos inconsistentes" (o que a app repara, o que recusa, onde fica o backup)

**Aceite**: cada fixture inválida abre reparada ou é recusada com a lista; o backup existe na pasta depois da primeira gravação; o projeto do roteiro 13.9 íntegro abre sem passar pelo reparo; `tests/model/performance.test.ts` continua no orçamento (`validateProject` não pode ficar mais lento no caminho feliz).

#### 5.4 — Diagnóstico completo e identificação do build

**Achado.** Só o `ErrorBoundary` e chamadas explícitas a `reportError` chegam ao Diagnóstico: não há `window.onerror` nem `unhandledrejection`, então promessas soltas em handlers somem. Não há identificação do build visível (a barra mostra schema e canal; `package.json` é `0.0.0`), e o "Copiar" do Diagnóstico exporta só os erros, sem build, canal, navegador ou tipo de armazenamento. Como não há telemetria por desenho (CSP), isso é a única forma de um testador relatar um bug de modo útil.

**Toca em:** `src/main.tsx`, `src/utils/report.ts`, `vite.config.ts` (`define`), `src/utils/channel.ts` ou novo `src/utils/build.ts`, `src/ui/StatusBar.tsx`, `src/ui/SettingsDialog.tsx` (ou Ajuda), `src/ui/DiagnosticsView.tsx`, `src/i18n/*`, `README.md`, `tests/utils/*`, `tests/components/*`, `tests/e2e/*`.

- [x] `window.addEventListener('error')` e `('unhandledrejection')` em `main.tsx` chamando `reportError('window', …)`; erros repetidos em sequência agrupados (contador), para um laço não lotar os 20 lugares; sem violar a CSP
- [x] Build id injetado no build por `define` (`__BUILD_ID__`): SHA curto do commit (`GITHUB_SHA` no CI; `git rev-parse --short HEAD` localmente; `dev` sem git) mais a data do build; disponível como constante tipada em `src/utils/`
- [x] Build id, canal e schema na barra de status (desktop) e numa seção "Sobre" em Configurações (desktop e celular), com "Copiar"
- [x] "Copiar" do Diagnóstico gera um cabeçalho antes dos erros: build, canal, schema, tipo de armazenamento (pasta/local), `navigator.userAgent`, tamanho da janela, idioma, tema, contagens de imagens/marcações/anotações (sem nomes nem caminhos: privacidade), e indica se há gravação pendente
- [x] `README.md`: seção "Como relatar um problema" (onde fica o Diagnóstico, o que copiar, onde abrir a issue)
- [x] Testes: promessa rejeitada solta aparece no Diagnóstico; texto copiado tem o cabeçalho; e2e confere que o build id aparece na barra e no "Sobre" (desktop e celular)

**Aceite**: os testes acima; `tests/theme/tokenLiterals.test.ts` e o teste de chaves de i18n continuam verdes; o build do preview mostra `prévia` e o id.

#### 5.5 — Gravar ao sair da página e sem atraso nas operações caras

**Achado.** `bindPageLifecycle` (`src/app/controller.ts`) dispara `flush()` no `beforeunload`, mas a escrita por File System Access é assíncrona e morre com a aba se o usuário confirma a saída; `pagehide` não é tratado (iOS Safari não dispara `beforeunload`). O debounce de 800 ms amplia a janela, e operações caras (adicionar, trocar ou remover imagem; aplicar, atualizar ou remover especialização) ficam o mesmo tempo só em memória.

**Toca em:** `src/app/controller.ts`, `src/store/session.ts`, `src/storage/autosave.ts`, `src/app/useImageIntake.tsx` (só se a gravação imediata for disparada ali), `tests/app/controller.test.ts`, `tests/store/session.test.ts`.

- [x] Teste que reproduz: alteração → `pagehide` → nada é gravado até o timer
- [x] `pagehide` e `visibilitychange: hidden` chamam `flush()` imediato (sem debounce); `beforeunload` continua pedindo confirmação se há pendência
- [x] Operações caras gravam sem debounce: a sessão chama `flush()` logo depois de adicionar/trocar/remover imagem e de aplicar/atualizar/remover especialização (e o aplicar aceitas, que já grava)
- [x] Debounce das edições comuns reduzido de 800 para 250 ms (decisão do dono, após o teste manual do #93); motivo no comentário de `AUTOSAVE_DELAY_MS`
- [x] Testes: `pagehide` grava; adicionar imagem grava sem esperar o timer; duas operações caras seguidas não gravam em paralelo (fila única do autosave)

**Aceite**: os testes acima; `tests/e2e/folder.spec.ts` continua verde (a gravação imediata não pode disputar com a leitura do `mapping.json` que o teste faz).

#### 5.6 — CI, deploy e reprodutibilidade

**Achado.** `deploy.yml` não roda `typecheck`, `build:mcp` nem e2e antes de publicar; como os merges são pelo celular, um PR com CI vermelho pode ir para produção se nada bloquear o merge. O Playwright tem `retries: 0` e `addImage` espera `waitForTimeout(500)`; o Node não está fixado no repositório; Konva fora de `src/canvas/` não é imposto por lint; não há Dependabot nem orçamento de tamanho do `dist/index.html`.

**Toca em:** `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, novo `.github/dependabot.yml`, `playwright.config.ts`, `tests/e2e/helpers.ts` (e onde o canvas sinaliza que enquadrou), `.nvmrc`, `package.json` (`engines`), `eslint.config.js`, `README.md`.

- [x] `deploy.yml` roda tudo que o `ci.yml` roda (`typecheck`, `test:coverage` ou `test`, `test:perf`, `build`, `build:mcp` e o job e2e) antes de `upload-pages-artifact`, para a versão principal e para o preview; de preferência um workflow reutilizável (`workflow_call`) para os dois não divergirem de novo
- [x] Playwright: `retries: process.env.CI ? 1 : 0`; `addImage` espera uma condição observável (ex.: atributo no canvas quando o enquadramento termina, ou a pílula de zoom estável) em vez de 500 ms fixos; `trace` só na repetição
- [x] `.nvmrc` com `22`, `"engines": { "node": ">=22" }` e `setup-node` lendo `node-version-file`
- [x] ESLint: `konva` proibido em `src/{ui,app,store,storage,i18n,theme,utils}/**` (exceção `src/canvas/CanvasHost.tsx` já está dentro de `canvas/`); `react-hooks/exhaustive-deps` como erro ou `eslint --max-warnings 0`
- [x] `.github/dependabot.yml`: npm e github-actions, semanal, agrupado (minor/patch juntos), para o dono aprovar pelo celular
- [x] Orçamento do `dist/index.html` no CI (falha acima de 1,5 MB; hoje 1,0 MB) e o tamanho no resumo do job
- [x] Instruções para o dono, no PR: ruleset na `main` exigindo os checks `check` e `e2e` e PR obrigatório

**Aceite**: `workflow_dispatch` do deploy num preview deste branch termina verde com todos os passos; um PR de teste com e2e quebrado fica vermelho no deploy do preview.

#### 5.7 — MCP: stdout limpo, limites de memória e versão 0.3.1

**Achado.** O código Emscripten dos codecs `@jsquash` define `Module["print"] || console.log`: um aviso da libjpeg/libwebp (JPEG truncado ou corrompido) vai para o **stdout**, que é o canal do protocolo, e corrompe a sessão MCP. Não há `unhandledRejection`/`uncaughtException` com o prefixo `mapping-mcp:`. O teto de 100 megapixels permite pico de memória acima de 1 GB (heap WASM + RGBA + cópia da orientação + `Float32Array` da redução). O `base64` das operações não tem `.max()` no schema e é decodificado antes de qualquer checagem. `ModelError` só é tratado em `get_code_hints`.

**Toca em:** `mcp/main.ts`, `mcp/image/codecs.ts`, `mcp/image/formats.ts`, `mcp/operations.ts`, `mcp/batch.ts` (só a checagem de tamanho), `mcp/tools.ts` (`failure()`), `mcp/version.ts`, `docs/MCP.md`, `tests/mcp/*`.

- [x] Teste que reproduz: `get_image_file` sobre um JPEG truncado, pelo bundle por stdio; hoje algo além de JSON-RPC pode sair no stdout (o teste lê o stdout bruto e exige só mensagens válidas)
- [x] `console.log/info/debug` redirecionados para `stderr` antes de `server.connect` (ou `print`/`printErr` passados aos módulos Emscripten); `console.error/warn` já vão para o stderr
- [x] `process.on('unhandledRejection')` e `('uncaughtException')`: linha no stderr com o prefixo e `exit(1)`
- [x] `MAX_PIXELS` para 40 megapixels; `base64` com `.max()` no schema (coerente com `MAX_FILE_BYTES`) e checagem do tamanho antes de `Buffer.from`
- [x] `ModelError` tratado em `failure()` para todas as tools (hoje vira `internal-error` com stack no stderr)
- [x] `SERVER_VERSION` 0.3.1; `docs/MCP.md`: limites atualizados e a tag `mcp-v0.3.1` (o dono cria após o merge)

**Aceite**: `tests/mcp/images.test.ts` e `read.test.ts` continuam verdes; o teste novo de stdout passa; `npm run build:mcp` gera o bundle e o `--version` imprime `0.3.1`.

#### 5.8 — Só desktop: remoção do layout de celular

**Achado.** O suporte a celular (barras de cima e de baixo, gaveta de três alturas, janelas em tela cheia, menu Painéis, revisão mobile, estados de toque "segurar e mover", densidade de 44 px, blocos `@media`, projeto `mobile` do Playwright) é cerca de 2% do código, mas custa em **todo** PR de interface (design, teste, "Como testar" e áreas de toque duplicados) e dobra o tempo do e2e. Ninguém mais o exercita: o dono não confere previews no aparelho, os testes reais serão no desktop e o agente do Cowork não testa toque. Código mantido e nunca usado é dívida. A arquitetura (modelo, store, storage, canvas) não muda com a remoção: tudo isso vive na casca de interface, na entrada de ponteiro e nos tokens. De quebra, um shell só no `Editor.tsx` resolve a remontagem do canvas ao trocar de layout, listada em "Fora desta etapa".

**Toca em:** `src/app/Editor.tsx`, `EditorTopBar.tsx`, `EditorBottomBar.tsx`, `MobileWindow.tsx`, `PanelsMenu.tsx`, `EditorPanel.tsx` (`EditorSheet`), `Home.tsx`; `src/ui/BottomSheet.tsx`, `ActionSheet.tsx`, `review/MobileReview.tsx` (e `MobileReviewStrip`), `useMediaQuery.ts` e quem o usa; `src/store/ui.ts` (`mobileWindow`, `sheet`); `src/canvas/gestureMachine.ts` e `input/pointer.ts` (só os estados de toque exclusivos do celular); `src/theme/tokens.ts`, `breakpoints.ts` e os `.css` (blocos `@media` de celular e a troca de densidade); `src/i18n/*` (chaves que sobram); `playwright.config.ts`, `tests/e2e/*` (projeto `mobile` e `skip` condicionais), `tests/components/*` e `tests/theme/*` afetados; `CLAUDE.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/redesign/HANDOFF.md` e `HANDOFF-PROPOSALS.md` (partes de celular viram histórico).

- [x] Testes primeiro: um teste de componente que monta o editor com a largura abaixo do mínimo e espera o aviso de "janela estreita" (hoje falha: monta o layout de celular); os testes que exercitam componentes de celular são removidos junto com eles, não adaptados
- [x] Um shell só no `Editor.tsx` (`EditorMainBar` + `EditorWindows` + `StatusBar`), sem `useMediaQuery`; o canvas é montado uma vez e não é remontado por mudança de largura; `Home.tsx` com um layout
- [x] Remoção dos componentes só de celular, do estado `mobileWindow`/`sheet` e das chaves de i18n que ficarem sem uso (o teste de chaves iguais nos dois idiomas continua verde)
- [x] Máquina de gestos: saem os estados exclusivos do celular ("segurar e mover", vibração de pegar); **fica** a pinça (trackpad) e o `pointercancel`; `touch-action` continua `none` no canvas, para toque simples (clicar, arrastar, rolar) seguir funcionando num monitor de toque
- [x] Largura mínima (token `size-app-min`, proposto 900 px): abaixo dela a app mostra um aviso centralizado ("Abra numa janela maior") no lugar do editor, com o projeto intacto e gravando normalmente; acima, o layout de desktop como hoje
- [x] Tokens: sai a troca de densidade por breakpoint (`--control-*`, `--t-text*`, `--size-handle-touch` passam a ter um valor só); saem os blocos `@media` de celular dos `.css`; `breakpoints.ts` fica só com o que o desktop usa (`compact`, se ainda for usado, e o mínimo); `tests/theme/*` ajustados
- [x] Playwright: sai o projeto `mobile` e os `skip` condicionais; o e2e roda uma vez, no desktop
- [x] Documentação: `CLAUDE.md` ("Desktop primeiro, utilizável no celular" vira "Só desktop: largura mínima de 900 px, mouse e teclado; toque simples funciona, gestos de celular não"; a regra dos 44 px e a frase "pronto só quando funciona nos dois" saem; "Como testar" só desktop), `README.md`, `docs/ARCHITECTURE.md` (seções de celular removidas, decisão registrada), `docs/redesign/HANDOFF*.md` (as partes de celular marcadas como históricas, sem apagar o documento)
- [x] Orçamento do `dist/index.html` e `tests/components/editorRenders.test.tsx` continuam verdes; o tamanho do bundle deve cair

**Aceite**: o roteiro 13.9 e o da etapa 4 passam no desktop; a janela estreita mostra o aviso e volta ao editor ao alargar, sem perder seleção nem viewport; nenhum arquivo em `src/` menciona celular, toque longo ou gaveta (grep por `mobile`, `sheet`, `hold`, `coarse` limpo, salvo o `touch-action` do canvas); o e2e termina em cerca de metade do tempo.

#### 5.9 — Guia do testador e fechamento

**Achado.** Os roteiros de teste manual existem (13.9 em `docs/history/PLAN-etapas-1-2.md`, 3b e etapa 4 nos históricos), mas estão espalhados, escritos para quem conhece o projeto e com passos de celular que a 5.8 tornou obsoletos, e não há um lugar que diga ao testador onde pegar a app, o que o navegador precisa, como instalar o MCP e como relatar. O marco "Uso real" pede um registro (telas mapeadas, devs, telas implementadas por agentes, o que atrapalhou) e não há template.

**Toca em:** novo `docs/TESTING.md`, `docs/prompts/etapa-5-testes-cowork.md`, `README.md`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-5.md`.

- [x] `docs/TESTING.md`: onde pegar a app (GitHub Pages, `/preview/`, `index.html` avulso do artefato) e o que cada uma implica (pasta só em Chrome/Edge; projeto local nos demais; PWA só em `https:`; largura mínima); requisitos; instalar o `mapping-mcp.js` da Release num repositório (resumo do `docs/MCP.md`); como relatar (Diagnóstico com cabeçalho, da 5.4)
- [x] Roteiros consolidados em `docs/TESTING.md`, só desktop, reescritos como **ação → resultado esperado observável** (o que aparece na tela, o que fica no disco), numerados, para serem executados tanto por uma pessoa quanto por um agente com controle do computador (Cowork), que confere cada resultado por captura de tela ou pelo arquivo. Fontes: 13.9, roteiro da 3b e roteiro da etapa 4, sem perder passos de desktop (os passos de celular saem, com uma nota); os históricos passam a apontar para o novo arquivo
- [x] Template de registro do marco "Uso real" em `docs/TESTING.md`: telas mapeadas, devs que consultaram, telas implementadas por agentes a partir da ferramenta, lista do que atrapalhou (com build id e data em cada item)
- [x] `docs/TESTING.md` e o prompt do testador no computador do dono (`docs/prompts/etapa-5-testes-cowork.md`) conferidos um contra o outro: mesmos roteiros, mesmo template, mesmos nomes de janela e de botão; o guia aponta para o prompt
- [x] `README.md` aponta para `docs/TESTING.md`
- [x] Fechamento: esta seção vai para `docs/history/PLAN-etapa-5.md` (com as decisões consolidadas dos PRs), os dois prompts de `docs/prompts/` vão junto, `PLAN.md` volta a "nenhuma etapa em andamento", `docs/ROADMAP.md` marca a etapa 5 concluída e `CLAUDE.md` atualiza "Etapa atual"

**Aceite**: um agente sem contexto do projeto consegue, só com `docs/TESTING.md`, abrir a app publicada, seguir o roteiro 13.9 e produzir um relato no formato do template (o coordenador executa este aceite com um agente novo e cola o relato no PR).

### Decisões a confirmar

1. Reparo de `images-overlap`: deslocar a imagem de maior índice para a direita da caixa das anteriores (alternativa: recusar e listar). Proposto: deslocar.
2. Marcação cujo `rect` recortado fica sem área (fora da imagem por inteiro): remover com registro (alternativa: manter com 1×1 px). Proposto: remover.
3. Gravação imediata nas operações caras vale também para o projeto local (IndexedDB), não só para a pasta. Proposto: sim, o custo é o mesmo.
4. Orçamento do `dist/index.html`: 1,5 MB. Proposto: sim, com o valor num só lugar no workflow.
5. Build id com data do build além do SHA. Proposto: sim (`abc1234 · 2026-10-10`), porque o `index.html` avulso circula sem o repositório.
6. Largura mínima da app (5.8): 900 px, o breakpoint de desktop atual. Proposto: sim; tablet em modo paisagem com teclado entra, retrato não.
7. Toque simples no desktop (monitor de toque, tablet): clicar, arrastar e rolar continuam; gestos de celular (segurar e mover, gaveta) saem; a pinça fica porque o trackpad a usa. Proposto: sim.

### Fora desta etapa (registrado para depois do marco)

Achados da mesma revisão que não causam perda de dados nem impedem o relato, e por isso ficam para as Evoluções ou para a próxima revisão técnica:

- **Concorrência real** entre duas abas na mesma pasta, ou app e MCP gravando ao mesmo tempo: janela de corrida entre a conferência e o `close()`; para abas da mesma origem, `navigator.locks`; para o MCP, documentar como limitação. O `updateStored` do MCP (`proposalStore.ts`) tem a mesma janela antes do `rename`.
- **Canvas**: ponteiro "fantasma" trava o modo pinça se um `pointerup` se perde (sem `lostpointercapture`/`blur` em `pointer.ts`); diálogos não devolvem o foco ao abridor; `Popover` aberto não bloqueia atalhos globais. (A remontagem do canvas ao trocar de layout e as ações do projeto em três shells somem com a 5.8.)
- **Modelo**: campos desconhecidos descartados em silêncio na regravação (avisar); `crypto.randomUUID()` chamado direto em sete lugares (centralizar `newId`); `findById` por `Array.find` em vez do índice; `~25 as unknown as` em `proposalApply.ts` que os schemas zod existentes eliminariam; `platformRepos` sem ordem fixa no `serialize`.
- **Coesão**: `session.ts`, `derived.ts` (editor e revisão juntos), `batch.ts` (1202 linhas), `ReviewLevels.tsx`, `typed.ts`, `spec.ts` e `proposal.ts`.
- **MCP**: `discoverProjects` sem cache nem teto de diretórios; `internal-error` vaza caminhos absolutos; `create_project` pode sobrescrever um `mapping.json` criado no intervalo; `link()` falha em sistemas sem hardlink; actions do release não fixadas por SHA.
- **Testes**: sem limite de cobertura; `geometry.ts`, `hierarchy.ts`, `refs.ts`, `links.ts`, `specLookup.ts` sem arquivo próprio; e2e de gestos com um único teste; `ErrorBoundary` sem teste.

---

## Fechamento (fase 5.9)

### Decisões a confirmar: o que valeu

Todas as propostas da seção acima foram seguidas: `images-overlap` desloca a imagem para a direita das anteriores (mesmo `y`, com o espaço `IMAGE_GAP`); marcação sem área depois do recorte é removida; a gravação imediata vale também para o projeto local; o orçamento do `dist/index.html` é de 1,5 MB; o build id leva a data; a largura mínima é de 900 px; e o toque simples continua no desktop, sem os gestos de celular.

### Decisões consolidadas dos PRs

**Coordenação**

- A onda 2 rodou **em sequência** (5.2 e depois 5.5), não em paralelo: as duas mexiam em `flush()`, `autosave.ts` e `session.ts`. O #93 foi aberto depois do merge do #92.
- Quem mergeou os PRs foi o dono, não o coordenador (registro do coordenador; na API, o autor, o comentarista e quem mergeou aparecem como a mesma conta).
- O escopo da 5.3 foi ampliado para `mcp/projects.ts` e `docs/MCP.md`, para a lista de problemas ir no erro do MCP. O da 5.7, para uma linha do `docs/AGENT-GUIDE.md` (a de `image-too-large`: 40 MP e 16 MB em base64).

**5.1 — Autosave grava o projeto confirmado (#77)**

- `persist` e `collectFiles` leem `committed`.
- O aviso de imagens ausentes no zip vai na faixa de mensagens do editor e fica até ser dispensado.
- `buildExport` devolve `{ file, missingImages }`.

**5.3 — Projeto inconsistente: lista exata e reparo com backup (#81, mais o #91)**

- Recorte que deixa a marcação com lado menor que 8 px vira `rect-too-small`, que é recusado.
- Num ciclo de hierarquia, só as marcações do ciclo viram raiz.
- Anotação removida pelo reparo leva as que ela possui.
- O reparo roda em até 8 rodadas.
- Datas com fuso são normalizadas para UTC na leitura (também na proposta).
- Com vários pares de mesmo id, o primeiro fica com o id e os outros ganham um novo.
- O backup reusa o mecanismo da migração (`migratedFrom`); o aviso de migração não aparece quando o projeto foi reparado.
- Um zip inconsistente só vira projeto local se o reparo for aceito.
- No MCP, a lista completa vai em `reason.issues` e a mensagem resume até 20 problemas.
- O #91 estendeu a recusa de `duplicate-id` ao `addTypedAnnotation`.

**5.4 — Diagnóstico completo e identificação do build (#80)**

- O SHA vem do git, senão do `GITHUB_SHA`, senão `dev` (o `deploy.yml` faz checkouts próprios da `main` e do preview).
- O id leva a data. Efeito colateral (observado depois do PR): uma publicação da `main` em outro dia muda o id e pode mostrar "Nova versão disponível" sem mudança de código.
- "Copiar" fica ativo mesmo sem erros ("Limpar" não).
- As chaves do cabeçalho do relato são fixas e em inglês.
- Erros repetidos em sequência são agrupados numa linha, com a hora da última repetição.

**5.6 — CI, deploy e reprodutibilidade (#79)**

- `ci.yml` reutilizável, chamado pelo deploy: a `main` e o preview são validados antes de publicar.
- `data-fits` e `data-images` no canvas, para o e2e esperar o desenho.
- `react-hooks/exhaustive-deps` como erro.
- Orçamento de 1,5 MB em `INDEX_HTML_MAX_BYTES`.
- Dependabot semanal (npm e GitHub Actions, minor e patch agrupados).
- `mcp-release.yml` continua com o Node 22 fixo.

**5.7 — MCP: stdout limpo, limites de memória e versão 0.3.1 (#78)**

- `console.log`, `info` e `debug` vão para o stderr.
- Erro sem tratamento sai com o prefixo `mapping-mcp:` e `exit(1)`.
- O achado do JPEG truncado não se reproduziu; o teste guarda o caso com a dependência simulada.
- `MAX_PIXELS` caiu de 100 para 40 MP.
- O teste manual do dono achou o teto de 10 MiB do stdin do SDK: `maxBufferSize` explícito (teto do base64 mais 1 MB, ~24 MB), base64 limitado a 16 MB por imagem (o tempo de leitura do SDK cresce quadraticamente) e, acima do teto, o servidor sai com erro no stderr. Tudo no próprio #78.
- A tag `mcp-v0.3.1` fica com o dono.

**5.2 — Aplicar aceitas só conclui se o `mapping.json` gravou (#92)**

- `flush()` devolve `FlushResult` e nunca rejeita.
- `save-failed` é conservador: vale para qualquer falha, inclusive de pendência anterior.
- O `HistoryLink` da proposta ganhou o estado "abandonado".
- A limpeza pós-gravação falha sem desfazer a aplicação e fica registrada como `session.cleanup` no Diagnóstico.

**5.5 — Gravar ao sair da página e sem atraso nas operações caras (#93, mais o #95)**

- `pagehide` e as operações caras (imagens, especializações) gravam na hora.
- Importar várias imagens grava uma vez por imagem.
- Debounce de 800 para 250 ms, decisão do dono depois do teste manual do #93.
- Limitação do `beforeunload`: o diálogo é modal e pausa a página; quem escolhe ficar não perde nada, quem confirma a saída na hora pode perder a última edição.
- O diário de recuperação fica para depois do marco (ver "Fora desta etapa").
- O #95 corrigiu o comentário de `AUTOSAVE_DELAY_MS` (os campos de texto gravam ao confirmar, não a cada tecla).

**5.8 — Só desktop (#96)**

- Largura mínima de 900 px.
- O aviso esconde a tela sem desmontar nada e desliga os atalhos.
- Arrastar com o dedo num monitor de toque faz pan (opção conservadora, aceita pelo dono depois do PR).
- O "segurar e mover" saiu inteiro.
- O e2e no CI caiu de 56 para 33 s.

**5.9 — Guia do testador e fechamento** (decisões no PR da fase)

- Roteiros com códigos R0 a R8 e os passos que precisam de uma pessoa marcados **[pessoa]**.
- O passo de "Atualizar versão" da SDUI v1 para v2 (antigo roteiro da 3b) virou a conferência de "Nada a fazer", porque o exemplo já é a v2.
- Os passos do antigo roteiro da etapa 4 que não precisam de agente usam o `examples/proposta-exemplo.zip` (R4); os demais ficam em R5.

### Fora desta etapa (acrescentado no fechamento)

- O erro intermitente `InvalidStateError` do `drawImage` ("The image source is detached") logo depois de aplicar uma proposta com imagem nova, registrado no #74 (fase 4.5) e, segundo o coordenador, visto também nos testes do #92; sem efeito visível e nunca reproduzido em teste automatizado.
- O **diário de recuperação** (cópia das mudanças no armazenamento do navegador ao sair e "Recuperar alterações não gravadas" ao reabrir), a pedido do dono: entra se algum testador perder dados ao fechar a aba. Registrado nas Evoluções do [`ROADMAP`](../ROADMAP.md).
- Os PRs do Dependabot #82 a #90 (actions, o grupo minor e patch, `@types/node` 26, **TypeScript 7** e **Preact 11**), abertos e sem revisão, para depois da etapa.
