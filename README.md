# Mapping

Aplicação web para marcar **áreas retangulares** em imagens, organizá-las em **camadas** e anotá-las com pares chave-valor (livres) ou com **anotações tipadas** definidas por uma _especialização_ (ex: SDUI, modelo de dados). Tudo é salvo num `mapping.json` ao lado das imagens, num formato pensado para ser lido por um agente de IA: as coordenadas são pixels da imagem original, então o agente recorta exatamente a área marcada.

- **Só desktop**: feita para estação de trabalho (mouse, teclado, painéis lado a lado), com largura mínima de 900 px; numa janela mais estreita a app mostra "Abra numa janela maior" e volta ao normal ao alargar. Toque simples (num monitor de toque) funciona; não há layout de celular.
- **Um único arquivo**: o build gera `dist/index.html` autocontido; funciona aberto por `file://` (Chrome/Edge desktop) e hospedado no GitHub Pages, sem requisições de rede (ver [Privacidade](#privacidade-e-seus-dados)).
- **Dois modos de armazenamento**: _pasta_ no disco (File System Access API, Chrome/Edge desktop) ou _projeto local_ no navegador (IndexedDB). Qualquer projeto pode ser exportado em `.zip`.
- Tema claro/escuro, português (pt-BR) e inglês (en-US), instalável como PWA (só em `https:`).
- **Servidor MCP** para agentes de IA lerem projetos em pasta e **proporem alterações** a eles, com o Ctrl+C da app copiando a referência do item selecionado. O agente nunca grava o `mapping.json` (não há `apply_changes`). Instalação e uso em [`docs/MCP.md`](docs/MCP.md).
- **Propostas de alteração com revisão** (etapa 4): toda alteração feita por um agente chega como uma _proposta_, uma espécie de pull request dentro da ferramenta, gravada em `proposals/` na pasta do projeto (versionada junto com o resto; o zip exportado a inclui). Na janela **Propostas** (Ctrl+Shift+7) o usuário abre a proposta no **modo revisão**: o projeto fica somente leitura, o canvas mostra o projeto **como ficaria** (alternância Atual / Proposto), e ele **aceita ou rejeita** em qualquer nível (proposta, imagem, item ou mudança), deixa **notas** no que rejeitou e usa **Aplicar aceitas** (uma entrada de desfazer). A revisão pode ser interrompida e retomada, inclusive depois de fechar a app. O agente lê a revisão (`get_proposal_review`) e manda uma nova proposta (`supersedes`) só com as correções. Imagens e marcações têm uma identidade externa genérica (`source`), e as especializações `formatVersion` 3 declaram a que elementos de um sistema externo cada tipo e campo correspondem (`sources`); o núcleo não interpreta o sistema. Para experimentar sem um agente, abra `examples/proposta-exemplo.zip` na app. Formato em [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md).
- **Guia interativo e projeto de exemplo**: um passeio de 12 passos (a página `guia/`, que funciona sem internet, aberta pela tela inicial e pela **Ajuda**) e o botão **Abrir projeto de exemplo**, que abre uma cópia de `examples/exemplo-completo.zip` pelo mesmo caminho do **Abrir zip**. Ver [Guia interativo e exemplo](#guia-interativo-e-projeto-de-exemplo).
- **Código das especializações**: uma especialização pode declarar _plataformas_ e dizer com que código se cria uma instância de cada tipo nelas (`code`: o que se chama, `symbol`, e o arquivo que o define, `path`, no repositório `repo` da plataforma); o projeto só guarda o clone local (`platformRepos`). Nos Detalhes, a linha "Definição" tem "Abrir no repositório" e "Copiar caminho". O mapeamento não guarda nada sobre a solução. O agente recebe as chamadas a escrever para uma marcação (`get_code_hints`) e acha, a partir de um arquivo, os tipos que o usam e as marcações deles (`find_by_code`). O núcleo continua genérico: nenhum nome de plataforma no código da app nem do servidor MCP. Formato em [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md) e [`docs/FORMAT.md`](docs/FORMAT.md).
- **Biblioteca de componentes** (etapa Biblioteca, concluída): a especialização pode entregar um _pacote_ (pasta com componentes, fontes, documentos e exemplos) que a app valida, aplica e atualiza com migrações; telas sem imagem montadas com componentes direto no canvas, e um **Catálogo** para navegar pelos componentes e experimentar os campos. Formato em [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md) e [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md).

## Privacidade e seus dados

Seus projetos e imagens **ficam no seu dispositivo** (na pasta que você escolheu ou no navegador) e **não são enviados a nenhum servidor**. Isso não é só uma promessa do código: o `index.html` carrega uma _Content Security Policy_ que o próprio navegador impõe, com `connect-src 'none'` e `default-src 'none'`. Na prática:

- a app **não consegue** fazer requisição de rede (`fetch`, `XMLHttpRequest`, `WebSocket`…), nem carregar imagem, fonte, script, estilo ou frame de outro endereço;
- não há telemetria, analytics, fontes ou bibliotecas carregadas de CDN: tudo (código e estilos) está dentro do arquivo, e a política só aceita exatamente esse conteúdo (por hash), sem `'unsafe-inline'` nem `'unsafe-eval'`;
- o único contato com a rede é o do **navegador** ao baixar a app (e o service worker ao procurar versão nova) a partir de onde ela está hospedada; seus dados nunca participam disso;
- o que sai da app é o que **você** manda: o `.zip` exportado, baixado ou compartilhado pela folha de compartilhamento do sistema.

A política é gerada no build, e o build falha se ela faltar ou não bater com o conteúdo do arquivo; testes Playwright confirmam o bloqueio. Detalhes e motivos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#content-security-policy-etapa-24).

## Como rodar

Requer Node 22 (fixado em `.nvmrc` e em `engines` no `package.json`; com nvm, `nvm use`).

```bash
npm ci
npm run dev        # servidor de desenvolvimento (Vite)
npm run build      # gera dist/index.html (e sw.js, manifest.webmanifest) com a CSP, e o laboratório em dist/lab/
npm run dev:lab    # laboratório de componentes (lab/README.md), à parte da app
npm run dev:lab:react # demonstração do visualizador embutível em React (lab/README.md)
npm run build:viewer # gera dist-viewer/ (visualizador embutível: núcleo, invólucro React e tipos)
npm run build:guia   # regera public/guia/index.html (o npm run build já faz)
npm run build:example # regera examples/exemplo-completo.zip a partir da pasta
```

## Guia interativo e projeto de exemplo

Na tela inicial, **Abrir projeto de exemplo** abre uma cópia do projeto `examples/exemplo-completo/` (4 telas, 31 marcações, 41 anotações, 8 camadas, 3 especializações e uma proposta de alteração para revisar), e **Guia interativo** (na lateral, e na **Ajuda**) abre numa aba nova o passeio de 12 passos sobre esse mesmo projeto, para seguir lado a lado com a app. O guia é uma página estática (`public/guia/index.html`, publicada em `guia/` ao lado do `index.html`), gerada do projeto de exemplo, no tema da app, e fica no cache do service worker.

```bash
npm run build:example   # examples/exemplo-completo.zip, da pasta examples/exemplo-completo/
npm run build:guia      # public/guia/index.html, do template e do exemplo
```

Como é gerado, o que abrir o exemplo grava e como mudar o exemplo: [`docs/GUIDE.md`](docs/GUIDE.md). Roteiro de teste manual: R11 do [`docs/TESTING.md`](docs/TESTING.md).

## Como testar

```bash
npm run build:mcp    # gera dist-mcp/mapping-mcp.js (servidor MCP em arquivo único)
npm run lint         # eslint + prettier --check
npm run typecheck    # tsc --noEmit (app e servidor MCP)
npm test             # Vitest: modelo (Node), store, storage, canvas e componentes
npm run test:coverage # com relatório de cobertura em coverage/ (pula os orçamentos de desempenho)
npm run test:perf    # só os orçamentos de desempenho por quadro
npm run test:e2e     # Playwright contra dist/index.html (precisa de npm run build antes; inclui a CSP e o service worker, que usam openssl)
```

Antes de abrir um PR: `npm run lint && npm run typecheck && npm test && npm run build`.

O E2E roda no CI. Localmente, rode `npm run build` e informe o Chrome com `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<caminho>`.

## Como publicar

Os workflows em `.github/workflows/`:

- **`ci.yml`**: em todo PR e em push de branches (menos a `main`): o job `epic` confere a origem (PR para a `main` só a partir de `epic/*` ou do Dependabot; check obrigatório no ruleset da `main`), e depois lint, typecheck, testes com cobertura, orçamentos de desempenho, build (app e servidor MCP), orçamento de tamanho do `dist/index.html` (1,5 MB, valor em `INDEX_HTML_MAX_BYTES`; o tamanho aparece no resumo do job) e E2E (jobs `check` e `e2e`). O Playwright repete uma vez no CI, com trace só na repetição.
- **`mcp-prerelease.yml`**: pre-releases do servidor MCP para testar antes da estável: um snapshot por PR com base em `epic/**` (`mcp-snapshot-pr<N>`, apagado quando o PR fecha) e uma release candidate no merge do PR da última fase do épico, o que leva o rótulo `mcp-rc` (`mcp-v<versão>-rc.<n>`, apagadas quando a estável sai); ver [`docs/MCP.md`](docs/MCP.md).
- **`mcp-release.yml`**: ao criar uma tag `mcp-v<versão>` (a versão precisa ser a de `mcp/version.ts`), gera `mapping-mcp.js` e o anexa à Release do GitHub, criada antes pela tela ou não; também pode ser rodado à mão (Run workflow) para uma tag que já existe (ver [`docs/MCP.md`](docs/MCP.md)).
- **`preview-on-pr.yml`**: em todo PR aberto ou atualizado (do próprio repositório), dispara o `deploy.yml` para o branch do PR, que passa a ocupar o `/preview/`.
- **`deploy.yml`**: um push na `main` publica a versão principal no GitHub Pages (em `/`). Antes, chama o `ci.yml` inteiro (`workflow_call`) para a `main` e, no preview, também para o branch. Todo deploy grava `deploy.json` na raiz do site com o commit da `main` publicado. Sem preview, a falha da `main` bloqueia tudo; com preview, o branch precisa passar, mas a falha da `main` (que só é checada se ela mudou desde o `deploy.json`) não bloqueia: a produção é republicada do commit já publicado, com aviso no resumo.
- **`dependabot.yml`**: atualizações semanais de npm e GitHub Actions, com minor e patch agrupados num PR por ecossistema.

O `index.html` avulso também sai como artefato do workflow, para abrir por `file://`.

## Como usar o preview de um branch

Todo PR aberto ou atualizado publica o branch dele em `/preview/` sozinho (`preview-on-pr.yml` dispara o Deploy); há um preview só, o do último PR atualizado. Para publicar outro branch à mão: em **Actions → Deploy → Run workflow**, escolha o branch em "Use workflow from" (ou digite o nome no campo `branch`). O workflow publica:

- a `main`, intacta, em `/` (o último commit validado: se os checks da `main` falharem, fica o já publicado);
- o branch em **`/preview/`**, construído com `VITE_CHANNEL=preview`.

O preview tem **armazenamento separado** (IndexedDB, `localStorage` e service worker próprios): ele não enxerga nem migra os projetos locais da versão principal. Uma faixa no topo avisa que é uma versão de teste (dá para dispensá-la na sessão; o selo PREVIEW na barra e o canal na barra de status ficam sempre), e o manifest tem outro nome, para instalar os dois lado a lado.

## Como relatar um problema

Para testar a app de ponta a ponta (onde pegar, requisitos, roteiros com o resultado esperado de cada passo e o template do relato), siga o guia do testador: [`docs/TESTING.md`](docs/TESTING.md). Para um agente com controle do computador (Cowork) testar no seu computador, o prompt inicial está em [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) (rodada completa ou dirigida por achados de um relato, por uma lista de passos ou pelas fases de um plano); o guia tem um apêndice só para o agente.

A app não envia nada para a rede (nem telemetria), então o relato depende de você copiar os dados:

1. Abra o **Diagnóstico**: a aba Diagnóstico da janela de baixo (`Ctrl+Shift+6`).
2. Clique em **Copiar**. O texto traz um cabeçalho com a versão (build), canal, schema, tipo de armazenamento (pasta ou local), navegador, tamanho da janela, idioma, tema, quantas imagens, marcações e anotações o projeto tem e se há gravação pendente, seguido dos erros registrados. Não leva nomes de projeto, de imagens nem caminhos.
3. Abra uma issue em [github.com/fabianofranca/mapping/issues](https://github.com/fabianofranca/mapping/issues) com o texto copiado, o que você fez, o que esperava e o que aconteceu (um print ajuda).

Sem projeto aberto, a versão fica em **Configurações → Sobre**, que também tem **Copiar**; com um projeto aberto, ela aparece ainda no fim da barra de status.

## Documentação

- [`docs/TESTING.md`](docs/TESTING.md): guia do testador (onde pegar a app, requisitos, mapa da interface, instalação do MCP, roteiros de teste manual, teste manual avançado e os templates do relato e do registro de uso real; apêndices para o agente testador e para operações de disco).
- [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md): prompt do testador do Cowork (agente com controle do computador).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): camadas, fluxo de dados, regras e onde fica cada coisa.
- [`docs/GUIDE.md`](docs/GUIDE.md): guia interativo e projeto de exemplo (como são gerados, o que abrir o exemplo grava, como mudá-los).
- [`docs/FORMAT.md`](docs/FORMAT.md): referência do `mapping.json` (schema v13).
- [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md): formato da proposta de alteração e regras da revisão.
- [`docs/MCP.md`](docs/MCP.md): servidor MCP (instalação, `.mcp.json`, raízes, tools, referências e solução de problemas); [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md) é o guia do agente.
- [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md): formato do arquivo de especialização (e [`docs/spec.schema.json`](docs/spec.schema.json)); exemplos em [`examples/specs/`](examples/specs/).
- [`.claude/skills/spec-author/SKILL.md`](.claude/skills/spec-author/SKILL.md): skill do Claude Code que escreve e valida uma especialização a partir de um código ou design system (copie a pasta para o repositório mapeado ou para `~/.claude/skills/`).
- [`examples/workspace/`](examples/workspace/): esqueleto de uma pasta que centraliza projetos Mapping, pronta para qualquer agente MCP (servidor, raízes, skill e `AGENTS.md` por caminho relativo; `setup.sh` baixa a release).
- [`PLAN.md`](PLAN.md): resumo do produto e fases pendentes; o histórico está em [`docs/history/`](docs/history/).
- [`CLAUDE.md`](CLAUDE.md): regras de trabalho para o Claude Code.

## Stack

Vite + TypeScript (strict) + Preact + `@preact/signals`; Konva (canvas); JSZip; zod; idb; `vite-plugin-singlefile`; Vitest e Playwright.
