# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, as da etapa Código de instanciação, no fim do documento; a etapa Biblioteca foi a última concluída). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema), 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) e 10 (correções da rodada dirigida da etapa 9) concluídas**, além do laboratório de componentes e da etapa **Biblioteca** (schema v10; servidor MCP 0.5.0). O dono fez uso real grande e considerou o marco "Uso real" **alcançado em 2026-10-16**: a ferramenta já serve e a prioridade passou à biblioteca de componentes, hoje entregue. O **laboratório de componentes** está concluído (épico `epic/lab` mesclado em 2026-10-17; descrição em [`lab/README.md`](lab/README.md), histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)). A etapa **Biblioteca** (épico `epic/biblioteca`, fases B1 a B5 e Fechamento) está concluída, testada pelo Cowork e mesclada na `main` (PR #180, tag `mcp-v0.5.0`; histórico em [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md)). A etapa em andamento é **Código de instanciação** (épico `epic/instanciacao`, fases C1 a C3, MCP 0.6.0), detalhada no fim deste documento. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/GUIDE.md`](docs/GUIDE.md)                         | Guia interativo (`guia/`) e projeto de exemplo: geração, o que gravam, como mudar |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v10)                                      |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização, `formatVersion` 1 a 4 (e `docs/spec.schema.json`): biblioteca, contrato de versão e validação |
| [`docs/COMPONENT-FORMAT.md`](docs/COMPONENT-FORMAT.md)   | Formato do arquivo de componente (`mapping-component`): nós, dimensionamento, expressões, avisos do motor |
| [`docs/component.schema.json`](docs/component.schema.json) | JSON Schema do arquivo de componente (documentação; o código é a fonte da verdade) |
| [`docs/MCP.md`](docs/MCP.md)                             | Servidor MCP: instalação, `.mcp.json`, raízes, tools, referências, problemas   |
| [`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)             | Guia do agente: como usar as tools do servidor MCP (também servido como recurso) |
| [`docs/TESTING.md`](docs/TESTING.md) | Guia do testador: onde pegar a app, requisitos, mapa da interface, MCP, roteiros de teste manual, teste manual avançado (seção 9), templates do relato e do registro de uso real e os apêndices do agente e de disco |
| [`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md) | Prompt vivo do testador do Cowork (rodada completa ou dirigida; o agente lê o guia com o apêndice A) |
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
| [`docs/history/PLAN-etapa-8.md`](docs/history/PLAN-etapa-8.md) | Histórico: etapa 8, consolidação por subsistema (fases 8.1 a 8.7 concluídas; decisões consolidadas dos PRs, auditoria e portão; ao lado, as notas de desenho em `docs/history/etapa-8-notas/`, a segunda leitura `auditoria-etapa-8.md` e o prompt do coordenador) |
| [`docs/history/PLAN-etapa-9.md`](docs/history/PLAN-etapa-9.md) | Histórico: etapa 9, ajustes do teste manual avançado (fases 9.1 a 9.7 concluídas; decisões consolidadas dos PRs; schema v9 e MCP 0.4.0) |
| [`docs/history/PLAN-etapa-10.md`](docs/history/PLAN-etapa-10.md) | Histórico: etapa 10, correções da rodada dirigida da etapa 9 (fases 10.1 e 10.2 concluídas; decisões consolidadas dos PRs #154 e #155 e do fechamento) |
| [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md) | Histórico: laboratório de componentes, fases L1 e L2 concluídas; decisões registradas que a etapa Biblioteca herda |
| [`docs/history/PLAN-etapa-biblioteca.md`](docs/history/PLAN-etapa-biblioteca.md) | Histórico: etapa Biblioteca, fases B1 a B5 e Fechamento concluídas; decisões consolidadas dos PRs, rodada do Cowork do Fechamento (e reteste) e o que ficou para depois |
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas (etapa Biblioteca concluída), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

## Etapa em andamento — Código de instanciação (épico `epic/instanciacao`)

### Objetivo

Corrigir o **conceito** do `code` das especializações em tudo que um agente lê. O `code` de um tipo diz, por plataforma, **com que código se cria uma instância daquele componente na solução**: o `symbol` é o que se chama (um composable, uma view, uma classe, a função do BFF que gera o JSON de SDUI), o `path` é o arquivo que define esse símbolo (para ler a assinatura antes de usá-lo), `params` dizem com que nome cada campo do tipo é passado, `values` traduzem os valores dos `enum` e `notes` orientam. O mapeamento **não sabe onde a solução está nem o que foi gerado**; esse conceito não existe no produto.

Hoje os agentes leem o `code` como "o código gerado para esta anotação". A análise de 2026-10-19 achou a causa em quatro lugares: (1) o MCP entrega o `code` dentro de cada anotação e o `get_code_hints` põe `path`, `localFile` e `exists` ao lado de cada instância; (2) o vocabulário é de geração ("o que implementar", "como o tipo vira código", "componente que implementa o tipo", "ligar marcações a código", "planta de código"); (3) o conceito aparece quase só pela negação ("não onde o código gerado ficou"), e a frase positiva existe uma vez, no `AGENT-GUIDE.md`; (4) o único exemplo com `code` (`examples/specs/sdui.json`) tem a plataforma `bff` com `symbol` igual ao nome do nó JSON (`"onClick"`, `"image"`), que é o formato de saída, e não o código que o cria.

Sem schema novo, sem `formatVersion` nova e sem renomear as chaves do formato (`code`, `symbol`, `path`, `params`, `values`, `notes`): o que muda é a definição em cada documento, os textos da app, o exemplo, a skill e a forma das respostas do MCP (0.6.0).

### Decisões

- **Frase canônica** (vale para todos os documentos, na mesma ordem de ideias): "O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define, `params` e `values` dizem como passar os campos, `notes` orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução." Cada documento pode encurtar, não inverter. A negação ("não é o código gerado") pode ficar como complemento, nunca como a única explicação.
- **Vocabulário:** "código de instanciação", "instanciar", "o que se chama", "chamada". Saem das definições e das descrições de tools: "implementar", "o que implementar", "vira código", "componente que implementa o tipo", "ligar marcações a código", "planta de código", "repositório do código da plataforma". Identificadores do código (`codeBlueprint`, `codeHintsView`, `CodeDefinitions`) **não** mudam: renomear custa um PR mecânico e não muda o que o agente lê.
- **Plataforma** é um alvo de código em que o agente escreve a solução (Android, iOS, o BFF). A `bff` do exemplo continua plataforma, com `language: "kotlin"` e `symbol` apontando para a função que gera o JSON (`com.app.bff.sdui.button`, com `path`), não para o nome do nó.
- **`platformRepos`** é o repositório onde está o código de instanciação de cada plataforma (o design system, o SDK, a biblioteca do BFF; pode ser o próprio repositório do app). O exemplo do `localPath` nos docs deixa de sugerir que o mapeamento mora "dentro do repositório do app" como regra.
- **Uma forma só de entrada de `code` nas respostas do MCP** (`get_marking`, `get_annotation`, `find_by_code`, `get_component` e o `types` do `get_code_hints`): `{ symbol, definition: { path, url, localFile, exists, localFileProblem? } | null, params?, values?, notes? }`. O arquivo resolvido sai de dentro da entrada e vai para `definition` (o mesmo nome da linha "Definição" da app). Sem `path`, `definition` é `null`.
- **`get_code_hints` separa o tipo da instância.** A resposta ganha `types` (por `specId/typeId`: `name`, `symbol`, `definition`, `params`, `values`, `notes`), e na árvore cada anotação traz `ref`, `type` (`specId/typeId`), `label`, `layer`, `args` (`[{ field, name, value }]`, os valores da instância já traduzidos), `values` e `linked`; **nenhum arquivo por anotação**. `unmappedTypes` e `symbol: null` continuam. A tool continua existindo porque os `args` por instância são exatamente a chamada a escrever; a descrição passa a dizer isso ("as chamadas a escrever, por marcação, com o código de instanciação de cada tipo").
- **MCP 0.6.0** (uma versão por épico): as descrições das três tools e as instruções do servidor mudam de vocabulário, e a forma das respostas acima muda. Nomes das tools inalterados. Projetos e especializações não mudam.
- **Aceite da etapa é uma pergunta ao agente**, não só os gates: numa sessão do Claude Code limpa, com o servidor 0.6.0 e sem outra orientação, "O que é o `code` do tipo Button desta especialização e para que serve o `path`?" tem que responder "o código com que se cria uma instância do Button na plataforma; o arquivo que define esse símbolo, para ler a assinatura", sem falar em código gerado para a anotação. A pergunta vira passo do R3 e entra na rodada dirigida do Cowork.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar): C1 **Opus**, high (subagentes Sonnet medium; o briefing do `SPEC-FORMAT.md` high; mecânicos Haiku low); C2 **Sonnet**, medium (subagentes medium; o briefing do `AGENT-GUIDE.md` high); C3 **Sonnet**, low (subagentes low).
- **Fluxo:** épico `epic/instanciacao` a partir da `main` (que já tem a Biblioteca, PR #180, e a tag `mcp-v0.5.0`); um branch e um PR por fase com base no épico; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`; `npm run build:mcp` na C2); descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR; a C3 leva o rótulo `mcp-rc`.

### Fases

#### C1 — O conceito no formato, no exemplo e na app

**Coordenador:** Opus. A fase é texto: as definições que todo o resto cita. **Esforço:** high; subagentes Sonnet medium (o briefing do `SPEC-FORMAT.md` high); mecânicos Haiku low.

**Toca em:** `docs/SPEC-FORMAT.md` (seção "Plataformas e code": a frase canônica abre a seção; `platforms` como alvo de código; `symbol` = "o que se chama para criar uma instância"; `path` = "o arquivo que define o `symbol`, para ler a assinatura"; o exemplo comentado), `docs/spec.schema.json` (descrições), `src/i18n/specHelp.ts` (a mesma seção; o teste `tests/i18n/specHelp.test.ts` exige os mesmos títulos e blocos), `src/i18n/pt-BR.ts` e `en-US.ts` (`help.code.*`, `repos.title`/`repos.intro`/`repos.localPathHint`, `code.definitionHint`), `docs/FORMAT.md` (seção "Campos da v7": `platformRepos` como repositório do código de instanciação; o exemplo do `localPath`; a nota 7 de "Lendo uma anotação"), `examples/specs/sdui.json` (plataforma `bff`: `name`, `language: "kotlin"`, `symbol` e `path` das funções que geram o JSON; `notes` dizendo que a função devolve o nó), `examples/exemplo-completo/specs/sdui.json` (a mesma mudança) e os gerados `examples/exemplo-completo.zip` e `public/guia/index.html` (`npm run build:example` e `npm run build:guia`), `tests/model/spec.test.ts`, `tests/model/codeLocations.test.ts`, `tests/components/CodeDefinitions.test.tsx` e `tests/examples/*.test.ts` (o nome e a linguagem da `bff`), `docs/TESTING.md` (R3.2 e R3.3: o nome da plataforma e a linha "Definição"), `.claude/skills/spec-author/SKILL.md` (seção 6 com a frase canônica; na lista de erros: "symbol com o nome do nó de saída em vez da função que o gera"; o prompt-modelo pede, por plataforma, o que se chama e onde está), `examples/workspace/AGENTS.md` (o comentário de exemplo do propósito), `README.md` (a linha "Código das especializações"), `docs/ARCHITECTURE.md` (os parágrafos de `codeLocations.ts`/`codeBlueprint.ts` e de `CodeDefinitions.tsx`), `src/model/codeBlueprint.ts` (o comentário de cabeçalho).

- [ ] `SPEC-FORMAT.md` e a Ajuda › Especializações abrem a seção "Plataformas e code" com a frase canônica; `symbol`, `path`, `params`, `values` e `notes` definidos pelo que o agente faz com cada um; `platforms` definido como alvo de código; o exemplo comentado da SDUI com a `bff` nova
- [ ] `FORMAT.md` (v7) e os textos de Configurações › Repositórios de código dizem que o repositório é onde está o código de instanciação da plataforma; nenhum exemplo apresenta "dentro do repositório do app" como regra
- [ ] `examples/specs/sdui.json` e a cópia do exemplo completo com a `bff` apontando para funções (`symbol` e `path`); zip e guia regerados; os testes que fixam "Contrato SDUI" atualizados; R3.2 e R3.3 do guia conferem o nome novo
- [ ] Skill `spec-author`: seção 6, lista de erros e prompt-modelo com o conceito; a revisão final pergunta "cada `symbol` é o que se chama para criar a instância?"
- [ ] `README.md`, `ARCHITECTURE.md`, `AGENTS.md` do workspace e o comentário do `codeBlueprint.ts` sem o vocabulário que sai; `grep -rn "vira código\|implementa o tipo\|ligar marcações a código\|planta de código" docs/*.md README.md src .claude examples/workspace` só encontra `docs/history/`
- [ ] Nenhuma string de UI fora do `t()`; `tests/theme/tokenLiterals.test.ts` e `tests/i18n/*` passando

**Aceite:** quem lê só o `SPEC-FORMAT.md` (ou a Ajuda da app) sabe o que é o `code` na primeira frase da seção; o projeto de exemplo abre com a `bff` nova e a linha "Definição" do Button mostra as três plataformas com arquivo; gates verdes.

#### C2 — MCP 0.6.0 e o guia do agente

**Coordenador:** Sonnet. A forma das respostas está decidida acima; a fase implementa e reescreve o guia com ela. **Esforço:** medium; subagentes medium (o briefing do `AGENT-GUIDE.md` high).

**Toca em:** `mcp/version.ts` (0.6.0), `mcp/server.ts` (instruções: "Para escrever a solução a partir de uma marcação, `get_code_hints(ref, plataforma)` dá as chamadas a escrever com o código de instanciação de cada tipo"), `mcp/tools.ts` (descrições de `get_marking`, `get_code_hints`, `find_by_code`, `get_component` e do argumento `platform`), `mcp/codeViews.ts` (`definition`; `types` e `args` no `codeHintsView`), `mcp/views.ts` e `mcp/findByCode.ts` (a entrada de `code` na forma única), `mcp/componentTools.ts` (`code` do `get_component` na mesma forma), `mcp/docs.ts` (descrições dos recursos), `src/model/codeBlueprint.ts` (se a árvore precisar expor o tipo por anotação sem o arquivo; função pura, com teste), `docs/AGENT-GUIDE.md` ("Conceitos que importam" e a seção "Do mapeamento ao código" inteira: título, fluxo, exemplos JSON na forma nova, `find_by_code` como "que tipos se instanciam com este arquivo ou símbolo, e onde estão marcados"), `docs/MCP.md` (a linha de "Código", a seção "Publicar uma versão" com 0.6.0 e a seção "Mudança da 0.6.0"), `examples/workspace/README.md` (seção "Ligar marcações a código" renomeada) e `AGENTS.md` (a regra "Código"), `tests/mcp/code.test.ts`, `tests/mcp/version.test.ts`, `tests/mcp/read.test.ts` e `tests/model/codeBlueprint.test.ts`.

- [ ] Entrada de `code` na forma única em `get_marking`, `get_annotation`, `find_by_code` e `get_component` (`definition` com o arquivo resolvido ou `null`); testes
- [ ] `get_code_hints` com `types` por `specId/typeId` e a árvore com `type` e `args` por anotação, sem arquivo por instância; `unmappedTypes` e `symbol: null` como hoje; testes (inclusive o Screen sem `code` e a plataforma sem repositório)
- [ ] Instruções do servidor, descrições das tools e dos recursos com o vocabulário da etapa; o servidor continua sem ler nem gravar código (`tests/mcp/noCodeRead.test.ts`)
- [ ] `AGENT-GUIDE.md` reescrito: a frase canônica em "Conceitos que importam", o fluxo "escrever a solução a partir de uma tela" (ler `types`, abrir cada `definition`, escrever as chamadas com os `args`), exemplos na forma nova, nenhum passo sobre código gerado nem pela negação como única explicação
- [ ] `docs/MCP.md` com 0.6.0 e a seção "Mudança da 0.6.0" (o que mudou de forma e por quê); `tests/mcp/version.test.ts` verde; `npm run build:mcp` gera o bundle
- [ ] `examples/workspace/` com a seção e a regra renomeadas

**Aceite:** num repositório de teste com o `sdui.json` novo, `get_code_hints` do Formulário na plataforma `bff` devolve em `types` a função de cada tipo com `definition` e, na árvore, só `args` por anotação; `get_marking` do Button traz `code.android.definition.path`; gates verdes e `dist-mcp/mapping-mcp.js --version` imprime 0.6.0.

#### C3 — Prova do conceito e fechamento

**Coordenador:** Sonnet. Guia, rodada do Cowork e histórico. **Esforço:** low; subagentes low.

**Toca em:** `docs/TESTING.md` (R3.6: a pergunta de conceito ao agente, com a resposta esperada e o que a reprova; a seção 6 se o `.mcp.json` ou a versão mudarem), `docs/TESTING-COWORK.md` (rodada dirigida: R3 inteiro, R5.3 e a pergunta de conceito), `docs/ROADMAP.md`, `CLAUDE.md`, `PLAN.md`, novo `docs/history/PLAN-etapa-instanciacao.md`.

- [ ] R3.6 com a pergunta de conceito: a resposta esperada cita instanciar e a assinatura; reprova se falar de código gerado para a anotação ou de onde a instância foi implementada
- [ ] Rodada dirigida do Cowork executada sobre o build do épico (R3, R5.3 e a pergunta), relato em `docs/history/relato-<data>-instanciacao.md`; achados corrigidos no épico antes do merge
- [ ] Rótulo `mcp-rc` no PR desta fase; a rc `mcp-v0.6.0-rc.<n>` sai no merge; a estável `mcp-v0.6.0` é tag do dono depois do merge do épico na `main`
- [ ] Esta seção vai para `docs/history/PLAN-etapa-instanciacao.md` com as decisões consolidadas dos PRs e o relato; `PLAN.md` sem etapa em andamento; `ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** a pergunta de conceito passa na rodada do Cowork; o dono mescla o épico.
