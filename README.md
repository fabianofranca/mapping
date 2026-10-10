# Mapping

Aplicação web para marcar **áreas retangulares** em imagens, organizá-las em **camadas** e anotá-las com pares chave-valor (livres) ou com **anotações tipadas** definidas por uma _especialização_ (ex: SDUI, modelo de dados). Tudo é salvo num `mapping.json` ao lado das imagens, num formato pensado para ser lido por um agente de IA: as coordenadas são pixels da imagem original, então o agente recorta exatamente a área marcada.

- **Desktop primeiro, utilizável no celular**: o uso principal é no desktop (mouse, teclado, painéis lado a lado), e a app continua funcionando no celular (toque, gaveta inferior de três alturas, menu Painéis com as janelas em tela cheia, pan e zoom).
- **Um único arquivo**: o build gera `dist/index.html` autocontido; funciona aberto por `file://` (Chrome/Edge desktop) e hospedado no GitHub Pages, sem requisições de rede (ver [Privacidade](#privacidade-e-seus-dados)).
- **Dois modos de armazenamento**: _pasta_ no disco (File System Access API, Chrome/Edge desktop) ou _projeto local_ no navegador (IndexedDB). Qualquer projeto pode ser exportado em `.zip`.
- Tema claro/escuro, português (pt-BR) e inglês (en-US), instalável como PWA (só em `https:`).
- **Servidor MCP** para agentes de IA lerem projetos em pasta e **proporem alterações** a eles, com o Ctrl+C da app copiando a referência do item selecionado. O agente nunca grava o `mapping.json` (não há `apply_changes`). Instalação e uso em [`docs/MCP.md`](docs/MCP.md).
- **Propostas de alteração com revisão** (etapa 4): toda alteração feita por um agente chega como uma _proposta_, uma espécie de pull request dentro da ferramenta, gravada em `proposals/` na pasta do projeto (versionada junto com o resto; o zip exportado a inclui). Na janela **Propostas** (Ctrl+Shift+7; no celular, menu Painéis) o usuário abre a proposta no **modo revisão**: o projeto fica somente leitura, o canvas mostra o projeto **como ficaria** (alternância Atual / Proposto), e ele **aceita ou rejeita** em qualquer nível (proposta, imagem, item ou mudança), deixa **notas** no que rejeitou e usa **Aplicar aceitas** (uma entrada de desfazer). A revisão pode ser interrompida e retomada, inclusive depois de fechar a app. O agente lê a revisão (`get_proposal_review`) e manda uma nova proposta (`supersedes`) só com as correções. Imagens e marcações têm uma identidade externa genérica (`source`), e as especializações `formatVersion` 3 declaram a que elementos de um sistema externo cada tipo e campo correspondem (`sources`); o núcleo não interpreta o sistema. Para experimentar sem um agente, abra `examples/proposta-exemplo.zip` na app. Formato em [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md).
- **Referências de código**: uma especialização pode declarar _plataformas_ e dizer como cada tipo vira código nelas (`code`); as anotações guardam **onde foram implementadas** (campo `codeRef`) e o projeto guarda o repositório de cada plataforma (`platformRepos`), com "Abrir no repositório" e "Copiar caminho" na app. O agente recebe a planta de código de uma marcação (`get_code_hints`) e acha o mapeamento a partir de um arquivo (`find_by_code`). O núcleo continua genérico: nenhum nome de plataforma no código da app nem do servidor MCP. Formato em [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md) e [`docs/FORMAT.md`](docs/FORMAT.md).

## Privacidade e seus dados

Seus projetos e imagens **ficam no seu dispositivo** (na pasta que você escolheu ou no navegador) e **não são enviados a nenhum servidor**. Isso não é só uma promessa do código: o `index.html` carrega uma _Content Security Policy_ que o próprio navegador impõe, com `connect-src 'none'` e `default-src 'none'`. Na prática:

- a app **não consegue** fazer requisição de rede (`fetch`, `XMLHttpRequest`, `WebSocket`…), nem carregar imagem, fonte, script, estilo ou frame de outro endereço;
- não há telemetria, analytics, fontes ou bibliotecas carregadas de CDN: tudo (código e estilos) está dentro do arquivo, e a política só aceita exatamente esse conteúdo (por hash), sem `'unsafe-inline'` nem `'unsafe-eval'`;
- o único contato com a rede é o do **navegador** ao baixar a app (e o service worker ao procurar versão nova) a partir de onde ela está hospedada; seus dados nunca participam disso;
- o que sai da app é o que **você** manda: o `.zip` exportado, baixado ou compartilhado pela folha de compartilhamento do sistema.

A política é gerada no build, e o build falha se ela faltar ou não bater com o conteúdo do arquivo; testes Playwright confirmam o bloqueio. Detalhes e motivos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#content-security-policy-etapa-24).

## Como rodar

Requer Node 22.

```bash
npm ci
npm run dev        # servidor de desenvolvimento (Vite)
npm run build      # gera dist/index.html (e sw.js, manifest.webmanifest) com a CSP
```

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

Três workflows em `.github/workflows/`:

- **`ci.yml`**: em todo PR e em push de branches (menos a `main`): lint, typecheck, testes com cobertura, orçamentos de desempenho, build (app e servidor MCP) e E2E.
- **`mcp-release.yml`**: ao criar uma tag `mcp-v<versão>` (a versão precisa ser a de `mcp/version.ts`), gera `mapping-mcp.js` e o anexa à Release do GitHub (ver [`docs/MCP.md`](docs/MCP.md)).
- **`deploy.yml`**: um push na `main` roda lint, testes e build e publica a versão principal no GitHub Pages (em `/`).

O `index.html` avulso também sai como artefato do workflow, para abrir por `file://`.

## Como usar o preview de um branch

Para ver um branch no celular antes do merge: em **Actions → Deploy → Run workflow**, escolha o branch em "Use workflow from" (ou digite o nome no campo `branch`). O workflow publica:

- a `main`, intacta, em `/`;
- o branch em **`/preview/`**, construído com `VITE_CHANNEL=preview`.

O preview tem **armazenamento separado** (IndexedDB, `localStorage` e service worker próprios): ele não enxerga nem migra os projetos locais da versão principal. Uma faixa no topo avisa que é uma versão de teste (dá para dispensá-la na sessão; o selo PREVIEW na barra e o canal na barra de status ficam sempre), e o manifest tem outro nome, para instalar os dois lado a lado.

## Como relatar um problema

A app não envia nada para a rede (nem telemetria), então o relato depende de você copiar os dados:

1. Abra o **Diagnóstico**: no desktop, a aba Diagnóstico da janela de baixo (`Ctrl+Shift+6`); no celular, o menu **Painéis** → Diagnóstico.
2. Toque em **Copiar**. O texto traz um cabeçalho com a versão (build), canal, schema, tipo de armazenamento (pasta ou local), navegador, tamanho da janela, idioma, tema, quantas imagens, marcações e anotações o projeto tem e se há gravação pendente, seguido dos erros registrados. Não leva nomes de projeto, de imagens nem caminhos.
3. Abra uma issue em [github.com/fabianofranca/mapping/issues](https://github.com/fabianofranca/mapping/issues) com o texto copiado, o que você fez, o que esperava e o que aconteceu (um print ajuda).

Sem projeto aberto, a versão fica em **Configurações → Sobre**, que também tem **Copiar**; no desktop ela aparece ainda no fim da barra de status.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): camadas, fluxo de dados, regras e onde fica cada coisa.
- [`docs/FORMAT.md`](docs/FORMAT.md): referência do `mapping.json` (schema v8).
- [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md): formato da proposta de alteração e regras da revisão.
- [`docs/MCP.md`](docs/MCP.md): servidor MCP (instalação, `.mcp.json`, raízes, tools, referências e solução de problemas); [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md) é o guia do agente.
- [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md): formato do arquivo de especialização (e [`docs/spec.schema.json`](docs/spec.schema.json)); exemplos em [`examples/specs/`](examples/specs/).
- [`PLAN.md`](PLAN.md): resumo do produto e fases pendentes; o histórico está em [`docs/history/`](docs/history/).
- [`CLAUDE.md`](CLAUDE.md): regras de trabalho para o Claude Code.

## Stack

Vite + TypeScript (strict) + Preact + `@preact/signals`; Konva (canvas); JSZip; zod; idb; `vite-plugin-singlefile`; Vitest e Playwright.
