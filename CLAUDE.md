# CLAUDE.md

## Projeto

Mapping: app web para marcar áreas retangulares em imagens, organizar em camadas e anotar com pares chave-valor, salvando tudo num `mapping.json` ao lado das imagens.

**Antes de qualquer tarefa de uma etapa, leia a issue dela no GitHub** (rótulo `ready` ou `in-progress`, com as sub-issues de fase e os comentários; ver "Planejamento nas issues" no Fluxo de trabalho). Trabalhe **uma fase por vez**, na ordem, e marque os checkboxes concluídos na sub-issue da fase. A referência atual está em `docs/` (`ARCHITECTURE.md`, `FORMAT.md`, `SPEC-FORMAT.md`, `MCP.md`, `AGENT-GUIDE.md`, `DESIGN-SYSTEM.md`); o plano das etapas concluídas está nas issues fechadas com o rótulo `in-progress` (o que veio antes delas está no histórico do git). Os roteiros de teste manual e o template do relato estão em `docs/TESTING.md`; o prompt do testador da nuvem (sessão do Claude Code sem o dono), em `docs/TESTING-NUVEM.md`.

Skills do Claude Code ficam em `.claude/skills/`: **`spec-author`** escreve e valida especializações (`docs/SPEC-FORMAT.md`); o prompt que a invoca só especifica a origem, o `id`, a `formatVersion` e as plataformas (modelo no fim da própria skill). Para usá-la no repositório do código que está sendo mapeado, copie a pasta para o `.claude/skills/` dele ou para `~/.claude/skills/`. `examples/workspace/` é o esqueleto de uma pasta central de mapeamentos (servidor, raízes, skill e `AGENTS.md` para qualquer cliente MCP). O que cada exemplo mostra e como abri-lo está em `examples/README.md`. O **guia interativo** (`public/guia/`, gerado) e o **projeto de exemplo** (`examples/exemplo-completo/` e o zip) saem de uma fonte só; ver `docs/GUIDE.md`. `viewer/` é o visualizador embutível (pacote `mapping-viewer`), com a demonstração em React em `viewer/demo/`; estrutura e comandos em `viewer/README.md`.

## Stack

- Vite + TypeScript (strict) + Preact + @preact/signals
- Konva.js (canvas), JSZip (zip), zod (validação do schema), idb (IndexedDB)
- vite-plugin-singlefile: o build gera **um único `dist/index.html`** autocontido
- Vitest para testes
- Deploy: GitHub Pages via GitHub Actions

## Comandos

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # gera dist/index.html
npm test          # vitest (modelo, store, storage, canvas e componentes)
npm run test:coverage # vitest com relatório de cobertura (coverage/); pula os orçamentos de desempenho
npm run test:perf # só os orçamentos de desempenho (sem cobertura; o CI roda separado)
npm run test:e2e  # Playwright contra dist/index.html; roda no CI (localmente: npm run build e PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome>)
npm run build:mcp # gera dist-mcp/mapping-mcp.js (servidor MCP, etapa 3a)
npm run dev:viewer # demonstração do visualizador embutível num hospedeiro React (viewer/demo)
npm run build:viewer # gera dist-viewer/ (mapping-viewer.js, mapping-viewer-react.js e types/)
npm run build:example # gera examples/exemplo-completo.zip e materializa examples/exemplo-completo/specs/ das fontes (zip conferido por teste)
npm run build:guia # gera public/guia/index.html (o guia interativo; o `npm run build` já roda; conferido por teste)
npm run lint      # eslint + prettier --check
npm run typecheck # tsc --noEmit (app e mcp/)
```

Antes de finalizar qualquer tarefa: `npm run lint && npm run typecheck && npm test && npm run build` precisam passar.

## Regras de arquitetura

- `src/model/` contém só funções puras e imutáveis, sem DOM. Toda regra de negócio fica aqui e é testada.
- **`src/model/` não pode depender de APIs de navegador** (DOM, `window`, `document`, IndexedDB, File System Access, `createImageBitmap`, `Image`, canvas, `localStorage`). Ele será reutilizado por um servidor MCP em Node na etapa 3. Use apenas APIs disponíveis tanto no navegador quanto no Node (ex: `crypto.randomUUID()`). Tudo que depende de navegador (leitura de dimensões da imagem, EXIF, bitmaps) fica em `src/storage/` ou `src/canvas/` e entrega dados já prontos ao `model/`. A regra é imposta automaticamente: ESLint (`no-restricted-globals`/`no-restricted-imports` em `src/model/**`) e o projeto `model` do Vitest, que roda `tests/model/` com `environment: 'node'`.
- Toda mutação do projeto passa por uma action do store. Nunca altere o estado diretamente num componente.
- O estado do projeto (JSON + undo) é separado do estado da UI (seleção, visibilidade, modo, viewport).
- Consultas por id e agrupamentos do projeto usam `projectIndex(p)` (`src/model/projectIndex.ts`, memoizado por versão do projeto), nunca `find`/`filter` dentro de laços. O estado derivado do editor (camadas visíveis, indicadores, visibilidade, pendências, lista) fica em `src/store/derived.ts` e é lido por canvas, painel e lista, sem recalcular.
- **Espaços, pertencimento e setas:** a marcação vive no espaço do container (pixels dele) ou no do canvas (`containerId` nulo); quem contém quem é decidido só pela geometria, por `settleHierarchy` (`src/model/hierarchySettle.ts`), no fim de toda operação do modelo que muda geometria (as prévias de gesto usam `settle: false`; o gesto termina repetindo a operação com `settle: true`, numa entrada de desfazer). Nunca se escolhe o pai à mão nem se calcula interseção fora do modelo. A seta (`arrows`) é uma marcação que aponta, fora da árvore de pertencimento; a flutuante (`floating`) também.
- O `mapping.json` só é gravado pela sessão (`src/store/session.ts`): ela confere o arquivo (`revision` e conteúdo) antes de gravar e grava `revision + 1`; nenhum outro código escreve no armazenamento do projeto. Alterações externas (MCP, editor de texto) viram recarga ou o diálogo "Projeto alterado fora da app" (`docs/ARCHITECTURE.md`).
- O canvas desenha no máximo uma vez por quadro (`requestAnimationFrame`); pan e zoom não recalculam dados que dependem só do projeto.
- Um gesto (arrastar/redimensionar) gera **uma** entrada no histórico de undo.
- Konva fica isolado em `src/canvas/` (`CanvasController` imperativo). Componentes Preact não importam Konva, exceto `CanvasHost`. Não usar `react-konva`.
- As coordenadas das marcações são **sempre** em pixels da imagem original. Conversões de tela/canvas ficam só em `src/canvas/`.
- Nenhuma string de UI hardcoded: tudo via `t()` com chaves em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts`.
- Nenhum valor de design fixo (cor, espaço, raio, fonte, opacidade, duração, z-index) fora dos tokens: use `var(--…)` dos tokens de `src/theme/tokens.ts` (fonte única, temas claro e escuro). Borda de controle usa `--color-border-control`; `--color-border` é só divisória. O canvas lê os tokens do tema. Um teste (`tests/theme/tokenLiterals.test.ts`) procura literais no CSS.
- Controles de formulário e botões vêm de `src/ui/controls/` (`Button`, `IconButton`, `TextField`, `Select`, `Choice`, `Segmented`, `Tabs`, `Tooltip`) e ícones de `<Icon name="…" />` (`src/ui/icons.tsx`); não crie botão, campo ou ícone avulso. Altura, raio e ícone vêm dos papéis `--control-*` (28px/16px).

## Restrições do ambiente de execução

- O `index.html` precisa funcionar em **`file://` no Chrome/Edge desktop** e hospedado no **GitHub Pages**:
  - nada de import de módulos externos em runtime nem requisições de rede;
  - o service worker só é registrado quando `location.protocol === 'https:'`;
  - detecte os recursos em runtime (`showDirectoryPicker`, IndexedDB, `navigator.canShare`) e degrade com elegância;
  - o `dist/index.html` leva uma **CSP** em `<meta>` gerada no build (`pwa/csp.ts`; hashes dos blocos embutidos, sem `'unsafe-inline'`/`'unsafe-eval'`, `connect-src 'none'`). Por isso: sem `style=""` nem handlers inline no HTML, sem `eval`/`new Function`, sem `setAttribute('style')`, sem `fetch`/XHR/WebSocket (estilo dinâmico só por JS: `el.style.x`, objeto `style` do Preact). A CSP da app também libera `https:`/`http:` no `img-src` e exige Trusted Types: nada de `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`dangerouslySetInnerHTML` com conteúdo nem `script.src` (monte o DOM por JSX ou `textContent`), e imagem por URL só pelo carregador de `src/canvas/components/` (ou `src/storage/` para `blob:`; regra de lint). O guia e a demonstração do visualizador usam o perfil `static` (sem imagem remota nem Trusted Types). Não escreva a CSP à mão no `index.html`. Detalhes em `docs/ARCHITECTURE.md`.
- **Só desktop**: largura mínima de 900 px (token `size-app-min`), mouse e teclado; toque simples funciona (clicar, arrastar, rolar e a pinça), gestos de celular não. Abaixo de 900 px a app mostra o aviso "Abra numa janela maior" no lugar da tela, sem desmontar nada (o projeto continua aberto e gravando). Não há layout de celular (decisão da fase 5.8).
- Envolva todo acesso a `localStorage`/IndexedDB em try/catch.

## Código

- Identificadores e nomes de arquivos em inglês. Comentários e documentação podem ser em português.
- TypeScript strict, sem `any` (use `unknown` + validação).
- Componentes pequenos e funcionais; lógica fora dos componentes.
- Não adicione dependências além da stack acima sem justificar no PR.
- **Complexidade por função:** função nova ou alterada fica com complexidade ciclomática até 10 (`complexity` do ESLint, erro em `src/**` e `mcp/**`); o legado acima disso está em `eslint-suppressions.json`, onde a contagem por arquivo só pode cair.
  - Quem reduz uma função suprimida abaixo do limite roda `npx eslint --prune-suppressions` no mesmo PR (sem isso o `lint` falha por supressão sem uso).
  - Não se usa `eslint-disable` para `complexity`: a exceção fica no arquivo de supressões, visível no diff.
  - Função já suprimida que a fase precisou tocar não exige redução (basta não criar outra acima do limite no mesmo arquivo); a dívida grande vira issue `roadmap`, não refatoração no meio da fase.

## Fluxo de trabalho

- O dono do projeto usa o Claude Code **pelo celular** e não roda nada localmente.
- **Início de sessão:** a sessão trabalha direto na pasta do repositório (sem worktree, salvo pedido do dono), no branch que estiver em uso. Antes de qualquer tarefa nova, vá para a `main` atualizada (`git switch main && git pull --ff-only`) e crie dali o branch do épico; se houver alteração não commitada ou o branch em uso não estiver mesclado, pergunte ao dono antes de trocar.
- **Planejamento nas issues** (decisão do dono de 2026-11-02): roadmap e planos de etapa vivem em issues do `fabianofranca/mapping`, nunca em arquivo do repositório. Nenhum PR existe só para mexer em plano.
  - **Rótulos:** `roadmap` é ideia, melhoria, migração ou pendência ainda sem plano (a ordem é do dono, no Project "Mapping - Backlog"); `bug` é defeito: comportamento que contradiz a especificação ou os docs (inclusive `docs/TESTING.md`), falha de acessibilidade, teste instável, ou texto de doc ou roteiro que não bate com a app; `ready` é a issue da etapa já detalhada (plano, decisões, sub-issues `step` e tabela de modelos), pronta para desenvolver; `in-progress` é a da etapa cujo épico já começou (fechada, continua com ele e vira o histórico); `step` é a sub-issue de uma fase da etapa. Uma issue nova é `roadmap` **ou** `bug`, nunca as duas. `bug` é **tipo**, não estado: fica na issue até ela fechar, também quando ela vira `ready` e `in-progress`. O ciclo é `roadmap` ou `bug` → `ready` → `in-progress`. Não implementar nada antes de a issue da etapa estar `ready` (ou `in-progress`, ao retomar).
  - **Detalhar uma etapa:** a issue `roadmap` ou `bug` vira a issue da etapa (troca `roadmap` por `ready`; o `bug` fica; ou a nova issue `ready` cita e fecha a `roadmap` ou `bug` como duplicada). O corpo dela traz objetivo, o que fica fora, as decisões numeradas, o épico (`epic/<nome>`), as versões (schema, formatos, MCP) e a tabela de modelos e esforço (linha **Orquestrador**, uma linha por fase e coluna Testador; ver "Fluxo automatizado"). Cada fase é uma sub-issue `step`, criada com `parent_issue_number`, com a linha dela da tabela, o **Toca em:**, os checkboxes e o aceite.
  - **Durante a etapa:** o PR de cada fase começa com "Parte de #<sub-issue>" (PR para o épico não fecha issue sozinho); o agente da fase marca os checkboxes na sub-issue e a fecha (`completed`) depois do merge no épico. Decisão que muda o plano é editada no corpo da issue e registrada num comentário com o porquê. O PR do épico para a `main` leva "Closes #<issue da etapa>".
  - **Fechamento:** a issue da etapa fechada é o histórico. O fechamento comenta nela as decisões consolidadas dos PRs, os relatos de teste (comentários nas sub-issues das fases) e o que ficou para depois; cada item que ficou para depois vira uma issue `roadmap` (ou `bug`, se for defeito, com a evidência).
  - **Project:** as ferramentas do agente não alcançam o Project "Mapping - Backlog"; a issue nova entra nele pelo fluxo de auto-add do Project ou pelo dono. Todo texto que o agente escreve no GitHub termina com o rodapé de atribuição.
- **Bugs e evidência visual:** defeito é issue `bug`, nunca `roadmap`; a imagem que o mostra vai no branch órfão `evidencias`, porque a API do GitHub não anexa imagem a issue.
  - **Corpo do bug:** o que acontece; o que era esperado e de onde vem (passo do `docs/TESTING.md`, doc, spec); passos para reproduzir; branch e commit; origem (link do relato ou do PR); severidade da escala do `docs/TESTING.md`, quando vier de teste.
  - **Evidência, quando der:** defeito visível na tela leva captura PNG recortada na área do problema (Playwright `page.screenshot({ clip })` ou `import -window root` + `convert -crop`), sem dado pessoal nem segredo. Defeito que não se vê (teste instável, acessibilidade lida pelo DOM) leva a saída do teste ou o trecho do DOM num bloco de código, no lugar da imagem.
  - **Procedimento:** cria-se a issue primeiro, para ter o número. O caminho da imagem é `<issue>/<nome>.png`, onde `<issue>` é o número da issue (ou sub-issue) em que ela aparece primeiro.

    ```bash
    git fetch origin evidencias
    git worktree add <scratchpad>/evidencias origin/evidencias  # o worktree é a exceção do "Início de sessão"
    cd <scratchpad>/evidencias && git switch -c evidencias-<issue>
    mkdir -p <issue> && cp <captura>.png <issue>/<nome>.png
    git add <issue> && git commit -m "Evidência de #<issue>: <nome>"
    git push -u origin HEAD:evidencias
    ```

    Depois edita-se o corpo da issue com `![descrição curta](https://github.com/fabianofranca/mapping/blob/evidencias/<issue>/<nome>.png?raw=true)` e remove-se o worktree (`git worktree remove`). Push recusado porque o branch andou: `git pull --rebase origin evidencias` e push de novo (os commits ainda são só seus; nunca push forçado).
  - **Sem push:** se não for possível (permissão, rede), a issue descreve em texto o que a captura mostra, diz que ela foi enviada no chat da sessão e o arquivo vai para o chat (`SendUserFile`).
  - **O `evidencias`** só recebe imagens, num commit por issue; nunca vira PR nem é mesclado; não se apaga imagem de issue fechada (ela é o histórico).
- **Tudo chega à `main` por um épico.** Cada etapa (ou frente que só deve chegar à `main` depois de validada inteira) é um branch `epic/<nome>` com um PR para a `main`, aberto até o fim. Cada fase, ou parte de fase, é um branch curto e um PR **com base no branch do épico**, com a descrição de sempre; mesclado, ele some e o épico avança. A descrição do PR do épico não é reescrita a cada parte: ela é fechada uma vez, quando o dono decidir mesclar. A `main` entra no épico por merge (nunca rebase nem force-push) quando houver conflito ou algo de que o épico precise. Uma etapa pequena ainda é um épico, com uma só parte. Os épicos abertos são os PRs de `epic/*` para a `main`.
- **Changelog por épico:** toda entrega de `epic/*` para a `main` atualiza o `CHANGELOG.md` (raiz, pt-BR, formato Keep a Changelog) no próprio PR do épico: uma seção nova no topo com o nome da etapa, a data, o PR, a versão do MCP e o schema, e os bullets Adicionado/Alterado/Corrigido voltados a quem usa a app e o MCP. Durante o épico a seção fica como `[Não lançado]`; ao fechar a descrição do PR, ela ganha a data do merge. O job `epic` do `ci.yml` falha se o PR de `epic/*` para a `main` não alterar o `CHANGELOG.md`.
- **Design system por épico:** o design system do projeto é o artefato **Mapping** do Claude Design, curado à mão e fora do repositório; o registro dele aqui é [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) (URL, mapa componente → origem no código, gatilhos, pendências e histórico de sincronização). Toda fase declara o **Impacto no DS** na descrição do PR e, quando há impacto, registra a pendência nesse arquivo no mesmo PR. O **fechamento de todo épico** aplica as pendências no artefato, esvazia a lista e acrescenta uma entrada ao histórico — é a única hora em que se grava no DS, porque pessoas o editam ao vivo e o índice precisa ser lido imediatamente antes de cada gravação. O job `epic` do `ci.yml` falha se o PR de `epic/*` para a `main` não alterar o `docs/DESIGN-SYSTEM.md`. A skill `/design-sync` **não se aplica** a este DS: ela espera o `dist/` de uma biblioteca de componentes publicada e transformaria o DS curado num espelho do build.
- **A `main` só aceita PR de `epic/*`:** o job `epic` do `ci.yml` falha para qualquer outra origem (menos `dependabot/*`) e é check obrigatório no ruleset "main protegida". O CI roda igual em PRs para o épico e em push no branch dele; todo PR aberto ou atualizado publica o branch dele no preview (`/preview/`) sozinho (`preview-on-pr.yml` dispara o Deploy), e há um preview só, o do último PR atualizado; o `workflow_dispatch` do Deploy continua para publicar outro branch.
- **Versão do MCP por épico** (`mcp/version.ts`, uma só por épico; a de cada épico está no `CHANGELOG.md`): cada PR com base num `epic/**` gera um snapshot (`mcp-snapshot-pr<N>`, apagado quando o PR fecha) para testar antes de entrar; a release candidate (`mcp-v<versão>-rc.<n>`) sai só no merge do PR com o rótulo `mcp-rc`, o da última fase do épico (o agente dessa fase põe o rótulo ao abrir o PR); se esquecerem, rodar à mão o workflow MCP pre-release (`workflow_dispatch`) no `epic/**` cobre; a estável `mcp-v<versão>` é tag do dono depois do merge do épico na `main` e apaga as rc (`.github/workflows/mcp-prerelease.yml`, `docs/MCP.md`).
- **Fluxo automatizado** (decisão do dono de 2026-11-02, etapa #301; mensagens prontas em [`docs/FLOW.md`](docs/FLOW.md)). Três chats, e cada um é um assunto:
  1. **Roadmap:** o agente cria uma issue curta `roadmap` ou `bug` (problema ou ideia, origem, o que se sabe), sem fases nem plano; o `bug` segue "Bugs e evidência visual".
  2. **Detalhamento** (Fable/Opus): a `roadmap` ou `bug` vira `ready` como em "Detalhar uma etapa", com as sub-issues `step` e a tabela de modelos (linha **Orquestrador** e coluna Testador). Decisão de produto é perguntada ao dono nesse chat.
  3. **Implementação:** o dono abre o chat no modelo da linha Orquestrador (padrão Sonnet), no modo **Auto**, e pede a etapa. O **orquestrador**:
     - lê a issue da etapa (que precisa estar `ready`), troca `ready` por `in-progress`, cria o `epic/<nome>` da `main` atualizada e abre o PR do épico para a `main` assim que houver diferença;
     - para cada fase, na ordem, cria uma sessão filha (`create_session` com o `model` da tabela, `source_url` do repositório e `source_revision` no épico; nunca `permission_mode: plan`) com a mensagem da fase, que termina com "Coordenador: `<id do orquestrador>`"; agenda uma conferência de reserva (`send_later`, 30 a 60 min) e só passa à fase seguinte depois do aviso da anterior;
     - depois da última fase, acha o ambiente "Mapping - testes" (`list_environments`) e cria a sessão do testador com os roteiros listados na sub-issue da última fase;
     - **com ❌** no relato, abre **uma** fase de correção com os achados (sessão filha, PR, merge) e retesta só os roteiros que falharam. Chama o dono se falhar de novo, se o achado for de perda de dados, integridade do `mapping.json` ou segurança, ou se a correção pedir decisão de produto;
     - **sem ❌**, faz o fechamento: data no `CHANGELOG.md`, pendências do DS aplicadas no artefato e histórico em `docs/DESIGN-SYSTEM.md`, descrição final do PR do épico com "Closes #<etapa>", comentário de fechamento na issue da etapa e uma issue `roadmap` (ou `bug`) para cada item que ficou para depois;
     - notifica o dono no celular (`PushNotification`) com o resumo e o link do PR do épico, e mescla o épico na `main` **só depois de o dono responder "pode mesclar" no chat**. Se o ruleset "main protegida" exigir uma aprovação que o agente não pode dar, o dono aperta o botão. A tag estável do MCP continua do dono.
  - **A sessão da fase** implementa com os subagentes e o esforço da sub-issue, roda os gates, abre o PR para o épico ("Parte de #N"), acompanha o CI (`subscribe_pr_activity`) e, com o CI verde, **mescla o próprio PR no épico**. Depois marca os checkboxes, fecha a sub-issue e avisa o orquestrador por `send_message` (uma sessão que termina bem não avisa sozinha). Se travar numa decisão de produto, avisa o orquestrador, que chama o dono.
  - **O testador** ([`docs/TESTING-NUVEM.md`](docs/TESTING-NUVEM.md)) compila a app e o MCP do commit (nada de preview), posta o relato como **comentário na sub-issue** indicada (em partes, se passar de 65 mil caracteres; não há PR de relato nem arquivo no repositório) e avisa o orquestrador por `send_message` com o link e o total de ✅/❌. É o único agente testador: não há cobertura de Windows/Edge, e os roteiros sob demanda são manuais, do dono.
  - **Limitações:** uma sessão filha não tem permissão maior que a do orquestrador, e uma que pede permissão fica parada, porque ninguém está olhando; por isso o chat de implementação fica no modo **Auto**. O `.claude/settings.json` libera em `permissions.allow` os comandos de sempre (gates, `npx`, git sem push forçado) e nega o push forçado, para as fases não pararem nesses pedidos. `create_session` escolhe o modelo, não o esforço: o esforço do coordenador na tabela vira referência, e o dos subagentes vai no briefing. Se uma fase não avisar até a conferência de reserva, o orquestrador lê `get_session` (`status_bucket`) e `list_events`; com falha ou sessão parada, chama o dono.
  - **Fora do fluxo automatizado** (etapa que ainda roda no manual), o dono abre cada fase, o agente da primeira fase troca `ready` por `in-progress` na issue da etapa ao criar o `epic/<nome>`, e o agente da última fase cria o testador da mesma forma e lê o relato: sem ❌, a rodada está aceita; com ❌, conversa com o dono antes de corrigir. O PR do épico para a `main` fica com o dono.
- **Roteiros de teste (`docs/TESTING.md`, seção 8):** os roteiros principais (R0 a R17) são feitos para o agente testador da nuvem executar **sozinho**; todo passo novo ou alterado precisa ter um jeito de o agente da nuvem fazê-lo (receita da nuvem do apêndice A, Playwright por CDP, shell, cliente MCP por stdio). Teste que precisa do dono e **não é muito relevante** vai para os roteiros sob demanda (manuais). Se precisa do dono e **é muito relevante** (perda de dados, integridade do `mapping.json`, segurança), o agente **não decide sozinho**: avisa o dono na conversa e na descrição do PR para decidirem juntos, e o passo fica onde está, marcado como pendente de decisão. Detalhes nas convenções da seção 8.
- Toda descrição de PR contém:
  1. **Resumo** do que mudou;
  2. **Como testar**: passos manuais objetivos no desktop, lembrando que o preview do branch é publicado sozinho a cada PR aberto ou atualizado (há um preview só: o do último PR atualizado);
  3. **Decisões tomadas** que não estavam na issue (as que mudam o plano também vão como comentário na issue da etapa);
  4. **Impacto no DS**: `nenhum`, ou os componentes, seções, tokens e ícones do design system que a mudança afeta. Para decidir, cruze o "Toca em:" da fase com os gatilhos de [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md); é leitura, não exige abrir o artefato. O que não for `nenhum` entra como pendência nesse arquivo, no mesmo PR.
- Se algo na issue estiver ambíguo ou for inviável, registre a dúvida num comentário da issue e no PR em vez de inventar comportamento grande. Para detalhes pequenos, decida, siga e documente.

## Uso de modelos (economia de cota sem perder qualidade)

O dono quer gastar pouco da cota do modelo mais caro. O que segura a qualidade é a especificação fechada e os testes, não o modelo que digita.

- **Sessão nova por assunto.** Cada turno relê a sessão inteira; quando um tema fecha (PR aberto e descrito), o próximo começa em outra sessão. No fluxo automatizado, cada chat (roadmap, detalhamento, implementação) e cada sessão de fase é um assunto. O PR, a issue da etapa (com a sub-issue da fase) e os `README` são o contexto de entrada.
- **O modelo principal (Fable/Opus) faz só o que exige julgamento:** entender o pedido, decidir formato e arquitetura, escrever o briefing dos subagentes, revisar o que volta, integrar e conversar com o dono.
- **Subagentes Sonnet produzem o resto, sempre com um briefing que diga o objetivo, os arquivos a ler, o que fica fora, e os comandos de validação (`npx vitest run <arquivos>`, `npx eslint`, `npx prettier --check`, `npx tsc --noEmit`) que precisam passar antes de devolver. O briefing também exige **teste primeiro**: para mudança de comportamento ou correção, o subagente escreve o teste que reproduz o comportamento, roda, vê falhar pelo motivo esperado e só então muda o código; o retorno traz o nome do teste e a mensagem da falha vista antes da correção. Se um teste honesto for impraticável, não escreve um ruim: diz isso no retorno e o coordenador decide. Refatoração sem mudança de comportamento, documentação e trabalho mecânico não exigem teste novo, mas exigem os testes existentes passando antes e depois:** código a partir de especificação, componentes e exemplos, testes unitários e ponta a ponta, correção de teste frágil, documentação e descrição de PR, scripts de captura e medição, triagem de log do CI, refatorações mecânicas.
- **Haiku para o mecânico:** renomear, formatar, varrer logs, atualizar contagens em testes.
- **Vale também para mudanças pequenas e para texto de PR.** Uma linha de documentação, um job de CI ou a descrição de um PR são produzidos por subagente a partir do briefing; o modelo principal decide o conteúdo e revisa. Tamanho não é exceção.
- **Menos idas e vindas do modelo principal:** validar em lote (`npm run lint && npm run typecheck && npm test && npm run build` uma vez, no fim), uma captura de tela por entrega, respostas curtas que se sustentam sozinhas.
- **Nunca delegar sem contexto:** o subagente só sabe o que está no briefing; apontar os arquivos e as regras deste `CLAUDE.md` que valem para a tarefa.
- **Coordenador e esforço definidos por fase.** Cada fase tem um modelo coordenador (Fable, Opus, Sonnet ou Haiku, do mais caro ao mais barato): o da sessão principal, que lê o pedido, escreve os briefings dos subagentes, revisa e integra. Antes de começar uma fase, a sessão confere o modelo em que roda (`session_context.model` da ferramenta `get_session` do servidor `claude-code-remote`, quando existir; senão a identidade informada no prompt do sistema). Se o modelo da sessão for superior ao definido, ela não executa a fase: diz qual é o modelo definido e pede ao dono para trocar de modelo ou abrir a sessão no modelo certo. Se for inferior, avisa que está abaixo do definido e só continua se o dono confirmar. Fase sem modelo definido segue o padrão desta seção (Fable/Opus coordena). Os subagentes não mudam, seja qual for o coordenador (Sonnet produz, Haiku faz o mecânico). Cada fase define também o nível de esforço (`low`, `medium`, `high`, `xhigh`, `max`) do coordenador e dos subagentes. O esforço do coordenador é definido pelo dono ao abrir a sessão; a sessão não tem como conferir o próprio esforço com segurança, então não há recusa por esforço, só por modelo. O esforço dos subagentes é passado explicitamente em cada briefing, lido da sub-issue da fase. Fase sem esforço definido usa `medium` para tudo. A tabela da etapa tem também a linha **Orquestrador** (modelo do chat de implementação; padrão Sonnet) e a coluna Testador (modelo e esforço da sessão do testador; padrão Sonnet, medium). No fluxo automatizado, a sessão filha já nasce no `model` da tabela; a recusa por modelo continua valendo, e o esforço do coordenador fica como referência, porque `create_session` não o escolhe. A tabela fica na issue da etapa, e cada sub-issue de fase repete a linha dela.

## Etapas

- **Em andamento:** a issue aberta com o rótulo `in-progress` e o PR aberto de `epic/*` para a `main`. Sem issue `in-progress` aberta, não há etapa em andamento.
- **Prontas:** as issues abertas com o rótulo `ready` (etapa detalhada, com as fases): podem ser desenvolvidas.
- **Futuras:** as issues abertas com o rótulo `roadmap`, ou `bug` sem `ready`/`in-progress`; nenhuma é implementada antes de virar uma issue `ready` com as fases.
- **Concluídas:** o `CHANGELOG.md` resume cada entrega (versões do schema, dos formatos e do MCP); o plano e as decisões ficam nas issues fechadas com o rótulo `in-progress`; o que veio antes delas (até a etapa Sincronia do design system, 2026-11-02) está no histórico do git. O marco "Uso real" foi alcançado em 2026-10-16.
- **Princípio:** as funcionalidades do núcleo são genéricas, sem nada específico de Figma ou de outra origem. Plataformas, linguagens e componentes de código entram só pelas especializações: nenhum nome de plataforma no código do núcleo.
- **Testes:** guiados por [`docs/TESTING.md`](docs/TESTING.md); o prompt do agente testador da nuvem (rodada completa ou dirigida) está em [`docs/TESTING-NUVEM.md`](docs/TESTING-NUVEM.md).
