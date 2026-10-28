# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje a etapa em andamento é a **Imagens remotas**, épico `epic/imagens-remotas`; a Proposto com componentes foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C4; especialização `formatVersion` 5, schema v11, MCP 0.6.0) está concluída e testada pelo Cowork e pelo dono no Claude Code; épico mesclado na `main`, com a tag estável `mcp-v0.6.0` (histórico em [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md)). A etapa **Canvas limpo** (épico `epic/canvas-limpo`, fases V1 e V2; sem schema, formato nem MCP novos) está concluída: o cartão de texto do zoom semântico saiu do canvas e o **Ver limpo** (`Alt+H`) mostra só as imagens e os componentes (histórico em [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md)). A etapa **Container** (épico `epic/container`, fases CN1 e CN2; schema v12, especialização `formatVersion` 6, proposta `formatVersion` 2 e MCP 0.8.0) está concluída: o objeto de topo do canvas passou a se chamar container (interface, MCP, propostas e `mapping.json`, com `containers` e `containerId`) e os presets de dispositivo saíram do núcleo para a especialização (histórico em [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md)). A etapa **Marcações espaciais, notas e setas** (épico `epic/marcacoes-espaciais`, fases ME0 a ME5; schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3 e MCP 0.9.0 ao fim) está concluída (PRs #208 a #211, #214 e o da ME5): marcações que pertencem ao canvas e envolvem containers, pertencimento resolvido pela geometria e gravado, seleção múltipla e arrasto conjunto, biblioteca de notas embutida, setas como marcações que apontam e tabelas flutuantes, tudo exposto pelo MCP 0.9.0 (histórico em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md)). A etapa **Proposto com componentes** (épico `epic/proposto-componentes`, fases PC1 e PC2; sem schema, formato de proposta nem MCP novos) está concluída: a visão Proposto da revisão desenha os componentes que a proposta cria, inclusive os de tipos que só existem no pacote da proposta, e a criação rejeitada vira só o fantasma pontilhado nas duas visões (histórico em [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md)). O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v13)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 7 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
| [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md)   | Formato do arquivo de componente (`mapping-component`): nós, dimensionamento, expressões, avisos do motor |
| [`docs/component.schema.json`](docs/component.schema.json) | JSON Schema do arquivo de componente (documentação; o código é a fonte da verdade) |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual 13.9, hoje R1 do `docs/TESTING.md`) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 retirada do roadmap) |
| [`docs/history/PLAN-etapa-2-5.md`](docs/history/PLAN-etapa-2-5.md) | Histórico: etapa 2.5, trava de marcações e imagens (fases F1 a F6 concluídas) |
| [`docs/history/PLAN-etapa-3a.md`](docs/history/PLAN-etapa-3a.md) | Histórico: etapa 3a, servidor MCP base (fases 3a.1 a 3a.6 concluídas) |
| [`docs/history/PLAN-etapa-3b.md`](docs/history/PLAN-etapa-3b.md) | Histórico: etapa 3b, referências de código (fases 3b.1 a 3b.5 concluídas; inclui o roteiro de teste manual da 3b) |
| [`docs/history/PLAN-etapa-4.md`](docs/history/PLAN-etapa-4.md) | Histórico: etapa 4, propostas de alteração com revisão (fases 4.0 a 4.5 concluídas; inclui o roteiro de teste manual da etapa 4) |
| [`docs/history/PLAN-etapa-5.md`](docs/history/PLAN-etapa-5.md) | Histórico: etapa 5, pré-voo para uso real (fases 5.1 a 5.9 concluídas; decisões consolidadas dos PRs; prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-6.md`](docs/history/PLAN-etapa-6.md) | Histórico: etapa 6, correções da primeira rodada de testes (fases 6.1 a 6.7 concluídas; decisões consolidadas dos PRs; relato da rodada 1 e prompts do coordenador e do testador ao lado) |
| [`docs/history/PLAN-etapa-7.md`](docs/history/PLAN-etapa-7.md) | Histórico: etapa 7, correções da rodada dirigida (fases 7.1 a 7.4 concluídas; decisões consolidadas dos PRs; relato da rodada 2 e prompt do coordenador ao lado) |
| [`docs/history/PLAN-etapa-8.md`](docs/history/PLAN-etapa-8.md) | Histórico: etapa 8, consolidação por subsistema (fases 8.1 a 8.7 concluídas; decisões consolidadas dos PRs, auditoria e portão; ao lado, as notas de desenho em `docs/history/etapa-8-notas/`, a segunda leitura `auditoria-etapa-8.md` e o prompt do coordenador) |
| [`docs/history/PLAN-etapa-9.md`](docs/history/PLAN-etapa-9.md) | Histórico: etapa 9, ajustes do teste manual avançado (fases 9.1 a 9.7 concluídas; decisões consolidadas dos PRs; schema v9 e MCP 0.4.0) |
| [`docs/history/PLAN-etapa-10.md`](docs/history/PLAN-etapa-10.md) | Histórico: etapa 10, correções da rodada dirigida da etapa 9 (fases 10.1 e 10.2 concluídas; decisões consolidadas dos PRs #154 e #155 e do fechamento) |
| [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md) | Histórico: laboratório de componentes, fases L1 e L2 concluídas; decisões registradas que a etapa Biblioteca herda |
| [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md) | Histórico: etapa Biblioteca, fases B1 a B5 e Fechamento concluídas; decisões consolidadas dos PRs, rodada do Cowork do Fechamento (e reteste) e o que ficou para depois |
| [`docs/history/PLAN-etapa-instanciacao.md`](docs/history/PLAN-etapa-instanciacao.md) | Histórico: etapa Código de instanciação, fases C1 a C4 concluídas; decisões consolidadas dos PRs, rodada do Cowork e reteste, e o que ficou para depois |
| [`docs/history/PLAN-etapa-canvas-limpo.md`](docs/history/PLAN-etapa-canvas-limpo.md) | Histórico: etapa Canvas limpo, fases V1 e V2 concluídas; decisões consolidadas dos PRs |
| [`docs/history/PLAN-etapa-container.md`](docs/history/PLAN-etapa-container.md) | Histórico: etapa Container, fases CN1 e CN2 concluídas; decisões consolidadas dos PRs e o que ficou para depois |
| [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md) | Histórico: etapa Marcações espaciais, notas e setas, fases ME0 a ME5 concluídas; decisões, regras de contenção, decisões consolidadas dos PRs, a cascata noturna e o que ficou para depois |
| [`docs/history/PLAN-etapa-proposto-componentes.md`](docs/history/PLAN-etapa-proposto-componentes.md) | Histórico: etapa Proposto com componentes, fases PC1 e PC2 concluídas; decisões consolidadas dos PRs, rodada do Cowork e o que ficou para depois |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/relato-2026-10-20-instanciacao.md`](docs/history/relato-2026-10-20-instanciacao.md) | Relato da rodada dirigida do Cowork sobre o build `dee8666` (etapa Código de instanciação): 54 ✅, 1 ❌ (R3.6a) |
| [`docs/history/relato-2026-10-20-instanciacao-reteste.md`](docs/history/relato-2026-10-20-instanciacao-reteste.md) | Reteste do R3.6a no Claude Code com a `mcp-v0.6.0-rc.2`: passou |
| [`docs/history/relato-2026-10-21-recorte-url.md`](docs/history/relato-2026-10-21-recorte-url.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/recorte-url` (build `564b1e7`, MCP 0.7.0-rc.1): 35 ✅, nenhum achado |
| [`docs/history/relato-2026-10-24-proposto-componentes.md`](docs/history/relato-2026-10-24-proposto-componentes.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/proposto-componentes` (build `70cc7ee`): 29 ✅, 4 ⚠️, achados corrigidos no fechamento |
| [`docs/history/relato-2026-10-26-selecao-pelo-nome.md`](docs/history/relato-2026-10-26-selecao-pelo-nome.md) | Relato da rodada dirigida do Cowork sobre o épico `epic/selecao-pelo-nome` (build `678f941`, R0 e R1.1 a R1.6a): 13 ✅, nenhum achado |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapas Container, Marcações espaciais, notas e setas e Proposto com componentes concluídas), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

---

## Etapa — Imagens remotas (em andamento, épico `epic/imagens-remotas`)

- **Objetivo:** o dono pediu (2026-10-28) que um componente de uma especialização possa exibir uma imagem remota (URL `https://`) no canvas, "com o máximo de segurança possível". Hoje é impossível por quatro razões: o formato do componente não tem nó de imagem; a CSP (`img-src 'self' data: blob:`) bloqueia qualquer `https:`; imagem de outra origem sem CORS contamina o canvas e quebra o `toDataURL` da galeria do Catálogo; e o motor roda também no servidor MCP, que não tem rede no desenho.
- **Base que já existe:** a cena do motor (`src/model/components/scene.ts`) tem o preenchimento `{ type: 'image', src? }` (herança do laboratório, só `data:`); `src/canvas/components/renderScene.ts` o desenha com `KonvaImage` e cai no reservado sem `src`; `mcp/image/sceneRaster.ts` já desenha o reservado; o service worker (`pwa/sw.js`) já ignora requisições de outra origem.
- **Versões:** componente `formatVersion` 3 (a 1 e a 2 continuam aceitas), especialização `formatVersion` 8 e MCP 0.10.0. **Schema do `mapping.json` (v13) e formato da proposta (v3) sem mudança:** a URL é o valor de um campo `string`, como qualquer outro.
- **Coordenador e esforço** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md)):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                                                       |
| ---- | ----------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| RI1  | Opus        | high                   | Sonnet high (parser, política de URL, validador); Sonnet medium (docs, exemplo, skill, MCP); Haiku low |
| RI2  | Opus        | high                   | Sonnet high; Haiku low                                                                           |
| RI3  | Opus        | medium                 | Sonnet medium (high no carregador); Haiku low                                                    |
| RI4  | Sonnet      | medium                 | Sonnet medium; Haiku low                                                                         |

### Modelo de ameaças

O que cada camada cobre:

| Ameaça | Quem a cobre |
| ------ | ------------ |
| T1. Vazamento de dados do projeto por código injetado ou bug (`new Image().src = 'https://x/?d=…'`) | CSP: `img-src` só com as origens exatas da lista do build. Fora dela o navegador bloqueia, seja qual for o código. `connect-src 'none'` continua. |
| T2. Rastreamento de quem abre o projeto (IP, hora) por quem escreveu a especialização, a proposta ou a anotação | Consentimento por navegador (especialização + origem), `no-referrer`, sem credenciais. |
| T3. URL maliciosa num valor de campo (agente pelo MCP, proposta, edição) | Política pura no modelo: só `https:`, sem usuário e senha, até 2048 caracteres, origem declarada pela especialização **e** presente na lista do build. |
| T4. Exaustão de memória (imagem enorme) e excesso de requisições | Carregador com limite de concorrência, tempo limite, tamanho máximo decodificado e bitmap de exibição reduzido; cache só em memória, com despejo. |
| T5. Canvas contaminado quebrando a galeria do Catálogo | `crossOrigin = 'anonymous'` sempre; servidor sem CORS: a imagem não carrega e fica o reservado. Nunca se desenha imagem que contamine. |
| T6. Rede privada (roteador, `localhost`, serviços internos) | Origens com IP literal, `localhost`, nome sem ponto e sufixos `.local`, `.localhost`, `.internal` são recusadas na especialização e no build. |
| T7. Persistência e reenvio de conteúdo de terceiros | A imagem nunca é gravada: nem no projeto, nem no zip, nem no IndexedDB, nem no cache do service worker. Só a URL (texto) fica no `mapping.json`. |
| T8. Servidor MCP fazendo requisições em nome do agente | O MCP **nunca** baixa imagens: desenha o reservado e devolve a URL como texto. |

Uma imagem só é pedida à rede quando as **três** listas concordam: origem declarada pela especialização (`remoteImages.origins`), origem na lista do build (`MAPPING_IMAGE_ORIGINS`) e consentimento dado neste navegador para aquela especialização e origem. **Ameaça residual:** uma origem permitida pelo build cujo dono leia os registros de acesso fica sabendo de quem abre projetos com imagens dela. Por isso a lista do build deve ter só hosts do próprio dono (nunca hospedagem compartilhada como `*.s3.amazonaws.com` ou `*.github.io` inteiro).

### Decisões

1. **Nó `image` no componente (`formatVersion` 3; a 1 e a 2 continuam aceitas sem mudança).** Chaves: `src` (obrigatória; texto ou expressão, como `$field`, que resulta numa URL absoluta `https://`), `fit` (`cover`, padrão; `contain`; `fill`) e as comuns (`name`, `visible`, `opacity`, `width`, `height`, `anchors`, `fill` como fundo atrás da imagem, `stroke`, `shadow`, `cornerRadius`). `width`/`height` `hug` é **erro**: a arrumação nunca depende da imagem baixada (o desenho é o mesmo na app, no MCP e antes de carregar). Vale dentro do `template` de um `repeat` (uma coluna `string` da `table` com a URL). `src` literal é conferido pelo parser (forma de URL `https://`); a origem, pelo validador da biblioteca.
2. **`remoteImages` na raiz da especialização (`formatVersion` 8).** `{ "origins": ["https://cdn.exemplo.com"] }`, de 1 a 20 origens exatas `https://host[:porta]`, minúsculas, sem caminho, consulta, fragmento, usuário, curinga, IP literal, `localhost`, nome sem ponto, `.local`, `.localhost` nem `.internal`; sem repetição. Um componente com `image` numa especialização sem `remoteImages` é erro (nível 2 do validador da biblioteca); um `src` literal de origem não declarada também. Campo ligado ao `src` que não é `string` (nem coluna `string` de `table`) é erro. Contrato de versão: acrescentar origem é aditivo; remover fica **fora do contrato** (como remover uma fonte).
3. **Política pura em `src/model/remoteImages.ts`.** `parseImageOrigin(text)` (mesma regra para a especialização e para o build) e `checkRemoteImageUrl(value, origins)` devolvem `{ ok: true, url, origin }` ou `{ ok: false, reason }` com `reason` em `empty | invalid | not-https | credentials | too-long | origin-not-declared`. Usa só `URL` (Node e navegador); normaliza host (minúsculas, punycode pelo `URL`) e porta 443. Testada no projeto `model` do Vitest.
4. **Lista do build.** Variável `MAPPING_IMAGE_ORIGINS` (origens separadas por vírgula), lida por `vite.config.ts`, validada com `parseImageOrigin` (origem inválida **falha o build**) e usada em dois lugares: `pwa/csp.ts` monta `img-src 'self' data: blob: <origens>` e o `verifyCsp` confere exatamente isso; e a app recebe a lista por `define` (`__IMAGE_ORIGINS__`), lida fora de `src/model/` e passada ao modelo como argumento. Sem a variável, a CSP fica igual à de hoje e a app diz "este build não carrega imagens remotas". Os workflows `deploy.yml` (principal e preview) passam `vars.MAPPING_IMAGE_ORIGINS`; o job `e2e` do `ci.yml` usa a origem de teste `https://imagens.mapping.test`. Nenhum host no código do núcleo. O `index.html` ganha `<meta name="referrer" content="no-referrer">`.
5. **Consentimento por navegador.** Guardado em `src/storage/` (IndexedDB ou `localStorage`, com try/catch), chave especialização (`id`) + origem; **nunca** no projeto, na especialização nem no zip (um projeto de terceiros não pode se autorizar). Na abertura de um projeto cujo desenho pede origem ainda sem decisão, uma faixa acima do canvas: "A biblioteca «Nome» quer carregar imagens de cdn.exemplo.com. Ao permitir, esse site fica sabendo quando você abre o projeto e de qual endereço IP." com **Permitir** e **Agora não** (vale para a sessão). Configurações ganha a seção **Privacidade**, com as permissões dadas e **Revogar**. Configurações › Sobre e o cabeçalho do "Copiar" do Diagnóstico mostram as origens do build. Vale igual no somente leitura e na revisão de propostas (as duas visões).
6. **Carregador no canvas** (`src/canvas/components/`, o único lugar que cria `Image` para URL remota; o `renderScene` recebe a imagem pronta ou o estado por uma função das opções e não faz mais `new Image()` com URL remota). `crossOrigin = 'anonymous'` (sem cookies entre origens) e `referrerPolicy = 'no-referrer'`; até 6 em paralelo; tempo limite de 20 s; recusa acima de 8192 px de lado ou 40 MP; exibe um bitmap reduzido a 2048 px no lado maior (`createImageBitmap`, como as imagens do projeto); cache em memória por URL, até 64 entradas, com o `close()` adiado para o quadro seguinte (a regra do `drawImage` da etapa 6); falha não é repetida na sessão. Estados por imagem: `loading`, `loaded`, `blocked-build`, `blocked-consent`, `invalid`, `failed`, `too-large`; todos menos `loaded` desenham o reservado de imagem que já existe (tokens do tema). Imagem que carrega pede um redesenho (no máximo um por quadro). As falhas e bloqueios aparecem no Diagnóstico (URL encurtada, motivo), uma vez por URL.
7. **Galeria do Catálogo.** Os exemplos são desenhados com as mesmas três listas; a imagem que termina de carregar invalida a entrada do cache da galeria (a chave ganha uma época de imagens, como a das fontes). `crossOrigin` garante que o `toDataURL` não falha.
8. **MCP nunca baixa.** O servidor lê o componente v3 e a especialização v8 (`validate_library` e o que lê pacotes), desenha o reservado no `get_marking_image` e devolve a URL como texto nos valores. `docs/AGENT-GUIDE.md` explica: a URL é um campo `string`; a origem precisa estar em `remoteImages.origins`; o agente nunca acrescenta origem por conta própria. MCP 0.10.0.
9. **Visualizador embutível** (`lab/viewer`, `dist-viewer/`): opção `remoteImages` desligada por padrão; ligada, segue a mesma política (especialização + lista dada pelo hospedeiro), sem consentimento próprio; a CSP é do site hospedeiro (documentar no `PACKAGE-README.md`).
10. **Skill `spec-author`**: aprende o nó `image` e `remoteImages`; só declara origem que o dono informou no pedido, nunca inventa nem deduz de uma URL achada no código.
11. **Exemplo**: uma biblioteca pequena em `examples/` com um componente de avatar (imagem + texto) e o campo da URL, validada por teste; no roteiro do Cowork usa a origem de teste combinada com o dono (decisão pendente D1).

### Fora (de propósito)

- Baixar a imagem para dentro do pacote ou do projeto (imagem local no pacote): fica para depois; o `src` recusa caminho relativo agora, para poder aceitá-lo no futuro sem ambiguidade.
- Imagem com cookie ou cabeçalho de autenticação (só URL assinada, com o token na própria URL).
- Servidor sem CORS (fica o reservado).
- Curinga de host, `http:`, `data:` vindo de campo.
- Imagem como preenchimento de `ellipse`/`path` (só o nó `image`).
- O MCP baixar a imagem (nem com opção).

### Pendentes de decisão do dono

Decisões de segurança: o agente não decide sozinho (regra do [`CLAUDE.md`](CLAUDE.md)); estão marcadas aqui e na descrição do PR. **A RI2 não começa antes de D1 e D4.**

- [ ] **D1. Quais origens entram na lista do build** (`MAPPING_IMAGE_ORIGINS`, variável do repositório no GitHub). Sugestão: só hosts do próprio dono; para o roteiro do Cowork, `https://fabianofranca.github.io` com uma imagem de teste em `public/` (de `file://` é outra origem, e o GitHub Pages manda `Access-Control-Allow-Origin: *`).
- [ ] **D2. Consentimento também para origens que já estão na lista do build.** Recomendação: sim (o `index.html` baixado pode abrir projetos de terceiros).
- [ ] **D3. Exigir CORS.** Recomendação: sim; servidor sem CORS não mostra a imagem.
- [ ] **D4. Lista do build por variável do repositório ou por arquivo versionado** (`pwa/image-origins.json`, revisado em PR). Recomendação: variável (o repositório fica genérico); o arquivo dá histórico auditável. Decidir antes da RI2.

### Fases

#### RI1 — Formato, política e MCP

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet high (parser, política de URL, validador), Sonnet medium (docs, exemplo, skill, MCP), Haiku low. Decisões 1, 2, 3, 8, 10 e 11. Sem rede nenhuma ainda: a app desenha o reservado.

**Toca em:** `src/model/remoteImages.ts` (novo), `src/model/index.ts`, `src/model/components/componentFormat.ts`, `src/model/components/parseComponent.ts`, `src/model/components/instantiate.ts`, `src/model/components/scene.ts`, `src/model/components/layout.ts`, `src/model/components/repeat.ts`, `src/model/spec.ts`, `src/model/specVersions.ts`, `src/model/library.ts`, `src/model/libraryPackage.ts`, `src/canvas/components/renderScene.ts` (sem `src` válido e liberado, desenha o reservado), `mcp/version.ts`, `mcp/specValidation.ts`, `mcp/library.ts`, `mcp/componentTools.ts`, `mcp/image/sceneRaster.ts`, `docs/component.schema.json`, `docs/spec.schema.json`, `docs/COMPONENT-FORMAT.md` (seção "Limites conhecidos"), `docs/SPEC-FORMAT.md`, `src/i18n/specHelp.ts` e `src/i18n/pt-BR.ts`/`en-US.ts` (página Ajuda → Especializações, conferida por `tests/i18n/specHelp.test.ts`), `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `.claude/skills/spec-author/SKILL.md`, `examples/libraries/` (biblioteca de exemplo nova), `tests/model/`, `tests/components/`, `tests/mcp/` (`library.test.ts`, `sceneRaster.test.ts`, `version.test.ts`), `tests/examples/`, `PLAN.md`.

- [ ] `src/model/remoteImages.ts`: `parseImageOrigin` e `checkRemoteImageUrl` com as decisões 2 e 3 (testes em `tests/model/`: origem válida, com porta, maiúsculas, punycode, porta 443 normalizada; recusa de caminho, consulta, fragmento, usuário, curinga, IP literal v4 e v6, `localhost`, nome sem ponto, `.local`, `.localhost`, `.internal`; URL `http:`, `data:`, relativa, com credenciais, com mais de 2048 caracteres, vazia; cada `reason`)
- [ ] Nó `image` no formato e no parser do componente, `formatVersion` 3 (a 1 e a 2 ainda aceitas), com `src`, `fit` e as chaves comuns; `hug` em `width`/`height` é erro; `src` literal conferido na forma `https://` (testes de `parseComponent`: v1 e v2 sem mudança, `src` ausente, `fit` inválido, `hug`, `src` relativo, `src` literal `http:`)
- [ ] `instantiate` e `scene`: o nó vira `rect` com o preenchimento `image` e o `fit`, dentro e fora de um `repeat` (teste: `$field` ligado a campo `string` e a coluna `string` da `table`; layout idêntico antes e depois de carregar)
- [ ] `remoteImages` na especialização `formatVersion` 8 (sem repetição, de 1 a 20, só origens aceitas por `parseImageOrigin`), a 7 e as anteriores aceitas sem mudança, e a regra de versão (acrescentar é aditivo, remover fora do contrato) (testes em `tests/model/`)
- [ ] Validador da biblioteca nos três níveis: componente com `image` sem `remoteImages` é erro, `src` literal de origem não declarada é erro, campo ligado que não é `string` é erro (testes do validador; `validate_library` em `tests/mcp/library.test.ts`)
- [ ] A app e o MCP desenham o reservado de imagem para o nó `image`, sem pedir nada à rede (testes de `renderScene` e de `tests/mcp/sceneRaster.test.ts`)
- [ ] JSON Schemas `docs/component.schema.json` e `docs/spec.schema.json`, `docs/COMPONENT-FORMAT.md` ("Limites conhecidos" muda), `docs/SPEC-FORMAT.md` e a página Ajuda → Especializações em pt-BR e en-US (teste `tests/i18n/specHelp.test.ts` e os testes dos schemas)
- [ ] MCP 0.10.0 em `mcp/version.ts`, `docs/MCP.md` e `docs/AGENT-GUIDE.md` (a URL é um campo `string`, a origem precisa estar em `remoteImages.origins`, o agente nunca acrescenta origem por conta própria; o MCP nunca baixa) (teste `tests/mcp/version.test.ts`)
- [ ] Skill `spec-author` com o nó `image` e `remoteImages`, e a regra de só declarar origem informada pelo dono (revisão do `SKILL.md`; sem teste automático além do `validate_library` do exemplo)
- [ ] Biblioteca de exemplo em `examples/libraries/` com um componente de avatar (imagem + texto) e o campo da URL, validada por teste (`tests/examples/`)
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

#### RI2 — Build e CSP

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet high, Haiku low. Decisão 4. **Só começa depois de D1 e D4 decididas pelo dono.**

**Toca em:** `vite.config.ts`, `pwa/csp.ts`, `pwa/build.ts`, `index.html`, `pwa/sw.js` (só conferir, não deve mudar), `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `src/vite-env.d.ts` (ou o arquivo de tipos dos `define`, para `__IMAGE_ORIGINS__`), `tests/app/cspBuild.test.ts`, `tests/e2e/csp.spec.ts`, `tests/e2e/cspServiceWorker.spec.ts`, `tests/tooling/ciConfig.test.ts`, `docs/ARCHITECTURE.md` (tabela da CSP e o modelo de ameaças acima), `docs/ROADMAP.md` (a linha da CSP da etapa 2.4), `PLAN.md`.

- [ ] `MAPPING_IMAGE_ORIGINS` lida por `vite.config.ts` e validada com `parseImageOrigin` (teste em `tests/app/cspBuild.test.ts`: sem variável, uma origem, várias, origem inválida falha o build)
- [ ] `pwa/csp.ts` monta `img-src 'self' data: blob: <origens>` e o `verifyCsp` confere exatamente isso; sem a variável a CSP fica igual à de hoje (mesmo teste; `connect-src 'none'` e o resto da CSP intactos)
- [ ] A lista chega à app por `define` (`__IMAGE_ORIGINS__`), lida fora de `src/model/` e passada ao modelo como argumento; sem a variável, "este build não carrega imagens remotas" (teste de unidade do leitor da lista)
- [ ] `<meta name="referrer" content="no-referrer">` no `index.html` (teste do build)
- [ ] Workflows `deploy.yml` (principal e preview) passam `vars.MAPPING_IMAGE_ORIGINS`; o job `e2e` do `ci.yml` usa `https://imagens.mapping.test` (teste `tests/tooling/ciConfig.test.ts`)
- [ ] O service worker não intercepta requisição de outra origem (teste ponta a ponta em `tests/e2e/cspServiceWorker.spec.ts`)
- [ ] `docs/ARCHITECTURE.md` com a tabela da CSP e o modelo de ameaças; `docs/ROADMAP.md` com a linha da CSP da etapa 2.4 atualizada
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### RI3 — Carregador, consentimento e canvas

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium (high no carregador), Haiku low. Decisões 5, 6 e 7.

**Toca em:** `src/canvas/components/imageLoader.ts` (novo), `src/canvas/components/renderScene.ts`, `src/canvas/components/componentLayer.ts`, `src/canvas/components/exampleImages.ts`, `src/canvas/components/screenRenderer.ts`, `src/canvas/CanvasController.ts`, `src/ui/catalog/renderer.ts`, `src/storage/imagePermissions.ts` (novo; consentimento, com try/catch), `src/store/imagePermissions.ts` (novo; sinais e ações do consentimento), `src/store/banners.ts`, `src/store/diagnostics.ts`, `src/ui/Banner.tsx` (referência da faixa) e `src/ui/ImageConsentBanner.tsx` (novo), `src/app/App.tsx` ou `src/app/CanvasNotices.tsx` (onde a faixa entra), `src/ui/SettingsDialog.tsx` (seção Privacidade e Sobre), `src/ui/DiagnosticsView.tsx` (cabeçalho do "Copiar" e as falhas), `src/theme/tokens.ts` (se faltar token), `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `tests/canvas/components/`, `tests/storage/`, `tests/components/` (faixa, Configurações, Diagnóstico, `about.test.tsx`), `tests/e2e/remoteImages.spec.ts` (novo), `PLAN.md`.

- [ ] Carregador em `src/canvas/components/` com `crossOrigin = 'anonymous'`, `referrerPolicy = 'no-referrer'`, 6 em paralelo, tempo limite de 20 s, recusa acima de 8192 px de lado ou 40 MP, bitmap reduzido a 2048 px, cache em memória de até 64 entradas com `close()` adiado para o quadro seguinte, falha não repetida na sessão (testes de unidade com `Image` falso: cada estado, concorrência, tempo limite, despejo, falha única)
- [ ] `renderScene` recebe a imagem pronta ou o estado por uma função das opções e não cria mais `Image` para URL remota; os estados diferentes de `loaded` desenham o reservado, com tokens do tema (testes de `renderScene` e do `CanvasController`)
- [ ] Imagem que carrega pede um redesenho, no máximo um por quadro (teste de `CanvasController` e do orçamento em `tests/canvas/renderPerformance.test.ts`)
- [ ] Consentimento por navegador em `src/storage/` (chave especialização `id` + origem, nunca no projeto, na especialização nem no zip; `localStorage`/IndexedDB em try/catch) (testes de `tests/storage/`, inclusive armazenamento indisponível e zip exportado sem a permissão)
- [ ] Faixa de consentimento acima do canvas com **Permitir** e **Agora não** (vale para a sessão), igual no somente leitura e nas duas visões da revisão (testes de componente)
- [ ] Configurações › Privacidade com as permissões dadas e **Revogar**; Configurações › Sobre e o cabeçalho do "Copiar" do Diagnóstico mostram as origens do build (testes de componente, `about.test.tsx` e `DiagnosticsView.test.tsx`)
- [ ] Falhas e bloqueios no Diagnóstico (URL encurtada, motivo), uma vez por URL (teste de `src/store/diagnostics.ts`)
- [ ] Galeria do Catálogo com as mesmas três listas e a época de imagens na chave do cache; `toDataURL` não falha com `crossOrigin` (testes em `tests/components/catalog/` e `tests/canvas/exampleImages.test.ts`)
- [ ] Textos em pt-BR e en-US, sem string fixa (teste de paridade de `tests/i18n/`)
- [ ] Ponta a ponta em `tests/e2e/remoteImages.spec.ts` com o Playwright respondendo `https://imagens.mapping.test/**` por `page.route`: com CORS, sem CORS, origem fora da especialização sem nenhuma requisição, origem fora do build sem nenhuma requisição, permitir, agora não, revogar, imagem grande demais e tempo limite
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build`

#### RI4 — Visualizador, roteiro e fechamento técnico

**Coordenador:** Sonnet. **Esforço:** medium; subagentes Sonnet medium, Haiku low. Decisão 9.

**Toca em:** `lab/viewer/viewer.ts`, `lab/viewer/host.ts`, `lab/viewer/index.ts`, `lab/viewer/react.tsx`, `lab/viewer/PACKAGE-README.md`, `tests/lab/viewer/`, `docs/TESTING.md` (seção 8, roteiro R14 novo), `tests/tooling/testingGuide.test.ts`, `docs/history/PLAN-etapa-imagens-remotas.md` (novo, no fechamento), `CLAUDE.md`, `docs/ROADMAP.md`, `PLAN.md`.

- [ ] Visualizador embutível com a opção `remoteImages` desligada por padrão; ligada, segue a política (especialização + lista dada pelo hospedeiro), sem consentimento próprio; a CSP é do site hospedeiro, documentada no `PACKAGE-README.md` (testes em `tests/lab/viewer/`: desligada não pede nada à rede, ligada só pede origem declarada e na lista)
- [ ] Roteiro R14 em `docs/TESTING.md` (seção 8), executável pelo agente sozinho (extensão do navegador, `dialog-pilot`, shell, cliente MCP por stdio), com a origem de teste decidida em D1 (teste `tests/tooling/testingGuide.test.ts`)
- [ ] PR da RI4 aberto com o rótulo `mcp-rc` (última fase do épico; sem ele, rodar à mão o workflow MCP pre-release no `epic/imagens-remotas`)
- [ ] Rodada dirigida do Cowork com o R14, e o relato entre os documentos da etapa
- [ ] Fechamento: histórico em `docs/history/PLAN-etapa-imagens-remotas.md`, `CLAUDE.md` e `docs/ROADMAP.md` (quando o dono decidir mesclar o épico)
- [ ] Validação: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:mcp`

## Etapa — Marcações espaciais, notas e setas (concluída, épico `epic/marcacoes-espaciais`)

> Fases ME0 a ME5 entregues no épico (schema v13, especialização `formatVersion` 7, proposta `formatVersion` 3, componente `formatVersion` 2 e MCP 0.9.0). O objetivo, os conceitos, as 14 decisões, as regras de contenção, a revisão adversarial, as fases ME0 a ME4, as decisões consolidadas dos PRs e o que ficou para depois estão em [`docs/history/PLAN-etapa-marcacoes-espaciais.md`](docs/history/PLAN-etapa-marcacoes-espaciais.md). O protocolo da cascata noturna e do gerente da manhã está em `docs/history/PLAN-etapa-marcacoes-espaciais.md`, seção "Execução em cascata"; uma nova cascata o copia para o `PLAN.md` ao detalhar a etapa.

