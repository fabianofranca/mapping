# Histórico — Etapa Código de instanciação (seção do antigo PLAN.md)

> Fases C1 a C4 concluídas no épico `epic/instanciacao` (PRs #181 a #185, #188 e #189; o épico é o PR #190). Origem: a análise de 2026-10-19 sobre como os agentes liam o `code` das especializações. A rodada dirigida do Cowork está em [`relato-2026-10-20-instanciacao.md`](relato-2026-10-20-instanciacao.md) e o reteste do R3.6a no Claude Code em [`relato-2026-10-20-instanciacao-reteste.md`](relato-2026-10-20-instanciacao-reteste.md). Referência atual: [`../SPEC-FORMAT.md`](../SPEC-FORMAT.md) (`formatVersion` 5), [`../FORMAT.md`](../FORMAT.md) (schema v11), [`../MCP.md`](../MCP.md) (0.6.0) e [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da C4 (marcados ao fechar a etapa; a tag estável `mcp-v0.6.0` e o merge do épico na `main` ficam com o dono). Depois dela vêm as decisões consolidadas dos PRs, a rodada do Cowork e o reteste, e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Etapa em andamento — Código de instanciação (épico `epic/instanciacao`)

### Objetivo

Corrigir o **conceito** do `code` das especializações em tudo que um agente lê. O `code` de um tipo diz, por plataforma, **com que código se cria uma instância daquele componente na solução**: o `symbol` é o que se chama (um composable, uma view, uma classe, a função do BFF que gera o JSON de SDUI), o `path` é o arquivo que define esse símbolo (para ler a assinatura antes de usá-lo), `params` dizem com que nome cada campo do tipo é passado, `values` traduzem os valores dos `enum` e `notes` orientam. O mapeamento **não sabe onde a solução está nem o que foi gerado**; esse conceito não existe no produto.

Hoje os agentes leem o `code` como "o código gerado para esta anotação". A análise de 2026-10-19 achou a causa em cinco lugares: (1) o MCP entrega o `code` dentro de cada anotação e o `get_code_hints` põe `path`, `localFile` e `exists` ao lado de cada instância; (2) o vocabulário é de geração ("o que implementar", "como o tipo vira código", "componente que implementa o tipo", "ligar marcações a código", "planta de código"); (3) o conceito aparece quase só pela negação ("não onde o código gerado ficou"), e a frase positiva existe uma vez, no `AGENT-GUIDE.md`; (4) o único exemplo com `code` (`examples/specs/sdui.json`) tem a plataforma `bff` com `symbol` igual ao nome do nó JSON (`"onClick"`, `"image"`), que é o formato de saída, e não o código que o cria; (5) o repositório de cada plataforma fica **no projeto** (`platformRepos`, `set_platform_repo`), então a especialização não leva o caminho completo do código que ela mesma cita, cada projeto repete a configuração e o `path` fica relativo a uma raiz que a especialização não conhece. Esse último ponto é o resquício da etapa 3b, em que a plataforma era "o app" e o repositório era o dele.

A etapa muda a definição em cada documento, os textos da app, o exemplo, a skill, a forma das respostas do MCP (0.6.0) e **onde fica o repositório**: ele passa para a declaração da plataforma na especialização (`formatVersion` 5) e o projeto guarda só a sobreposição local (schema v11). As chaves `code`, `symbol`, `path`, `params`, `values` e `notes` não mudam de nome.

### Decisões

- **Frase canônica** (vale para todos os documentos, na mesma ordem de ideias): "O `code` de um tipo diz como se cria uma instância dele em cada plataforma: `symbol` é o que se chama, `path` é o arquivo que o define, `params` e `values` dizem como passar os campos, `notes` orienta. O agente lê o arquivo para saber a assinatura e escreve a chamada na solução. O mapeamento não guarda nada sobre a solução." Cada documento pode encurtar, não inverter. A negação ("não é o código gerado") pode ficar como complemento, nunca como a única explicação.
- **Vocabulário:** "código de instanciação", "instanciar", "o que se chama", "chamada". Saem das definições e das descrições de tools: "implementar", "o que implementar", "vira código", "componente que implementa o tipo", "ligar marcações a código", "planta de código", "repositório do código da plataforma". Identificadores do código (`codeBlueprint`, `codeHintsView`, `CodeDefinitions`) **não** mudam: renomear custa um PR mecânico e não muda o que o agente lê.
- **Plataforma** é um alvo de código em que o agente escreve a solução (Android, iOS, o BFF). A `bff` do exemplo continua plataforma, com `language: "kotlin"` e `symbol` apontando para a função que gera o JSON (`com.app.bff.sdui.button`, com `path`), não para o nome do nó.
- **O repositório é da biblioteca, logo da especialização** (`formatVersion` 5): cada entrada de `platforms` pode ter `repo: { url, urlTemplate?, ref? }`. `url` é o endereço do repositório (`http(s)://`); `urlTemplate` é o modelo do endereço de um arquivo, com `{path}` (o mesmo formato de hoje; sem ele, a app e o MCP não montam link); `ref` é a revisão (tag, branch ou commit) da biblioteca a que o `code` corresponde, informativa. `path` continua relativo à raiz desse repositório. Plataforma em que algum tipo tem `path`, sem `repo`, é **aviso de validação da especialização** (`validate_specialization`, importação da app), não mais aviso do projeto. Plataformas com o mesmo `id` em especializações diferentes continuam sendo o mesmo alvo; cada especialização declara o repositório da própria biblioteca, e eles podem diferir. As `formatVersion` 1 a 4 continuam válidas (sem `repo`); o JSON Schema e a regra "`formatVersion` é a mínima para o que a especialização usa" passam a cobrir a 5.
- **O projeto só sobrepõe o lugar local** (schema v11): `platformRepos[<plataforma>]` fica só com `localPath` (raiz do clone, relativa à pasta do projeto). O `urlTemplate` sai do projeto; o endereço vem sempre da especialização. A migração v10 → v11 descarta o `urlTemplate` de cada entrada (e a entrada que só tinha ele), com backup em `backups/` como toda migração, e o Diagnóstico registra o que foi descartado com a orientação "regrave a especialização com `repo`". `set_platform_repo { platform, localPath }` e `remove_platform_repo` continuam no MCP; Configurações › Repositórios de código vira só o caminho local, listando o `repo` de cada plataforma como leitura. O aviso `missing-repo` do projeto sai (a plataforma sem caminho local não é problema: o agente usa a URL).
- **Uma forma só de entrada de `code` nas respostas do MCP** (`get_marking`, `get_annotation`, `find_by_code`, `get_component` e o `types` do `get_code_hints`): `{ symbol, definition: { path, url, ref, localFile, exists, localFileProblem? } | null, params?, values?, notes? }`. `url` e `ref` vêm do `repo` da especialização; `localFile` e `exists` da sobreposição local do projeto (`null` sem ela; a conferência continua confinada ao diretório de trabalho do cliente, e o servidor continua sem ler código). Sem `path`, `definition` é `null`.
- **`get_code_hints` separa o tipo da instância.** A resposta ganha `types` (por `specId/typeId`: `name`, `symbol`, `definition`, `params`, `values`, `notes`), `repos` (por plataforma da resposta: `url`, `ref`, `localPath`), e na árvore cada anotação traz `ref`, `type` (`specId/typeId`), `label`, `layer`, `args` (`[{ field, name, value }]`, os valores da instância já traduzidos), `values` e `linked`; **nenhum arquivo por anotação**. `unmappedTypes` e `symbol: null` continuam. A tool continua existindo porque os `args` por instância são exatamente a chamada a escrever; a descrição passa a dizer isso ("as chamadas a escrever, por marcação, com o código de instanciação de cada tipo").
- **MCP 0.6.0** (uma versão por épico): descrições das tools e instruções do servidor com o vocabulário novo, a forma das respostas acima, `set_platform_repo` sem `urlTemplate`, `get_project` e `get_specialization` mostrando o `repo` das plataformas. Nomes das tools inalterados.
- **Aceite da etapa é uma pergunta ao agente**, não só os gates: numa sessão do Claude Code limpa, com o servidor 0.6.0 e sem outra orientação, "O que é o `code` do tipo Button desta especialização, para que serve o `path` e onde está esse arquivo?" tem que responder "o código com que se cria uma instância do Button na plataforma; o arquivo que define esse símbolo, para ler a assinatura; no repositório `repo.url` da especialização (ou no clone local do projeto)", sem falar em código gerado para a anotação. A pergunta vira passo do R3 e entra na rodada dirigida do Cowork.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar): C1 **Opus**, high (subagentes Sonnet medium; os briefings do validador, da migração e do `SPEC-FORMAT.md` high; mecânicos Haiku low); C2 **Sonnet**, medium (subagentes medium; mecânicos Haiku low); C3 **Sonnet**, medium (subagentes medium; o briefing do `AGENT-GUIDE.md` high); C4 **Sonnet**, low (subagentes low).
- **Fluxo:** épico `epic/instanciacao` a partir da `main` (que já tem a Biblioteca, PR #180, e a tag `mcp-v0.5.0`); um branch e um PR por fase com base no épico; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`; `npm run build:mcp` na C3; o e2e local quando a fase toca Configurações ou a linha "Definição"); descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR; a C4 leva o rótulo `mcp-rc`.

### Fases

#### C1 — Formato e modelo: `repo` na especialização, sobreposição local no projeto

**Coordenador:** Opus. Fecha o formato (`formatVersion` 5 e schema v11) e as definições que todo o resto cita. **Esforço:** high; subagentes Sonnet medium (os briefings do validador, da migração e do `SPEC-FORMAT.md` high); mecânicos Haiku low.

**Toca em:** `src/model/spec.ts` (`formatVersion` 5: `repo` em `platforms[]`, com as regras de `url`, `urlTemplate` e `ref`; v1 a v4 sem mudança), `src/model/specWarnings.ts` (aviso: plataforma com `path` sem `repo`; sai o aviso de projeto), `src/model/types.ts`, `src/model/schema.ts` e `src/model/migrations.ts` (schema **v11**: `platformRepos[x]` só com `localPath`; migração v10 → v11 com backup e a lista do que foi descartado), `src/model/codeLocations.ts` (`projectPlatforms` levando o `repo` da especialização; `codeLink` pelo `urlTemplate` da especialização; `codeLocalPath` pela sobreposição do projeto; `platformRepoWarnings` sai; `setPlatformRepo` só com `localPath`), `src/model/codeBlueprint.ts` (`repo` da plataforma com `url`, `ref` e `localPath`), `src/model/typedDisplay.ts` (`typeCodeDefinitions` com o link pela especialização), `src/store/derived.ts` (sem `platformRepoWarnings`), `src/store/project.ts`, `src/ui/PlatformRepos.tsx` (só o caminho local; o `repo` de cada plataforma em leitura), `src/ui/SpecsDialog.tsx` (plataformas com `repo`), `src/ui/DiagnosticsView.tsx` (o descartado pela migração), `src/i18n/pt-BR.ts`, `en-US.ts` e `specHelp.ts` (textos de Configurações, da Ajuda e da seção "Plataformas e code"), `docs/SPEC-FORMAT.md` (a seção "Plataformas e code" reescrita: a frase canônica abre a seção; `platforms` como alvo de código com `repo`; `symbol` = "o que se chama para criar uma instância"; `path` = "o arquivo que define o `symbol`, para ler a assinatura"; a `formatVersion` 5 nas regras e na introdução), `docs/spec.schema.json`, `docs/FORMAT.md` (seção "Campos da v11": `platformRepos` só local; a seção v7 marcada como histórico; a nota 7 de "Lendo uma anotação"), `docs/ARCHITECTURE.md` (os parágrafos de `codeLocations.ts` e de `PlatformRepos.tsx`), `examples/specs/sdui.json` e `examples/exemplo-completo/specs/sdui.json` (`formatVersion` 5 com `repo` nas três plataformas; a `bff` com `name`, `language: "kotlin"`, `symbol` e `path` das funções que geram o JSON e `notes` dizendo que a função devolve o nó), os gerados `examples/exemplo-completo.zip` e `public/guia/index.html` (`npm run build:example` e `npm run build:guia`; o `mapping.json` do exemplo em v11), `tests/model/spec.test.ts`, `tests/model/specWarnings.test.ts`, `tests/model/migrations.test.ts`, `tests/model/codeLocations.test.ts`, `tests/model/codeBlueprint.test.ts`, `tests/components/CodeDefinitions.test.tsx`, `tests/components/PlatformRepos.test.tsx` (ou o equivalente), `tests/examples/*.test.ts`, `tests/e2e/codeDefinitions.spec.ts` (ou o que cobre a "Definição"), `docs/TESTING.md` (R3.2: Configurações só com o caminho local e o link já funcionando ao aplicar a especialização; R3.3; R3.8: projeto v10 com `urlTemplate` migrando para v11).

- [x] Especialização `formatVersion` 5: `repo` em `platforms[]` validado (`url` `http(s)://`; `urlTemplate` com `{path}`, opcional; `ref` opcional, não vazio); propriedades desconhecidas continuam recusadas; v1 a v4 importam como antes; `docs/spec.schema.json` e `tests/model/spec.test.ts`
- [x] Aviso de validação "plataforma com `path` sem `repo`" na importação da app e em `specWarnings`; o aviso de projeto sai
- [x] Schema v11 com migração v10 → v11 e teste: `urlTemplate` descartado (backup pré-migração gravado), entrada só com `localPath` mantida, entrada só com `urlTemplate` removida; o Diagnóstico mostra o descartado com a orientação; projeto v10 sem `platformRepos` migra sem mudar mais nada
- [x] `codeLink` pelo `urlTemplate` da especialização e `codeLocalPath` pela sobreposição do projeto; a linha "Definição" abre o link logo depois de aplicar a especialização, sem configurar nada; Configurações › Repositórios de código só com o caminho local e o `repo` em leitura; testes de componente e o e2e da "Definição"
- [x] `SPEC-FORMAT.md` e a Ajuda › Especializações abrem a seção "Plataformas e code" com a frase canônica; `platforms`, `repo`, `symbol`, `path`, `params`, `values` e `notes` definidos pelo que o agente faz com cada um; o exemplo comentado da SDUI com a `bff` nova; `FORMAT.md` com a v11
- [x] `examples/specs/sdui.json` e a cópia do exemplo completo em `formatVersion` 5 com `repo` e a `bff` apontando para funções; zip e guia regerados; os testes que fixam "Contrato SDUI" atualizados; R3.2, R3.3 e R3.8 do guia conferem o comportamento novo
- [x] Nenhuma string de UI fora do `t()`; nenhum nome de plataforma no código do núcleo; `tests/theme/tokenLiterals.test.ts` e `tests/i18n/*` passando

**Aceite:** quem lê só o `SPEC-FORMAT.md` (ou a Ajuda da app) sabe o que é o `code` na primeira frase da seção e chega ao arquivo de cada `symbol` só com a especialização; o projeto de exemplo abre em v11 com a linha "Definição" do Button mostrando as três plataformas com link; um projeto v10 com `urlTemplate` migra com backup; gates verdes.

#### C2 — O conceito nos textos de apoio, na skill e no workspace

**Coordenador:** Sonnet. Propaga as definições da C1 (a frase canônica e o vocabulário estão no plano). **Esforço:** medium; subagentes medium; mecânicos Haiku low.

**Toca em:** `.claude/skills/spec-author/SKILL.md` (seção 6 com a frase canônica, `repo` por plataforma com a instrução "preencha `url` e `ref` do repositório que você leu"; na lista de erros: "symbol com o nome do nó de saída em vez da função que o gera" e "plataforma com `path` sem `repo`"; a `formatVersion` 5 na regra da versão mínima; o prompt-modelo pede, por plataforma, o que se chama e o repositório), `examples/workspace/AGENTS.md` (o comentário de exemplo do propósito e a regra "Código"), `examples/workspace/README.md` (seção "Ligar marcações a código" renomeada), `README.md` (a linha "Código das especializações"), `docs/ARCHITECTURE.md` (os parágrafos de `codeBlueprint.ts` e de `CodeDefinitions.tsx`), `src/model/codeBlueprint.ts` (o comentário de cabeçalho), `src/i18n/pt-BR.ts` e `en-US.ts` (`help.code.*`, `code.definitionHint`, o que a C1 não tocou), `docs/TESTING.md` (R3.1 a R3.5 relidos com o vocabulário).

- [x] Skill `spec-author`: seção 6, lista de erros, regra da `formatVersion` mínima e prompt-modelo com o conceito e o `repo`; a revisão final pergunta "cada `symbol` é o que se chama para criar a instância, e cada plataforma com `path` tem `repo`?"
- [x] `README.md`, `ARCHITECTURE.md`, workspace, Ajuda da app e o comentário do `codeBlueprint.ts` sem o vocabulário que sai; `grep -rn "vira código\|implementa o tipo\|ligar marcações a código\|planta de código" docs/*.md README.md src .claude examples/workspace` só encontra `docs/history/`
- [x] Nenhum texto explica o `code` só pela negação

**Aceite:** a skill, rodada sobre o `sdui.json` do exemplo como origem, produz uma especialização v5 com `repo` e `symbol` de função na `bff` (conferência pelo coordenador, sem rodada do Cowork); gates verdes.

#### C3 — MCP 0.6.0 e o guia do agente

**Coordenador:** Sonnet. A forma das respostas está decidida acima; a fase implementa e reescreve o guia com ela. **Esforço:** medium; subagentes medium (o briefing do `AGENT-GUIDE.md` high).

**Toca em:** `mcp/version.ts` (0.6.0), `mcp/server.ts` (instruções: "Para escrever a solução a partir de uma marcação, `get_code_hints(ref, plataforma)` dá as chamadas a escrever com o código de instanciação de cada tipo; o repositório de cada biblioteca está na especialização"), `mcp/tools.ts` (descrições de `get_marking`, `get_code_hints`, `find_by_code`, `get_component`, `get_project`, `get_specialization` e do argumento `platform`), `mcp/operations.ts` e `mcp/batch.ts` (`set_platform_repo` só com `localPath`), `mcp/changes.ts` (sem o aviso `missing-repo`), `mcp/codeViews.ts` (`definition` com `url` e `ref` da especialização; `types`, `repos` e `args` no `codeHintsView`), `mcp/views.ts` e `mcp/findByCode.ts` (a entrada de `code` na forma única), `mcp/componentTools.ts` (`code` do `get_component` na mesma forma), `mcp/projects.ts` (plataformas com `repo` e `localPath`), `mcp/docs.ts` (descrições dos recursos), `mcp/modelErrors.ts` e `mcp/errors.ts` (códigos que saem ou entram), `docs/AGENT-GUIDE.md` ("Conceitos que importam" e a seção "Do mapeamento ao código" inteira: título, fluxo, exemplos JSON na forma nova, "Repositórios por plataforma" como sobreposição local, `find_by_code` como "que tipos se instanciam com este arquivo ou símbolo, e onde estão marcados"; a seção "Erros"), `docs/MCP.md` (a linha de "Código", a seção "Publicar uma versão" com 0.6.0 e a seção "Mudança da 0.6.0"), `tests/mcp/code.test.ts`, `tests/mcp/write.test.ts` (o lote com `set_platform_repo`), `tests/mcp/read.test.ts`, `tests/mcp/errorCodes.test.ts`, `tests/mcp/version.test.ts`.

- [x] Entrada de `code` na forma única em `get_marking`, `get_annotation`, `find_by_code` e `get_component` (`definition` com `url` e `ref` da especialização, `localFile` e `exists` da sobreposição, ou `null`); testes
- [x] `get_code_hints` com `types` por `specId/typeId`, `repos` por plataforma e a árvore com `type` e `args` por anotação, sem arquivo por instância; `unmappedTypes` e `symbol: null` como hoje; testes (o Screen sem `code`, plataforma sem `repo`, plataforma sem sobreposição local)
- [x] `set_platform_repo` só com `localPath` (`urlTemplate` no lote falha com `unknown-field`); `get_project` e `get_specialization` mostram o `repo` das plataformas; o aviso `missing-repo` sai do lote e do `get_project`; testes
- [x] Instruções do servidor, descrições das tools e dos recursos com o vocabulário da etapa; o servidor continua sem ler nem gravar código (`tests/mcp/noCodeRead.test.ts`)
- [x] `AGENT-GUIDE.md` reescrito: a frase canônica em "Conceitos que importam", o fluxo "escrever a solução a partir de uma tela" (ler `types`, abrir cada `definition` pelo clone local ou pela URL, escrever as chamadas com os `args`), exemplos na forma nova, nenhum passo sobre código gerado nem pela negação como única explicação
- [x] `docs/MCP.md` com 0.6.0 e a seção "Mudança da 0.6.0" (forma das respostas, `set_platform_repo`, `repo` na especialização); `tests/mcp/version.test.ts` verde; `npm run build:mcp` gera o bundle

**Aceite:** num repositório de teste com o `sdui.json` novo e sem `platformRepos`, `get_code_hints` do Formulário na plataforma `bff` devolve em `types` a função de cada tipo com `definition.url` montada pela especialização e, na árvore, só `args` por anotação; com `set_platform_repo { localPath }` aplicado, `definition.localFile` e `exists` aparecem; gates verdes e `dist-mcp/mapping-mcp.js --version` imprime 0.6.0.

#### C4 — Prova do conceito e fechamento

**Coordenador:** Sonnet. Guia, rodada do Cowork e histórico. **Esforço:** low; subagentes low.

**Toca em:** `docs/TESTING.md` (R3.6: a pergunta de conceito ao agente, com a resposta esperada e o que a reprova; a seção 6 se o `.mcp.json` ou a versão mudarem; R5 se citar `set_platform_repo`), `docs/TESTING-COWORK.md` (rodada dirigida: R3 inteiro, R5.3 e a pergunta de conceito), `docs/ROADMAP.md`, `CLAUDE.md`, `PLAN.md`, novo `docs/history/PLAN-etapa-instanciacao.md`.

- [x] R3.6a (pergunta de conceito, antes do R3.6): a resposta esperada cita instanciar, a assinatura e o repositório da especialização; reprova se falar de código gerado para a anotação ou de onde a instância foi implementada
- [x] Rodada dirigida do Cowork executada sobre o build do épico (R3, R5.3 e a pergunta), relato em `docs/history/relato-<data>-instanciacao.md`; achados corrigidos no épico antes do merge
  - Rodada de 2026-10-20 sobre o build `dee8666` (MCP 0.6.0-rc.1): 54 ✅, 1 ❌ (R3.6a), relato em [`docs/history/relato-2026-10-20-instanciacao.md`](docs/history/relato-2026-10-20-instanciacao.md). Leitura do achado: o executor foi o cliente stdio, que não mostrava as instruções do servidor, e `get_specialization` e `get_project` não levavam o conceito. Correção: o cliente imprime as instruções antes das chamadas e as duas tools trazem `codeHint` com plataformas. O `urlTemplate` citado é o `repo.urlTemplate` da especialização (não reprova). O dono refez o R3.6a numa sessão limpa do Claude Code com a `mcp-v0.6.0-rc.2`: **passou** ([`docs/history/relato-2026-10-20-instanciacao-reteste.md`](docs/history/relato-2026-10-20-instanciacao-reteste.md)).
- [x] Rótulo `mcp-rc` no PR desta fase; a rc `mcp-v0.6.0-rc.<n>` sai no merge; a estável `mcp-v0.6.0` é tag do dono depois do merge do épico na `main` (o rótulo foi posto no #185 e no #188; a rc.2 saiu no merge do #188; a estável fica pendente, tag do dono)
- [x] Esta seção vai para `docs/history/PLAN-etapa-instanciacao.md` com as decisões consolidadas dos PRs e o relato; `PLAN.md` sem etapa em andamento; `ROADMAP.md` e `CLAUDE.md` atualizados

**Aceite:** a pergunta de conceito passa na rodada do Cowork; o dono mescla o épico.

---

## Decisões consolidadas dos PRs

### #181 — Plano da etapa (C1 a C4)

- Frase canônica única do `code`; cada documento pode encurtá-la, nunca invertê-la; a negação ("não é o código gerado") fica só como complemento.
- Vocabulário: "código de instanciação", "instanciar", "o que se chama", "chamada"; saem "implementar", "vira código", "componente que implementa o tipo", "ligar marcações a código", "planta de código". Identificadores do código (`codeBlueprint`, `codeHintsView`, `CodeDefinitions`) e as chaves do formato (`code`, `symbol`, `path`, `params`, `values`, `notes`) não mudam.
- Plataforma é um alvo de código em que o agente escreve a solução; a `bff` do exemplo continua plataforma, com `symbol` apontando para a função que gera o JSON.
- O repositório é da especialização (`platforms[].repo` com `url`, `urlTemplate`, `ref`; `formatVersion` 5; v1 a v4 continuam válidas); o projeto guarda só a sobreposição local (schema v11, `platformRepos[x].localPath`).
- Uma forma só de entrada de `code` nas respostas do MCP (`definition` ou `null`); `get_code_hints` separa `types`/`repos` de `args`; MCP 0.6.0, nomes das tools inalterados.
- Aceite por pergunta de conceito ao agente (R3.6a), na rodada do Cowork; coordenador por fase: C1 Opus high, C2 a C4 Sonnet (medium, medium, low).

### #182 — C1: formato e modelo

- **`.json` v4/v5 sem pacote vale como arquivo isolado** (decisão do dono): `usesPackageFiles(spec)` é verdadeira com `fonts` ou `origins` não vazias, ou tipo com `component`/`doc`/`examples` (`migrations` não conta). Sem isso, o `sdui.json` v5 quebraria R1, R5 e os Downloads.
- SDUI sobe para `version` 3, para a "Atualizar versão…" de um projeto antigo trazer o `repo`.
- O link usa o `repo` da especialização dona do tipo; o `localPath` é por plataforma, então duas especializações com repositórios diferentes na mesma plataforma compartilham um só clone local (limitação conhecida). `codeBlueprint.repo` usa o `repo` da primeira especialização que o declara.
- `diffSpecs` ignora `platforms`: acrescentar, trocar ou tirar `repo` não é quebra de contrato de versão.
- O JSON Schema não espelha por condicional a regra "`repo` só na 5"; quem confere é o validador. Novo aviso `path-without-repo`; saem o aviso de projeto `missing-repo` e `platformRepoWarnings`.
- Migração v10 → v11 descarta o `urlTemplate` (entrada que só o tinha some; `localPath` vazio também remove a entrada), com backup e registro no Diagnóstico. Propostas antigas com `platformRepo.urlTemplate` ainda abrem, e o `urlTemplate` é ignorado.
- MCP só com o mínimo para compilar; o `urlTemplate` em `set_platform_repo` ficou ignorado em silêncio até a C3.

### #183 — C2: textos de apoio, skill e workspace

- Skill `spec-author` (seção 6 com a frase canônica, `repo` por plataforma, novas armadilhas, revisão final, prompt-modelo), workspace, `README.md` e Ajuda da app sem o vocabulário que saiu.
- `ARCHITECTURE.md` e a seção "Plataformas e code" do `SPEC-FORMAT.md` já estavam corretos pela C1 e não foram tocados; no R3, só o R3.6 teve a expressão "planta de código" trocada.
- Os trechos do `AGENT-GUIDE.md` que ainda explicavam o `code` ("código gerado") ficaram para a reescrita da C3.
- A skill não foi rodada sobre o `sdui.json` na sessão (conferência do aceite é do coordenador).

### #184 — C3: MCP 0.6.0 e guia do agente

- `get_project` mantém `platformRepos` (só `localPath`) e ganha `repos` e `localPath` em cada plataforma.
- `repos` do `get_code_hints` mostra o `repo` da primeira especialização que declara a plataforma; a `definition` de cada tipo usa o `repo` da especialização dona do tipo.
- `type` na árvore é a string `specId/typeId` (a chave de `types`); o `name` fica em `types`.
- `urlTemplate` em `set_platform_repo` é aceito pelo schema só para falhar com `unknown-field` e uma mensagem explicativa, em vez de ser descartado em silêncio.
- `repoLink` novo em `src/model/codeLocations.ts` (o `codeLink` o usa), para montar o link de um `repo` sem projeto; no `get_component` por `path`, `localFile` e `exists` são `null`.

### #185 — C4 (parcial): pergunta de conceito e roteiro da rodada

- A pergunta (R3.6a) vem **antes** dos outros pedidos do R3.6, em sessão limpa, para não contaminar a resposta.
- O R5 não cita `set_platform_repo`; só o R3.6, que já usa `localPath`.
- Nova seção 10 do `TESTING-COWORK.md` com a rodada dirigida da instanciação (R3 inteiro, R5.3 e a pergunta). Rótulo `mcp-rc` posto neste PR.

### #188 — C4 (parcial): relato da rodada e correção do achado R3.6a

- O conceito vai na resposta das tools que o agente lê primeiro: `get_specialization` e `get_project` trazem `codeHint` (só quando há plataformas; nenhuma outra chave nem tool mudou).
- Citar o `repo.urlTemplate` da especialização não reprova o R3.6a (o que saiu foi o `urlTemplate` do projeto).
- O cliente stdio de teste (`scripts/testing/mcp-stdio-client.mjs`) imprime as instruções do servidor antes das chamadas, para o teste por stdio valer o mesmo que no Claude Code.
- A frase do apêndice A do guia virou bullet próprio (limite de 600 caracteres por bullet em `tests/tooling/testingGuide.test.ts`).
- **Rótulo `mcp-rc`:** este PR também o levou e a rc.2 (`mcp-v0.6.0-rc.2`) saiu no merge. Por isso a fase de fechamento **não** põe o rótulo de novo: uma terceira rc não traz nada além de documentação.

### #189 — C4 (parcial): reteste do R3.6a

- A resposta do dono no Claude Code (rc.2) é registrada na íntegra em `docs/history`, como os relatos do Cowork; **passou**.

### Fechamento da etapa (este PR)

- Mudança só de documentação: a seção da etapa vai para este arquivo, `PLAN.md` fica sem etapa em andamento, `ROADMAP.md` e `CLAUDE.md` passam a mostrá-la como concluída.
- Sem rótulo `mcp-rc` (ver #188). A estável `mcp-v0.6.0` é tag do dono depois do merge do épico na `main`, e apaga as rc.

---

## Rodada do Cowork (R3, R5.3 e a pergunta de conceito) e reteste

**Relato:** [`relato-2026-10-20-instanciacao.md`](relato-2026-10-20-instanciacao.md). Build `dee8666 · 2026-10-20` (MCP 0.6.0-rc.1), preview do branch no Chrome 155 (Windows, DPR 1,25). Modo dirigido, 55 passos: **54 ✅ e 1 ❌**.

**Achado 1 (alta) — R3.6a:** as duas execuções responderam que o `code` é "como o componente é implementado" e o `path` "onde achar a implementação", e a segunda citou `urlTemplate`. Leitura do coordenador: o executor foi o cliente stdio, que não mostrava as instruções do servidor, e `get_specialization` e `get_project` não levavam o conceito. Correção no #188 (`codeHint` nas duas tools; instruções impressas pelo cliente).

**Reteste:** [`relato-2026-10-20-instanciacao-reteste.md`](relato-2026-10-20-instanciacao-reteste.md). O dono refez o R3.6a numa sessão limpa do Claude Code com a `mcp-v0.6.0-rc.2`: **✅ passou**. A resposta diz que o `code` é o código de instanciação, que o `symbol` é o que se chama, que o `path` é o arquivo que define o símbolo e serve para ler a assinatura, e onde o arquivo está (repositório da especialização, ou clone local); sem falar em código gerado para a anotação.

## O que ficou para depois

Sem correção nesta etapa (observações do relato, sem severidade):

- **Guia, R5.3:** diz "Aceitar imagem" sem distinguir o check da linha (aceita só a linha) do botão **Aceitar imagem** de Detalhes (aceita a imagem inteira e mostra "mudou(aram) junto, pelas dependências").
- **Guia, R5:** pede o `login.png` só no R5; o testador precisou gerá-lo por script.
- **Preview trocado no meio da rodada:** durante o R3.5 o preview passou do branch do épico para outro (schema v10) e o projeto ficou "versão incompatível"; a tentativa foi invalidada e refeita. Há um preview só, o do último PR atualizado.
- Outras notas do relato: `Ctrl+=` bloqueado pela ferramenta no R1.20; `migracao10` copiada de `migracao` em vez de refeita pela app; `specs/sdui.json` do projeto migrado segue o antigo (o guia não pede para mexer); `claude -p` indisponível na VM do Cowork (por isso o R3.6a depende do Claude Code real); o toast "Projeto atualizado por fora." é passageiro e não foi capturado.
- Limitação herdada da C1: um só clone local por plataforma, mesmo com especializações de repositórios diferentes.
- Do roadmap: "Depois, sem data" em [`../ROADMAP.md`](../ROADMAP.md).

