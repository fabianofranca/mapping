# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, a etapa 5: pré-voo para uso real). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código) e 4 (propostas de alteração com revisão) concluídas**; a **etapa 5 (pré-voo para uso real)** está em andamento, abaixo. As demais (marco de uso real e evoluções) estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **desktop primeiro e utilizável no celular**, com tema claro/escuro e pt-BR/en-US.

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
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual, 13.9) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 movida para Evoluções) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas, marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |

## Fases pendentes — Etapa 5: pré-voo para uso real

### Objetivo

Fechar, antes dos testes com pessoas de verdade, os buracos encontrados na avaliação de arquitetura de 2026-10-10 que causam **perda de dados silenciosa** ou deixam o testador **sem meios de relatar** o que viu. Nenhuma funcionalidade nova: cada fase corrige um caminho já existente, com teste que reproduz o problema antes da correção. A etapa termina com um guia do testador, para o marco "Uso real" do [`docs/ROADMAP.md`](docs/ROADMAP.md) começar com o relato padronizado.

Origem dos achados: revisão do código por camada (modelo, store/storage, canvas/UI, MCP e tooling), com todos os gates verdes no `main` (`ae4850f`: lint, typecheck, 2878 testes, build). O que não entrou aqui está registrado em "Fora desta etapa", no fim, para não se perder.

### Decisões

- **Só correções.** Refatorações de conforto (dividir `session.ts`, `derived.ts`, `batch.ts`, `ReviewLevels.tsx`) ficam fora: mexer em arquivo grande sem necessidade antes dos testes aumenta o risco, não o reduz.
- **Teste primeiro.** Toda fase começa com um teste que falha reproduzindo o cenário do achado, no projeto do Vitest da camada (`tests/store`, `tests/model`, `tests/mcp`…), e só então corrige. O PR cita o teste.
- **Sem mudar o formato.** Nenhuma fase altera o `mapping.json` (schema v8), o formato da proposta nem as tools do MCP; a 5.7 só muda limites e versão do servidor.
- **O que a app grava é o projeto confirmado** (`store.committed`), nunca a prévia de um gesto. Vale para o autosave e para o zip.
- **Falha de gravação é erro, não aviso**, para quem precisa saber se gravou (aplicar aceitas, fechar o projeto). O autosave por timer continua tolerante (mostra "erro ao salvar" e tenta de novo).
- **Projeto inconsistente abre reparado, com backup**, quando o reparo é mecânico e inequívoco; o resto continua recusado, mas com a lista exata do que está errado. Ler nunca grava: o backup e o arquivo reparado só são gravados pela sessão, na primeira gravação, como já acontece com a migração.

### Execução por um coordenador de agentes

Esta etapa foi desenhada para um **agente coordenador** distribuir as fases entre agentes executores. Regras:

1. **Uma fase = um branch + um PR**, nomeado `claude/etapa-5-<n>-<assunto>` (ex.: `claude/etapa-5-1-autosave-gesto`). O executor recebe só a sua fase, lê `CLAUDE.md`, esta seção inteira (Objetivo, Decisões e a fase dele) e os arquivos listados em "Toca em"; não mexe nos arquivos de outra fase da mesma onda. Se precisar, registra a dependência no PR e para.
2. **Ondas.** As fases de uma onda rodam em paralelo, cada uma a partir do `main` atual; a onda seguinte só começa com todos os PRs da anterior mergeados. O coordenador rebaseia ou mergeia o `main` em cada branch antes de abrir o PR para revisão se outro PR da onda entrou antes (conflitos esperados: só em `src/i18n/pt-BR.ts` e `en-US.ts`, por chaves novas).
   - **Onda 1:** 5.1, 5.3, 5.4, 5.6 e 5.7 (arquivos disjuntos).
   - **Onda 2:** 5.2 (depende da 5.1, mesmo `session.ts`) e 5.5 (depende da 5.1 e da 5.3, por `session.ts` e `app/controller.ts`).
   - **Onda 3:** 5.8 (depende de todas).
3. **Gates antes de abrir o PR:** `npm run lint && npm run typecheck && npm test && npm run build` (e `npm run build:mcp` na 5.7). O executor cola o resumo dos gates no PR; o coordenador confere o CI verde e o e2e antes de mergear.
4. **Descrição do PR** com as três seções do `CLAUDE.md` (Resumo, Como testar no desktop e no celular, Decisões tomadas) e os checkboxes da fase marcados neste `PLAN.md`, no mesmo PR.
5. **Decisões pequenas** o executor toma e documenta no PR; **ambiguidade** que mude comportamento visível vira pergunta no PR (seção "Decisões a confirmar", abaixo) e o coordenador decide ou escala ao dono. O coordenador consolida as decisões tomadas de volta no histórico ao fechar a etapa (5.8).
6. **O que fica com o dono** (o coordenador registra no PR e avisa): criar o ruleset da `main` (5.6), criar a tag `mcp-v0.3.1` depois do merge da 5.7, disparar o deploy de preview quando quiser ver um branch no celular.
7. **Aceite** de cada fase é o descrito nela; o coordenador não mergeia fase sem o teste que reproduz o achado.

### Fases

#### 5.1 — Autosave grava o projeto confirmado, nunca a prévia do gesto

**Achado.** `persist` lê `store.project` (`src/store/session.ts`, `const p = store.project.value`), que durante um arrasto é a prévia. Se o timer do autosave (800 ms depois da última edição) dispara no meio de um gesto e o usuário cancela com Esc, o disco fica com a geometria da prévia, a memória volta ao original sem subir a `revision` e nada reagenda: divergência silenciosa, com status "salvo". O zip (`collectFiles`) tem o mesmo problema e ainda omite imagens ausentes sem avisar.

**Toca em:** `src/store/session.ts`, `src/storage/autosave.ts` (se precisar), `tests/store/session.test.ts`, `tests/store/externalChanges.test.ts`, `src/app/controller.ts` só na exportação (aviso de imagens ausentes), `src/i18n/*`.

- [ ] Teste que reproduz: edição → `beginGesture` → timer dispara → `cancelGesture`; hoje o disco difere de `committed`
- [ ] `persist` serializa `store.committed`; se há gesto em andamento no momento da gravação, grava o confirmado (a prévia não vai para o disco em nenhum caso)
- [ ] Ao terminar um gesto (`commitGesture`), a gravação é agendada como hoje (pela `revision`); ao cancelar, nada é gravado e o disco já está igual ao confirmado
- [ ] `collectFiles` (zip) usa `committed` e devolve a lista de imagens ausentes; a exportação avisa quais faltaram (toast ou diálogo) em vez de omitir em silêncio
- [ ] Testes: gesto confirmado grava uma vez com a geometria final; zip com imagem ausente lista o arquivo

**Aceite**: os testes acima no projeto `store` do Vitest; `tests/components/editorRenders.test.tsx` continua no orçamento (a mudança não pode fazer a interface renderizar durante o gesto).

#### 5.2 — Aplicar aceitas só conclui se o `mapping.json` gravou

**Achado.** `applyAccepted` (`src/store/proposalActions.ts`, passo 3) chama `deps.flush()`, mas `AutoSaver.flush` (`src/storage/autosave.ts`) engole o erro e só muda `status` para `'error'`. Com a gravação recusada (alteração externa, quota do IndexedDB, pasta sem permissão), a proposta é gravada como `applied` e as imagens de origem em `proposals/<id>/images/` são apagadas. Se o usuário então escolhe "Recarregar" no diálogo de conflito, perde as mudanças, a proposta diz "aplicada" e as imagens ficam órfãs em `images/`. Além disso, uma falha **depois** do `saveMapping` (limpeza de imagens e `specs/`) marca "erro ao salvar" com o JSON já em disco e a próxima tentativa grava `revision + 2`.

**Toca em:** `src/storage/autosave.ts`, `src/store/session.ts`, `src/store/proposalActions.ts`, `src/store/review.ts` e `src/ui/review/*` só para mostrar o novo resultado, `tests/store/proposals.test.ts`, `tests/store/session.test.ts`, `tests/store/proposalHarness.ts`, `src/i18n/*`.

- [ ] Testes que reproduzem: `applyAccepted` com `saveMapping` lançando `ExternalChangeError` e com erro genérico de storage; hoje a proposta fica `applied` e as origens somem
- [ ] `flush()` passa a informar se gravou (devolve um resultado ou lança para quem pediu explicitamente); o caminho do timer continua como hoje
- [ ] `applyAccepted`: se o `mapping.json` não gravou, desfaz a entrada do histórico, devolve as imagens copiadas (`rollback`) e **não** grava a proposta; resultado novo (`save-failed`) com mensagem na interface; o conflito externo abre o diálogo "Projeto alterado fora da app" normalmente, e a revisão continua aberta com as decisões intactas
- [ ] Limpeza pós-gravação (`readImage`/`removeImage`/`removeSpec` depois do `saveMapping`) isolada em `try/catch` com `reportError('session.cleanup', …)`: não marca erro de gravação nem sobe a revisão de novo
- [ ] Teste: falha na limpeza pós-gravação deixa `saveStatus` em `saved`, o erro no Diagnóstico e a próxima gravação em `revision + 1`

**Aceite**: os testes acima; o roteiro da etapa 4 (`docs/history/PLAN-etapa-4.md`), passos de aplicar aceitas, continua passando com o zip de exemplo.

#### 5.3 — Projeto com dados inconsistentes: lista exata e reparo com backup

**Achado.** `deserialize` (`src/model/serialization.ts`) é tudo-ou-nada: qualquer invariante violado devolve `invariant-violation` e a interface só diz "O mapping.json tem dados inconsistentes". Um par de anotação com `id` repetido, um `rect` fora da imagem depois de uma edição à mão ou um `images-overlap` por arredondamento deixam o usuário sem acesso a todo o resto. Agrava: as operações do modelo aceitam ids explícitos sem checar colisão (`createMarking`, `addImage`, `addAnnotation`, `addLayer`; `checkEntries` só confere dentro da anotação, e o invariante exige unicidade global), então um chamador sem `validateProject` pode gravar o que o carregador recusa. `z.iso.datetime()` sem `offset: true` recusa um `createdAt` com fuso escrito por ferramenta externa.

**Toca em:** `src/model/invariants.ts`, `src/model/serialization.ts`, novo `src/model/repair.ts`, `src/model/annotations.ts`, `markings.ts`, `images.ts`, `layers.ts`, `schema.ts`, `src/storage/loadProject.ts`, `src/app/controller.ts` (fluxo de abertura), um diálogo em `src/ui/` (reaproveitar `Dialog`), `src/i18n/*`, `docs/FORMAT.md`, `tests/model/*`, `tests/app/controller.test.ts`, `tests/fixtures/`.

- [ ] Fixtures: um `mapping.json` por classe de invariante (`tests/fixtures/invalid/*.json`), gerados a partir do projeto do roteiro 13.9
- [ ] Operações do modelo recusam `duplicate-id` para `id` explícito já existente (marcação, imagem, anotação, camada) e par com `id` já usado em **outra** anotação; teste por operação
- [ ] `invariant-violation` carrega, por problema: código, entidade (`image`/`marking`/`annotation`/`layer`/`spec`), id e nome quando houver; o diálogo de erro lista tudo com "Copiar"
- [ ] `repairProject(project, issues)` puro em `src/model/repair.ts`: devolve `{ project, repaired, unrepaired }`. Reparos mecânicos: par com id duplicado → id novo; `rect-out-of-image` → recorte aos limites da imagem (marcação que ficar sem área → removida, com registro); marcação com `imageId` inexistente, anotação com `markingId`/`layerId` inexistente → removida com registro; `parentId` inexistente ou ciclo na hierarquia → marcação vira raiz da imagem; `images-overlap` → a imagem de maior índice é deslocada para a direita da caixa das anteriores. Tudo o que não está nesta lista é `unrepaired`
- [ ] Fluxo de abertura: com `unrepaired` vazio, o diálogo oferece **Reparar e abrir** (além de Fechar); ao aceitar, a sessão agenda o backup do original (`backups/`, mesmo mecanismo da migração) e grava o reparado na primeira gravação; o resumo do reparo entra no Diagnóstico e num aviso. Com `unrepaired`, só a lista e Fechar
- [ ] `z.iso.datetime({ offset: true })` em `schema.ts` (e no formato da proposta); ao serializar, datas com fuso são normalizadas para UTC `Z`; teste de round-trip para as duas formas
- [ ] MCP: `loadProject` continua recusando (ler nunca grava), mas a resposta traz a mesma lista de problemas; `docs/MCP.md` cita
- [ ] `docs/FORMAT.md`: seção "Arquivos inconsistentes" (o que a app repara, o que recusa, onde fica o backup)

**Aceite**: cada fixture inválida abre reparada ou é recusada com a lista; o backup existe na pasta depois da primeira gravação; o projeto do roteiro 13.9 íntegro abre sem passar pelo reparo; `tests/model/performance.test.ts` continua no orçamento (`validateProject` não pode ficar mais lento no caminho feliz).

#### 5.4 — Diagnóstico completo e identificação do build

**Achado.** Só o `ErrorBoundary` e chamadas explícitas a `reportError` chegam ao Diagnóstico: não há `window.onerror` nem `unhandledrejection`, então promessas soltas em handlers somem. Não há identificação do build visível (a barra mostra schema e canal; `package.json` é `0.0.0`), e o "Copiar" do Diagnóstico exporta só os erros, sem build, canal, navegador ou tipo de armazenamento. Como não há telemetria por desenho (CSP), isso é a única forma de um testador relatar um bug de modo útil.

**Toca em:** `src/main.tsx`, `src/utils/report.ts`, `vite.config.ts` (`define`), `src/utils/channel.ts` ou novo `src/utils/build.ts`, `src/ui/StatusBar.tsx`, `src/ui/SettingsDialog.tsx` (ou Ajuda), `src/ui/DiagnosticsView.tsx`, `src/i18n/*`, `README.md`, `tests/utils/*`, `tests/components/*`, `tests/e2e/*`.

- [ ] `window.addEventListener('error')` e `('unhandledrejection')` em `main.tsx` chamando `reportError('window', …)`; erros repetidos em sequência agrupados (contador), para um laço não lotar os 20 lugares; sem violar a CSP
- [ ] Build id injetado no build por `define` (`__BUILD_ID__`): SHA curto do commit (`GITHUB_SHA` no CI; `git rev-parse --short HEAD` localmente; `dev` sem git) mais a data do build; disponível como constante tipada em `src/utils/`
- [ ] Build id, canal e schema na barra de status (desktop) e numa seção "Sobre" em Configurações (desktop e celular), com "Copiar"
- [ ] "Copiar" do Diagnóstico gera um cabeçalho antes dos erros: build, canal, schema, tipo de armazenamento (pasta/local), `navigator.userAgent`, tamanho da janela, idioma, tema, contagens de imagens/marcações/anotações (sem nomes nem caminhos: privacidade), e indica se há gravação pendente
- [ ] `README.md`: seção "Como relatar um problema" (onde fica o Diagnóstico, o que copiar, onde abrir a issue)
- [ ] Testes: promessa rejeitada solta aparece no Diagnóstico; texto copiado tem o cabeçalho; e2e confere que o build id aparece na barra e no "Sobre" (desktop e celular)

**Aceite**: os testes acima; `tests/theme/tokenLiterals.test.ts` e o teste de chaves de i18n continuam verdes; o build do preview mostra `prévia` e o id.

#### 5.5 — Gravar ao sair da página e sem atraso nas operações caras

**Achado.** `bindPageLifecycle` (`src/app/controller.ts`) dispara `flush()` no `beforeunload`, mas a escrita por File System Access é assíncrona e morre com a aba se o usuário confirma a saída; `pagehide` não é tratado (iOS Safari não dispara `beforeunload`). O debounce de 800 ms amplia a janela, e operações caras (adicionar, trocar ou remover imagem; aplicar, atualizar ou remover especialização) ficam o mesmo tempo só em memória.

**Toca em:** `src/app/controller.ts`, `src/store/session.ts`, `src/storage/autosave.ts`, `src/app/useImageIntake.tsx` (só se a gravação imediata for disparada ali), `tests/app/controller.test.ts`, `tests/store/session.test.ts`.

- [ ] Teste que reproduz: alteração → `pagehide` → nada é gravado até o timer
- [ ] `pagehide` e `visibilitychange: hidden` chamam `flush()` imediato (sem debounce); `beforeunload` continua pedindo confirmação se há pendência
- [ ] Operações caras gravam sem debounce: a sessão chama `flush()` logo depois de adicionar/trocar/remover imagem e de aplicar/atualizar/remover especialização (e o aplicar aceitas, que já grava)
- [ ] O debounce de 800 ms das edições comuns fica como está; o motivo (não gravar a cada tecla no nome) vai para o comentário de `AUTOSAVE_DELAY_MS`
- [ ] Testes: `pagehide` grava; adicionar imagem grava sem esperar o timer; duas operações caras seguidas não gravam em paralelo (fila única do autosave)

**Aceite**: os testes acima; `tests/e2e/folder.spec.ts` continua verde (a gravação imediata não pode disputar com a leitura do `mapping.json` que o teste faz).

#### 5.6 — CI, deploy e reprodutibilidade

**Achado.** `deploy.yml` não roda `typecheck`, `build:mcp` nem e2e antes de publicar; como os merges são pelo celular, um PR com CI vermelho pode ir para produção se nada bloquear o merge. O Playwright tem `retries: 0` e `addImage` espera `waitForTimeout(500)`; o Node não está fixado no repositório; Konva fora de `src/canvas/` não é imposto por lint; não há Dependabot nem orçamento de tamanho do `dist/index.html`.

**Toca em:** `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, novo `.github/dependabot.yml`, `playwright.config.ts`, `tests/e2e/helpers.ts` (e onde o canvas sinaliza que enquadrou), `.nvmrc`, `package.json` (`engines`), `eslint.config.js`, `README.md`.

- [ ] `deploy.yml` roda tudo que o `ci.yml` roda (`typecheck`, `test:coverage` ou `test`, `test:perf`, `build`, `build:mcp` e o job e2e) antes de `upload-pages-artifact`, para a versão principal e para o preview; de preferência um workflow reutilizável (`workflow_call`) para os dois não divergirem de novo
- [ ] Playwright: `retries: process.env.CI ? 1 : 0`; `addImage` espera uma condição observável (ex.: atributo no canvas quando o enquadramento termina, ou a pílula de zoom estável) em vez de 500 ms fixos; `trace` só na repetição
- [ ] `.nvmrc` com `22`, `"engines": { "node": ">=22" }` e `setup-node` lendo `node-version-file`
- [ ] ESLint: `konva` proibido em `src/{ui,app,store,storage,i18n,theme,utils}/**` (exceção `src/canvas/CanvasHost.tsx` já está dentro de `canvas/`); `react-hooks/exhaustive-deps` como erro ou `eslint --max-warnings 0`
- [ ] `.github/dependabot.yml`: npm e github-actions, semanal, agrupado (minor/patch juntos), para o dono aprovar pelo celular
- [ ] Orçamento do `dist/index.html` no CI (falha acima de 1,5 MB; hoje 1,0 MB) e o tamanho no resumo do job
- [ ] Instruções para o dono, no PR: ruleset na `main` exigindo os checks `check` e `e2e` e PR obrigatório

**Aceite**: `workflow_dispatch` do deploy num preview deste branch termina verde com todos os passos; um PR de teste com e2e quebrado fica vermelho no deploy do preview.

#### 5.7 — MCP: stdout limpo, limites de memória e versão 0.3.1

**Achado.** O código Emscripten dos codecs `@jsquash` define `Module["print"] || console.log`: um aviso da libjpeg/libwebp (JPEG truncado ou corrompido) vai para o **stdout**, que é o canal do protocolo, e corrompe a sessão MCP. Não há `unhandledRejection`/`uncaughtException` com o prefixo `mapping-mcp:`. O teto de 100 megapixels permite pico de memória acima de 1 GB (heap WASM + RGBA + cópia da orientação + `Float32Array` da redução). O `base64` das operações não tem `.max()` no schema e é decodificado antes de qualquer checagem. `ModelError` só é tratado em `get_code_hints`.

**Toca em:** `mcp/main.ts`, `mcp/image/codecs.ts`, `mcp/image/formats.ts`, `mcp/operations.ts`, `mcp/batch.ts` (só a checagem de tamanho), `mcp/tools.ts` (`failure()`), `mcp/version.ts`, `docs/MCP.md`, `tests/mcp/*`.

- [ ] Teste que reproduz: `get_image_file` sobre um JPEG truncado, pelo bundle por stdio; hoje algo além de JSON-RPC pode sair no stdout (o teste lê o stdout bruto e exige só mensagens válidas)
- [ ] `console.log/info/debug` redirecionados para `stderr` antes de `server.connect` (ou `print`/`printErr` passados aos módulos Emscripten); `console.error/warn` já vão para o stderr
- [ ] `process.on('unhandledRejection')` e `('uncaughtException')`: linha no stderr com o prefixo e `exit(1)`
- [ ] `MAX_PIXELS` para 40 megapixels; `base64` com `.max()` no schema (coerente com `MAX_FILE_BYTES`) e checagem do tamanho antes de `Buffer.from`
- [ ] `ModelError` tratado em `failure()` para todas as tools (hoje vira `internal-error` com stack no stderr)
- [ ] `SERVER_VERSION` 0.3.1; `docs/MCP.md`: limites atualizados e a tag `mcp-v0.3.1` (o dono cria após o merge)

**Aceite**: `tests/mcp/images.test.ts` e `read.test.ts` continuam verdes; o teste novo de stdout passa; `npm run build:mcp` gera o bundle e o `--version` imprime `0.3.1`.

#### 5.8 — Guia do testador e fechamento

**Achado.** Os roteiros de teste manual existem (13.9 em `docs/history/PLAN-etapas-1-2.md`, 3b e etapa 4 nos históricos), mas estão espalhados, escritos para quem conhece o projeto, e não há um lugar que diga ao testador onde pegar a app, o que o navegador precisa, como instalar o MCP e como relatar. O marco "Uso real" pede um registro (telas mapeadas, devs, telas implementadas por agentes, o que atrapalhou) e não há template.

**Toca em:** novo `docs/TESTING.md`, `README.md`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`, novo `docs/history/PLAN-etapa-5.md`.

- [ ] `docs/TESTING.md`: onde pegar a app (GitHub Pages, `/preview/`, `index.html` avulso do artefato) e o que cada uma implica (pasta só em Chrome/Edge desktop; projeto local nos demais; PWA só em `https:`); requisitos; instalar o `mapping-mcp.js` da Release num repositório (resumo do `docs/MCP.md`); como relatar (Diagnóstico com cabeçalho, da 5.4)
- [ ] Roteiros consolidados em `docs/TESTING.md`, reescritos como **ação → resultado esperado observável** (o que aparece na tela, o que fica no disco), numerados, para serem executados tanto por uma pessoa quanto por um agente com controle do computador (Cowork), que confere cada resultado por captura de tela ou pelo arquivo. Fontes: 13.9, roteiro da 3b e roteiro da etapa 4, sem perder passos; os históricos passam a apontar para o novo arquivo
- [ ] Template de registro do marco "Uso real" em `docs/TESTING.md`: telas mapeadas, devs que consultaram, telas implementadas por agentes a partir da ferramenta, lista do que atrapalhou (com build id e data em cada item)
- [ ] `README.md` aponta para `docs/TESTING.md`
- [ ] Fechamento: esta seção vai para `docs/history/PLAN-etapa-5.md` (com as decisões consolidadas dos PRs), `PLAN.md` volta a "nenhuma etapa em andamento", `docs/ROADMAP.md` marca a etapa 5 concluída e `CLAUDE.md` atualiza "Etapa atual"

**Aceite**: um agente sem contexto do projeto consegue, só com `docs/TESTING.md`, abrir a app publicada, seguir o roteiro 13.9 e produzir um relato no formato do template (o coordenador executa este aceite com um agente novo e cola o relato no PR).

### Decisões a confirmar

1. Reparo de `images-overlap`: deslocar a imagem de maior índice para a direita da caixa das anteriores (alternativa: recusar e listar). Proposto: deslocar.
2. Marcação cujo `rect` recortado fica sem área (fora da imagem por inteiro): remover com registro (alternativa: manter com 1×1 px). Proposto: remover.
3. Gravação imediata nas operações caras vale também para o projeto local (IndexedDB), não só para a pasta. Proposto: sim, o custo é o mesmo.
4. Orçamento do `dist/index.html`: 1,5 MB. Proposto: sim, com o valor num só lugar no workflow.
5. Build id com data do build além do SHA. Proposto: sim (`abc1234 · 2026-10-10`), porque o `index.html` avulso circula sem o repositório.

### Fora desta etapa (registrado para depois do marco)

Achados da mesma revisão que não causam perda de dados nem impedem o relato, e por isso ficam para as Evoluções ou para a próxima revisão técnica:

- **Concorrência real** entre duas abas na mesma pasta, ou app e MCP gravando ao mesmo tempo: janela de corrida entre a conferência e o `close()`; para abas da mesma origem, `navigator.locks`; para o MCP, documentar como limitação. O `updateStored` do MCP (`proposalStore.ts`) tem a mesma janela antes do `rename`.
- **Canvas**: ponteiro "fantasma" trava o modo pinça se um `pointerup` se perde (sem `lostpointercapture`/`blur` em `pointer.ts`); diálogos não devolvem o foco ao abridor; trocar desktop↔celular remonta o canvas e perde o viewport; `Popover` aberto não bloqueia atalhos globais; ações do projeto definidas em três shells.
- **Modelo**: campos desconhecidos descartados em silêncio na regravação (avisar); `crypto.randomUUID()` chamado direto em sete lugares (centralizar `newId`); `findById` por `Array.find` em vez do índice; `~25 as unknown as` em `proposalApply.ts` que os schemas zod existentes eliminariam; `platformRepos` sem ordem fixa no `serialize`.
- **Coesão**: `session.ts`, `derived.ts` (editor e revisão juntos), `batch.ts` (1202 linhas), `ReviewLevels.tsx`, `typed.ts`, `spec.ts` e `proposal.ts`.
- **MCP**: `discoverProjects` sem cache nem teto de diretórios; `internal-error` vaza caminhos absolutos; `create_project` pode sobrescrever um `mapping.json` criado no intervalo; `link()` falha em sistemas sem hardlink; actions do release não fixadas por SHA.
- **Testes**: sem limite de cobertura; `geometry.ts`, `hierarchy.ts`, `refs.ts`, `links.ts`, `specLookup.ts` sem arquivo próprio; e2e de gestos com um único teste; `ErrorBoundary` sem teste.
