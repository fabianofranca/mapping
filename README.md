# Mapping

Aplicação web para marcar **áreas retangulares** em imagens, organizá-las em **camadas** e anotá-las com pares chave-valor (livres) ou com **anotações tipadas** definidas por uma _especialização_ (ex: SDUI, modelo de dados). Tudo é salvo num `mapping.json` ao lado das imagens, num formato pensado para ser lido por um agente de IA: as coordenadas são pixels da imagem original, então o agente recorta exatamente a área marcada.

- **Desktop primeiro, utilizável no celular**: o uso principal é no desktop (mouse, teclado, painéis lado a lado), e a app continua funcionando no celular (toque, gaveta inferior de três alturas, menu Painéis com as janelas em tela cheia, pan e zoom).
- **Um único arquivo**: o build gera `dist/index.html` autocontido; funciona aberto por `file://` (Chrome/Edge desktop) e hospedado no GitHub Pages, sem requisições de rede (ver [Privacidade](#privacidade-e-seus-dados)).
- **Dois modos de armazenamento**: _pasta_ no disco (File System Access API, Chrome/Edge desktop) ou _projeto local_ no navegador (IndexedDB). Qualquer projeto pode ser exportado em `.zip`.
- Tema claro/escuro, português (pt-BR) e inglês (en-US), instalável como PWA (só em `https:`).

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
npm run build:mcp    # gera dist-mcp/mapping-mcp.js (servidor MCP em arquivo único; etapa 3a)
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

Dois workflows em `.github/workflows/`:

- **`ci.yml`**: em todo PR e em push de branches (menos a `main`): lint, typecheck, testes com cobertura, orçamentos de desempenho, build (app e servidor MCP) e E2E.
- **`deploy.yml`**: um push na `main` roda lint, testes e build e publica a versão principal no GitHub Pages (em `/`).

O `index.html` avulso também sai como artefato do workflow, para abrir por `file://`.

## Como usar o preview de um branch

Para ver um branch no celular antes do merge: em **Actions → Deploy → Run workflow**, escolha o branch em "Use workflow from" (ou digite o nome no campo `branch`). O workflow publica:

- a `main`, intacta, em `/`;
- o branch em **`/preview/`**, construído com `VITE_CHANNEL=preview`.

O preview tem **armazenamento separado** (IndexedDB, `localStorage` e service worker próprios): ele não enxerga nem migra os projetos locais da versão principal. Uma faixa no topo avisa que é uma versão de teste (dá para dispensá-la na sessão; o selo PREVIEW na barra e o canal na barra de status ficam sempre), e o manifest tem outro nome, para instalar os dois lado a lado.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): camadas, fluxo de dados, regras e onde fica cada coisa.
- [`docs/FORMAT.md`](docs/FORMAT.md): referência do `mapping.json` (schema v6).
- [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md): formato do arquivo de especialização (e [`docs/spec.schema.json`](docs/spec.schema.json)); exemplos em [`examples/specs/`](examples/specs/).
- [`PLAN.md`](PLAN.md): resumo do produto e fases pendentes; o histórico está em [`docs/history/`](docs/history/).
- [`CLAUDE.md`](CLAUDE.md): regras de trabalho para o Claude Code.

## Stack

Vite + TypeScript (strict) + Preact + `@preact/signals`; Konva (canvas); JSZip; zod; idb; `vite-plugin-singlefile`; Vitest e Playwright.
