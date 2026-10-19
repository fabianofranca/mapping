# Histórico — Etapa Biblioteca (seção do antigo PLAN.md)

> Fases B1 a B5 e Fechamento concluídas no épico `epic/biblioteca` (PRs #169 a #175 e o do Fechamento, #176). Origem: a análise de 2026-10-16 e o laboratório de componentes ([`PLAN-etapa-lab.md`](PLAN-etapa-lab.md)). A rodada do Cowork do Fechamento está em [`relato-2026-10-18-fechamento.md`](relato-2026-10-18-fechamento.md) e o reteste em [`relato-2026-10-18-reteste.md`](relato-2026-10-18-reteste.md). Referência atual: [`../COMPONENT-FORMAT.md`](../COMPONENT-FORMAT.md), [`../SPEC-FORMAT.md`](../SPEC-FORMAT.md) (formatVersion 4), [`../FORMAT.md`](../FORMAT.md) (schema v10), [`../MCP.md`](../MCP.md) (0.5.0) e [`../../lab/README.md`](../../lab/README.md).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes do Fechamento (os quatro primeiros marcados ao fechar a etapa; o merge do épico na `main` fica pendente, decisão do dono). Depois dela vêm as decisões consolidadas dos PRs, a rodada do Fechamento e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Etapa em andamento — Biblioteca (épico `epic/biblioteca`)

### Objetivo

A especialização passa a entregar uma **Biblioteca**: um pacote (a pasta da especialização, com componentes um por arquivo, fontes, documentos markdown por componente e exemplos nomeados) que a app e os agentes **validam, aplicam e usam para montar telas com componentes**, sem importar imagens. O ganho é no desenvolvimento: agentes e pessoas montam e conferem telas a partir do design system, e a biblioteca vira teste de contrato do que o backend manda. O laboratório ([`lab/README.md`](lab/README.md); histórico em [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)) provou o formato de componente, a arrumação por tamanhos, as fontes por bytes, o Material 3 escrito no formato e a declaração de origem executável; esta etapa leva o **motor** para o produto. O **editor do laboratório** não vai: o canvas da app faz esse papel.

**Princípio:** nada do SDUI nem de outro sistema externo entra no núcleo. A especialização declara (formato, origem, dimensionamento) e o núcleo executa a declaração, sem saber de que sistema se trata e **sem nunca executar código vindo da especialização**. A app é só leitura da biblioteca: pacotes e pedidos de alteração são escritos por agentes (skill e MCP).

**Marcos de aceite da etapa:** (B2) o design system do Figma do dono convertido para o formato e validado pelas três portas; (B3) uma tela montada com componentes pela app e outra pelo agente; (B4) um agente adiciona um componente e uma propriedade a uma biblioteca aplicada sem quebrar o projeto; (B5) o Catálogo aberto pela tela inicial e de dentro do projeto.

### Decisões

- **Mesmas regras das etapas anteriores, no fluxo de épico:** cada fase (ou parte de fase) é um branch curto com PR **com base em `epic/biblioteca`**, na ordem abaixo; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`, mais `npm run build:mcp` nas fases que tocam `mcp/` e o e2e local nas que tocam o canvas); defeito com o teste que o reproduz antes da correção; nenhuma string fora de `t()`, nenhum valor de design fora dos tokens, controles e ícones só de `src/ui/controls/` e `src/ui/icons.tsx`, toda mutação por action do store, `src/model/` sem API de navegador; descrição do PR com Resumo, Como testar (desktop; o branch pode ser publicado pelo `workflow_dispatch`) e Decisões tomadas; checkboxes da fase marcados aqui no mesmo PR; roteiro do `docs/TESTING.md` que passa a descrever outro comportamento é atualizado no mesmo PR (`tests/tooling/testingGuide.test.ts`). A `main` entra no épico por merge quando houver conflito.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar): B1 Opus, high (subagentes medium; high nos briefings de validação e de contrato de versão); B2 Sonnet, medium (subagentes medium); B3 Opus, high (subagentes medium; high nos briefings de store, canvas e invariantes); B4 Opus, high (subagentes high nas migrações); B5 Sonnet, medium (subagentes medium; mecânicos low); Fechamento Sonnet, low.
- **O que o produto herda do laboratório** (lista completa em "Decisões registradas" de [`docs/history/PLAN-etapa-lab.md`](docs/history/PLAN-etapa-lab.md)): instância = **marcação com anotação tipada** cujo tipo tem componente; o desenho é **derivado** (retângulo da marcação, valores da anotação, molde da biblioteca) e **não é gravado**; tela sem imagem = **imagem sem arquivo** (tela em branco com tamanho e cor de fundo; o quadro reorganizável já existe, `placement`); hierarquia das marcações = contenção visual (container e conteúdo), e a **ordem entre irmãs é a ordem do array `markings`** (`childrenIndex`, `topDown`), que ganha uma ação de reordenar, sem campo novo; o desenho é opcional por tipo (projeto só com fotos não executa nada novo; projeto misto é possível); arrumação só por ação da pessoa, nunca na carga, no MCP nem ao aplicar proposta; borda só em hover e seleção para marcações que desenham componente; validador em três níveis, puro e igual no navegador e no Node; três portas de validação (app, MCP, skill); contrato de versão no formato (aditiva contra quebra, migrações declaradas no pacote); `path` próprio para o caminho do campo e `slot`/`ignore` nas `sources` de sistema executável.
- **Onde o motor mora:** as partes puras (`componentFormat`, `parseComponent`, `expressions`, `instantiate`, `layout`, `origin`, `scene`, a parte pura de `library`) saem de `lab/` para **`src/model/components/`** na B1 (`arrange.ts` e `screen.ts` foram junto: `layout`, `origin` e `library` dependem deles), com os testes em `tests/model/components/` (projeto `model` do Vitest, `environment: 'node'`); as partes que dependem de Konva ou do navegador (`renderScene`, `screenRenderer`, `konvaMeasurer`, `fonts`) vão para **`src/canvas/components/`** e **`src/storage/fonts.ts`** na B3. O laboratório passa a importar de `src/` o que foi movido (sem cópia duplicada) e continua publicado em `dist/lab/` até o Fechamento decidir o que fica.
- **Validação do componente:** o parser do laboratório (escrito à mão, estrito, com caminho e mensagem) é mantido na B1 e passa a devolver o mesmo formato do `parseSpec` (`{ ok, issues: {path, message}[], errors }`); não é reescrito em zod só por uniformidade. O `docs/component.schema.json` (JSON Schema) é publicado ao lado do `spec.schema.json`, como documentação; a fonte da verdade é o código.
- **Especialização `formatVersion` 4** = v3 mais: `component` (caminho relativo, um arquivo por componente) e `doc` (markdown) no tipo; `examples` nomeados no tipo (valores do tipo **ou** JSON de um sistema externo resolvido pela declaração de origem); `fonts` na raiz; `origins` na raiz (declaração de origem executável da L2, com `node`, `screen`, `roots`, `booleans`); nas `sources` de campo, `path` para o caminho dentro das props (o `name` volta a ser só nome, em qualquer sistema); nas `sources` de tipo, `slot` e `ignore`, só em entradas cujo `system` está em `origins`; `migrations` na raiz (contrato de versão, abaixo). A v1 a v3 continuam aceitas sem mudança. A B1 fecha os nomes e o `SPEC-FORMAT.md` decide.
- **Pacote = pasta da especialização:** tudo o que ela referencia (`components/`, `fonts/`, `docs/`, `examples/`) fica dentro da pasta, por caminho relativo sem `..`. Aplicar a um projeto **copia a pasta** para `specs/<id>/` (a cópia da v1 a v3 continua `specs/<id>.json`); `ProjectSpecialization.file` aponta para o arquivo da especialização dentro da pasta. As fontes são copiadas junto (decisão "começar copiando"; se o peso incomodar, referenciar a pasta central só para as fontes, numa fase depois). O `ProjectStorage` ganha leitura e escrita de arquivos sob `specs/<id>/` (pasta, IndexedDB e zip).
- **Contrato de versão:** `version` (inteiro, já existe) continua sendo a versão do pacote. Uma mudança é **aditiva** quando só acrescenta (tipo, campo opcional, opção de `enum`, componente, exemplo, documento, fonte) ou muda o desenho (template) sem mudar os campos; é **quebra** quando remove ou renomeia tipo, campo ou opção, torna um campo obrigatório ou muda o tipo de um campo. Toda quebra precisa de uma entrada em `migrations` (`from`, `to`, lista de passos declarativos: renomear campo, remover campo, mapear valores de `enum`, renomear tipo, remover tipo com `convert`/`delete`, campo novo obrigatório com `default`); o validador recusa um pacote cuja diferença para a versão anterior tenha quebra sem migração (nível 2, quando a versão anterior é fornecida) e o `specializationUpdateImpact` passa a usar as migrações. A execução das migrações num projeto é a B4.
- **Validação em três níveis** (`src/model/library.ts`, puro; recebe os arquivos já lidos: texto dos `.json` e `.md`, presença dos binários): (1) cada arquivo isolado, estrito, com caminho do problema; (2) coerência entre arquivos (componente referenciado existe e é válido, `slot` declarado existe no template, campo das expressões existe no tipo, exemplo cita tipo e campos existentes, fonte declarada tem arquivo, `origins` coerente com `sources`, `migrations` citam tipos e campos que existiam); (3) prova de desenho (instanciar cada componente com `preview` e com cada exemplo, no tamanho inicial e no mínimo, com o medidor aproximado, recolhendo os avisos do motor como "aproximado"; cada exemplo de sistema externo passa pela declaração sem propriedade desconhecida). Saída: lista de `{ file, path, message, severity }`; **erro impede usar, aviso deixa usar**. As três portas chamam a mesma função.
- **Conteúdo maior que o slot ou que a tela (pendência da L2):** no produto o desenho **avisa** e não recorta nem recusa, como no laboratório; o aviso vira pendência derivada ("componente não cabe") na lista de pendências e no Diagnóstico. A invariante das marcações (filha dentro do pai) continua valendo para os retângulos; a ação Arrumar cresce um container `hug` para caber os filhos e, se o container tiver tamanho fixo, só avisa.
- **Desenho na app:** o estado derivado `componentScenes` (`src/store/derived.ts`, memoizado por marcação: retângulo, valores, versão da especialização) é lido pelo canvas, que desenha uma cena por marcação com componente numa camada própria entre as imagens e as marcações. Editar um campo no painel redesenha na hora (uma action, uma versão, um quadro; só a marcação mudada é re-instanciada); vale para desfazer/refazer, recarga externa e revisão de proposta (a visão Proposto desenha com os valores propostos). Opção de visualização por pessoa, não gravada no projeto (`src/store/settings.ts`, como o zoom semântico): mostrar ou não o desenho por cima de uma foto (padrão escondido na foto, sempre visível na tela em branco). Referências (`ref`) são resolvidas no desenho em um nível, com detecção de ciclo; editar o modelo redesenha quem o usa.
- **Fontes na app:** os bytes de `specs/<id>/fonts/` são lidos pelo `src/storage/` e registrados com `FontFace` (a CSP bloqueia fonte por URL, não uma face construída de bytes); fonte ausente cai na fonte do sistema, com aviso no Diagnóstico; a medição do texto no navegador é a real (Konva) e no Node a aproximada (o MCP nunca arruma).
- **MCP:** uma versão por épico: a Biblioteca sai como **0.5.0** (a `main` está na 0.4.0) quando o épico for mesclado na `main`; `mcp/version.ts` fica em 0.5.0 durante todo o épico. Cada PR de fase gera um snapshot (`mcp-snapshot-pr<N>`, pre-release que some quando o PR fecha) para testar antes de entrar no épico, e a release candidate (`mcp-v0.5.0-rc.<n>`) sai só no merge do PR com o rótulo `mcp-rc`, o da última fase (o Fechamento); se esquecerem o rótulo, o `workflow_dispatch` do MCP pre-release no `epic/biblioteca` cobre. A estável `mcp-v0.5.0` é tag do dono, depois do merge do épico na `main`, e apaga as rc (`docs/MCP.md`, "Publicar uma versão"). O `AGENT-GUIDE.md` ganha as regras em cada fase.
- **Catálogo (B5) sem dependência nova:** renderizador próprio de um **subconjunto** do markdown (títulos, parágrafos, negrito, itálico, código em linha, blocos de código, listas, tabelas simples e links só para `mapping://` ou âncoras do próprio documento), parser puro em `src/model/markdown.ts` e saída em nós Preact, sem `innerHTML` (CSP). Imagens em markdown não são renderizadas (a galeria de exemplos é gerada pelo motor). O playground usa o formulário de anotação tipada dos Detalhes, que a B5 extrai num componente independente do projeto (`TypedForm`, sobre `SimpleEditor`, `TableField` e `RefField` com uma anotação em memória).
- **Exemplo de biblioteca do produto:** o Material 3 do laboratório (`samplesMaterial3.ts`) vira a pasta `examples/libraries/material3/` (especialização v4, quinze componentes, documentos, exemplos, `fonts/LEIA-ME.txt` sem os arquivos da Roboto) gerada por script e conferida por teste; é o fixture das três portas, do canvas e do Catálogo. O `settings.sdui.json` vai junto como exemplo de sistema externo.
- **Fora desta etapa** (ROADMAP, "Depois, sem data"): revisão visual lado a lado de uma versão nova; exportar o Catálogo como site estático; visualizador distribuído pelo build do produto (o pacote `mapping-viewer` do laboratório fica como está); saída tela para sistema externo pela declaração; importação de telas do sistema externo para projetos; vários slots por componente; campos de tabela no lugar de listas numeradas nas origens (fica registrado como limite no `SPEC-FORMAT.md`).

### Fases

#### B1 — Formato da biblioteca

**Coordenador:** Opus. Fundação de tudo que vem depois: fecha os nomes do formato, o contrato de versão e o validador. **Esforço:** high; subagentes medium, e high nos briefings de validação e de contrato de versão.

**Toca em:** `src/model/components/` (novo: `componentFormat.ts`, `parseComponent.ts`, `expressions.ts`, `instantiate.ts`, `layout.ts`, `origin.ts`, `scene.ts`, `library.ts` puro), `src/model/spec.ts` e `src/model/sources.ts` (v4), `src/model/specializations.ts` (`specializationUpdateImpact` com migrações), `src/model/library.ts` (validador em três níveis), `src/model/specWarnings.ts`, `docs/SPEC-FORMAT.md` (v4 e a seção "Biblioteca: o pacote"), novo `docs/COMPONENT-FORMAT.md` (formato de componente, dimensionamento, expressões, avisos do motor), `docs/spec.schema.json` e novo `docs/component.schema.json`, `src/i18n/specHelp.ts` (Ajuda › Especializações; `tests/i18n/specHelp.test.ts`), `lab/components/*` e `lab/viewer/*` (passam a importar de `src/model/components/`), `tests/model/components/` (movidos de `tests/lab/components/` e `tests/lab/scene/`), `examples/libraries/material3/` (gerado) e `scripts/` (o gerador), `examples/specs/` (um exemplo v4 pequeno).

- [x] Módulos puros do motor movidos para `src/model/components/` com os testes; o laboratório importa de lá; `npm run build`, `build:lab` e `build:viewer` continuam passando; o ESLint de `src/model/**` (sem API de navegador) passa sem exceção
- [x] `parseComponent` devolvendo `{ ok, issues, errors }` como o `parseSpec`; `docs/component.schema.json` publicado e conferido por teste contra os componentes do Material 3
- [x] Especialização v4 no `spec.ts` (estrito): `component`, `doc`, `examples` no tipo; `fonts`, `origins`, `migrations` na raiz; `path`, `slot` e `ignore` nas `sources` (só com `system` em `origins`); v1 a v3 sem mudança; `findTypesBySource` lendo `path` só em sistema executável
- [x] Regras de dimensionamento (`sizing`, `size`, `minSize`, `fill`/`hug`/px, âncoras da tela) documentadas no `COMPONENT-FORMAT.md` e cobertas por teste (caso de prova da L2: texto de apoio `hug` dentro de coluna `hug`)
- [x] Contrato de versão: classificação aditiva contra quebra de duas versões de uma especialização (função pura), formato de `migrations` (passos declarativos) e `specializationUpdateImpact` usando as migrações declaradas; teste de cada tipo de quebra com e sem migração
- [x] Validador em três níveis (`src/model/library.ts`): entrada com os arquivos já lidos, saída `{ file, path, message, severity }`; nível 3 instancia cada componente com `preview` e com cada exemplo no tamanho inicial e no mínimo e passa cada exemplo de sistema externo pela declaração; teste com o Material 3 inteiro (zero erros) e com pacotes quebrados de propósito (um por regra)
- [x] `examples/libraries/material3/` gerado a partir de `samplesMaterial3.ts` por script, com `settings.sdui.json` como exemplo externo e `fonts/LEIA-ME.txt`; teste que gera e compara com o que está no repositório (como o `dist-mcp` do MCP é conferido)
- [x] `docs/SPEC-FORMAT.md`, `docs/COMPONENT-FORMAT.md`, Ajuda › Especializações e a tabela de documentação do `PLAN.md` atualizados

**Aceite:** `npm test` passa com os testes do motor no projeto `model`; o validador aprova o Material 3 e recusa cada pacote quebrado com o caminho certo; o laboratório publicado em `dist/lab/components/` continua carregando o Material 3 e o SDUI.

#### B2 — Validação pelas três portas

**Coordenador:** Sonnet. Implementação a partir do formato da B1, nas três portas. **Esforço:** medium; subagentes medium.

**Toca em:** `mcp/specValidation.ts`, `mcp/tools.ts`, `mcp/projects.ts`, `mcp/docs.ts`, `mcp/version.ts` (0.5.0), `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `.claude/skills/spec-author/SKILL.md` e `examples/workspace/` (skill e `AGENTS.md`), `src/ui/SpecsDialog.tsx`, `src/model/specializations.ts` (`specFileFor` para pasta), `src/model/serialization.ts` (`attachSpecs` com pasta), `src/storage/types.ts`, `src/storage/folder.ts`, `src/storage/local.ts`, `src/storage/zip.ts`, `src/store/session.ts` (`writeProject`/`cleanUp` para `specs/<id>/`), `src/ui/DiagnosticsView.tsx` (problemas da biblioteca), `src/i18n/*`, `docs/FORMAT.md` (a pasta `specs/<id>/`, sem mudar o schema), `docs/TESTING.md` (R3 e A18), `tests/mcp/`, `tests/components/SpecsDialog.test.tsx`, `tests/storage/`.

- [x] MCP (0.5.0): `validate_library` (`path` da pasta ou do arquivo da especialização; os três níveis; `errors`, `warnings`, resumo) e `validate_specialization` aceitando v4; `list_components` e `get_component` (documento markdown, campos, exemplos, `code`, `sources`) por projeto ou por `path` de pacote; `get_specialization` servindo a v4; registro de erros e `AGENT-GUIDE.md` (como escrever um pacote, o que é aditivo, quando validar)
- [x] Skill `spec-author` escreve a biblioteca inteira (especialização v4, um arquivo por componente, documento por componente, exemplos, lista de fontes) e valida antes de entregar: pelo MCP (`validate_library`) ou por um teste descartável que chama `validateLibrary`; o prompt-modelo da skill ganha a pasta de saída e a origem dos componentes (SVG do Figma, código ou documento)
- [x] App: Especializações aceita uma **pasta** (`showDirectoryPicker`, Chrome/Edge) ou um **zip** do pacote, roda os três níveis, mostra erros (bloqueiam) e avisos (deixam aplicar) e copia a pasta para `specs/<id>/`; v1 a v3 continuam por arquivo único; a pasta é regravada em Atualizar versão… e removida em Remover; `attachSpecs` lê o arquivo dentro da pasta e avisa cópia incompleta
- [x] Armazenamento: `ProjectStorage` lê, grava, lista e remove arquivos sob `specs/<id>/` em pasta, IndexedDB e zip; o zip exportado leva o pacote; teste em cada implementação
- [x] Diagnóstico mostra os avisos da biblioteca aplicada (ao abrir o projeto, nível 1 e 2 sobre a cópia); `pendingSave` e o cabeçalho do Copiar inalterados
- [x] Exemplos de sistema externo validados pela declaração nas três portas (o `settings.sdui.json` do Material 3 passa sem avisos); o teste com o JSON real do backend do dono fica registrado como pendente até ele existir
- [x] `docs/TESTING.md`: R3 ganha os passos de aplicar um pacote (pasta e zip) e o A18 descreve a biblioteca evoluindo; `tests/tooling/testingGuide.test.ts` atualizado

**Aceite (marco):** o dono roda a skill sobre o design system do Figma dele, obtém uma pasta, `validate_library` aprova (só avisos), a app aplica a pasta a um projeto e o MCP serve os documentos dos componentes. Até o dono rodar, o aceite técnico é o Material 3 pelas três portas.

#### B3 — Telas com componentes na app

**Coordenador:** Opus. Atravessa modelo, store, canvas, interface e MCP; define invariantes novas. **Esforço:** high; subagentes medium, e high nos briefings de store, canvas e invariantes.

**Toca em:** `src/model/types.ts` e `src/model/schema.ts` (schema **v10**: imagem sem arquivo), `src/model/migrations.ts` (v9 → v10), `src/model/images.ts`, `src/model/markings.ts` (tamanho mínimo por componente, reordenar irmãs, arrumar), `src/model/hierarchy.ts`, `src/model/typed.ts` (referências resolvidas), `src/model/invariants.ts`, `src/store/derived.ts` (`componentScenes`, pendência "não cabe"), `src/store/project.ts`, `src/store/session.ts` (fontes), `src/store/settings.ts` (desenho sobre fotos), `src/store/toolWindows.ts` (paleta), `src/canvas/components/` (novo: `renderScene`, `screenRenderer`, `konvaMeasurer` vindos do laboratório), `src/canvas/CanvasController.ts`, `src/canvas/renderers/markings.ts` (borda só em hover e seleção), `src/canvas/renderers/overlay.ts`, `src/canvas/semanticText.ts`/`renderers/semanticCard.ts` (zoom semântico com desenho), `src/storage/fonts.ts` (novo), `src/app/Home.tsx` e `src/app/EditorDialogs.tsx` (nova tela em branco), `src/ui/` (paleta "Biblioteca", diálogo da tela em branco, campo de ordem no painel), `src/ui/review/` (visão Proposto desenhando), `mcp/operations.ts`, `mcp/batch.ts`, `mcp/version.ts` (0.5.0), `docs/FORMAT.md` (v10), `docs/ARCHITECTURE.md`, `docs/MCP.md`, `docs/AGENT-GUIDE.md`, `docs/PROPOSAL-FORMAT.md`, `docs/TESTING.md` (novo roteiro R9), `tests/model/schemaV10.test.ts`, `tests/canvas/`, `tests/canvas/renderPerformance.test.ts`, `tests/store/`, `tests/mcp/`, `tests/e2e/`.

- [x] Schema v10: `images[].file` aceita `null` (imagem sem arquivo) com `width`, `height` e `background` (cor; `null` nas imagens com arquivo); migração v9 → v10 sem perda (backup como sempre); `docs/FORMAT.md`; a imagem sem arquivo não é recodificada, não entra em `get_image_file` (erro claro) e `get_marking_image` recorta o desenho
- [x] Nova tela em branco pela app (ao lado de adicionar imagens: nome, tamanho, cor de fundo, com predefinições de celular e desktop) e pelo MCP (operação de proposta `add_blank_image`); o quadro reorganiza as telas como as imagens
- [x] Motor de desenho no canvas: `componentScenes` derivado, camada Konva própria entre imagens e marcações, uma cena por marcação com componente, re-instanciação só do que mudou, `requestAnimationFrame` como hoje; orçamento em `tests/canvas/renderPerformance.test.ts` (uma instância ≈ 1 ms, tela de 21 instâncias dentro do orçamento de quadro)
- [x] Paleta "Biblioteca" (janela de ferramenta): lista dos tipos com componente das especializações aplicadas; Adicionar cria a marcação com a anotação tipada (valores de `preview`) no tamanho inicial, no centro da tela à vista ou dentro do container selecionado (adotada como filha, dentro do slot); tamanho mínimo da marcação = `minSize` do componente (redimensionar e o MCP respeitam)
- [x] Ordem entre irmãs: ação `moveMarking` (subir/descer no array), campo Ordem nos Detalhes e operação de proposta; o canvas desenha na ordem do array; invariante documentada em `invariants.ts`
- [x] Arrumar (ação com entrada única no histórico; atalho definido no PR, sem colidir com os de `docs/TESTING.md`): recalcula e grava os retângulos dos filhos de um container pelo `layout` do slot; container `hug` cresce; tamanho fixo só avisa; nunca na carga, no MCP nem ao aplicar proposta
- [x] Referências resolvidas no desenho (um nível, ciclo detectado e avisado); editar o modelo redesenha os componentes que o usam; conteúdo que não cabe vira pendência derivada e aviso no Diagnóstico
- [x] Fontes do pacote lidas de `specs/<id>/fonts/` e registradas com `FontFace` ao abrir o projeto; remedição e redesenho depois da carga; ausente cai na fonte do sistema com aviso
- [x] Borda só em hover e seleção para marcações com componente; opção "Mostrar componentes sobre fotos" (por pessoa, não gravada); zoom semântico mostra o desenho no lugar do cartão de texto para essas marcações
- [x] Edição ao vivo: alterar um campo nos Detalhes redesenha na hora; desfazer/refazer, recarga externa e revisão de proposta (visão Proposto com os valores propostos) redesenham pelo mesmo caminho; teste de cada um
- [x] MCP (0.5.0): `add_blank_image`, `move_marking` (ordem), `create_marking` com anotação tipada respeitando `minSize`; `get_project` e `get_image` dizem que a imagem é sem arquivo; `AGENT-GUIDE.md` com o fluxo "montar uma tela com componentes"
- [x] `docs/TESTING.md`: roteiro **R9 — Telas com componentes** (tela em branco, paleta, container e Arrumar, ordem, fontes, edição ao vivo, proposta do agente); `docs/ARCHITECTURE.md` com a camada de componentes e a regra "desenho derivado, nunca gravado"

**Aceite (marco):** no R9, a pessoa monta a tela de configurações do Material 3 numa tela em branco pela app (paleta, container Row com chips, Arrumar) e o agente monta uma segunda tela por proposta, revisada e aplicada; o desenho acompanha cada edição de campo e o `mapping.json` não guarda nada do desenho.

#### B4 — Atualização da biblioteca

**Coordenador:** Opus. Migrações com risco de perda de dados. **Esforço:** high; subagentes high (migrações).

**Toca em:** `src/model/specializations.ts` (`updateSpecialization` aplicando `migrations`; impacto com perdas e pendências), `src/model/libraryMigrations.ts` (novo: execução dos passos declarativos, puro), `src/model/typed.ts`, `src/store/project.ts`, `src/store/session.ts` (regravar `specs/<id>/`), `src/ui/SpecsDialog.tsx` (Atualizar versão… com o impacto por passo), `mcp/tools.ts` (`plan_library_update`), `mcp/operations.ts` (`update_specialization` com pasta), `mcp/batch.ts`, `mcp/version.ts` (0.5.0), `docs/MCP.md`, `docs/AGENT-GUIDE.md` (regras de evolução), `docs/SPEC-FORMAT.md` (migrações: exemplos completos), `docs/TESTING.md` (A18 e R3), `tests/model/`, `tests/mcp/`, `tests/components/SpecsDialog.test.tsx`.

- [x] Execução pura dos passos declarativos sobre um projeto (renomear campo, remover campo, mapear valores, renomear tipo, remover tipo com `convert` ou `delete`, campo novo obrigatório com `default`), encadeando `from` → `to` até a versão nova; relatório com o que mudou, o que foi perdido e as pendências que ficam (campo obrigatório sem valor, valor fora das opções); teste por passo e por encadeamento de duas versões
- [x] Atualização aditiva sem migração: aplica direto, os desenhos novos aparecem; quebra sem migração declarada é recusada com a lista do que falta
- [x] App: Atualizar versão… mostra o impacto por passo (contagens por tipo e campo, perdas em destaque), aplica numa entrada do histórico, regrava a pasta e abre as pendências na lista; desfazer volta a biblioteca e os dados
- [x] MCP (0.5.0): `plan_library_update` (prévia do impacto sem gravar) e `update_specialization` com `file` da pasta nova, passando pela proposta e pela revisão; `AGENT-GUIDE.md` com as regras (preferir aditivo, declarar migração para toda quebra, validar antes de propor, nunca apagar tipo em uso sem `convert`)
- [x] `docs/TESTING.md`: A18 e R3 cobrem subir a versão com migração e com perda avisada

**Aceite (marco):** um agente adiciona um componente e uma propriedade opcional ao Material 3 aplicado (aditivo: sem diálogo de impacto) e, numa segunda versão, renomeia um campo com migração declarada: o projeto sobe de versão pela app e pela proposta, os valores seguem o campo novo e nada se perde sem aviso.

#### B5 — Catálogo

**Coordenador:** Sonnet. Interface e renderizador bem especificados, sem decisão de formato. **Esforço:** medium; subagentes medium (mecânicos: low).

**Toca em:** `src/model/markdown.ts` (novo, puro), `src/ui/markdown/` (novo, Preact), `src/ui/catalog/` (novo: lista, página do componente, tabela de propriedades, código, origem, galeria, playground), `src/ui/TypedForm.tsx` (novo, extraído de `TypedFields.tsx`, `FieldEditors.tsx`, `TableField.tsx`, `RefField`), `src/app/Home.tsx` (Abrir biblioteca), `src/app/EditorWindows.tsx` e `src/store/toolWindows.ts` (janela Catálogo; a paleta da B3 vira uma aba dela), `src/i18n/*`, `src/theme/tokens.ts` (só se faltar papel), `docs/ARCHITECTURE.md`, `docs/TESTING.md` (R10 — Catálogo), `tests/model/markdown.test.ts`, `tests/components/catalog/`, `tests/e2e/`.

- [x] Parser puro do subconjunto do markdown (títulos, parágrafos, negrito, itálico, código em linha, blocos de código, listas, tabelas simples, links `mapping://` e âncoras) com testes por construção e de entrada hostil (HTML é texto); renderizador Preact sem `innerHTML`
- [x] Tela inicial: **Abrir biblioteca** (pasta ou zip do pacote, sem projeto) abre o Catálogo com a validação dos três níveis no topo (erros e avisos)
- [x] Página do componente: documento, tabela de propriedades gerada dos campos (chave, rótulo, tipo, obrigatório, opções, padrão, descrição), `code` por plataforma (símbolo e `path`, com os links dos repositórios quando houver projeto), `sources` por sistema, galeria dos exemplos como imagens estáticas geradas pelo motor (uma vez, em cache por versão)
- [x] Playground vivo: `TypedForm` com os campos do tipo e o desenho ao lado, redesenhando a cada mudança; tamanho ajustável entre `minSize` e o dobro de `size`
- [x] Janela de ferramenta Catálogo dentro do projeto (atalho na sequência das janelas de `src/store/toolWindows.ts`), com a paleta da B3 como aba: Adicionar à tela à vista a partir da página do componente
- [x] Sem código no MCP (os documentos e exemplos já são servidos desde a B2); `docs/TESTING.md`: roteiro **R10 — Catálogo**

**Aceite:** no R10, a pessoa abre a pasta do Material 3 pela tela inicial, navega pelos componentes, muda os campos no playground e vê o desenho acompanhar; dentro de um projeto, adiciona um componente à tela pela janela Catálogo.

#### Fechamento

**Coordenador:** Sonnet. README, histórico, guia e abrir o épico seguinte são mecânicos. **Esforço:** low; subagentes low.

- [x] O PR do Fechamento leva o rótulo `mcp-rc`; ao mesclá-lo no épico sai `mcp-v0.5.0-rc.<n>` (sem o rótulo não sai rc; o `workflow_dispatch` do MCP pre-release cobre o esquecimento)
- [x] Rodada do Cowork dirigida nos roteiros R3, R9 e R10 e no A18 (prompt em `docs/TESTING-COWORK.md`); achados voltam às fases ou viram etapa de correção
- [x] `lab/README.md` registra o que foi para o produto e o que fica no laboratório (páginas e o pacote `mapping-viewer`); páginas cujo motor já está em `src/` são apontadas para ele
- [x] Esta seção vai para `docs/history/PLAN-etapa-biblioteca.md` com as decisões consolidadas dos PRs; `PLAN.md` sem etapa em andamento; `CLAUDE.md`, `README.md` e `docs/ROADMAP.md` atualizados (etapa concluída; "Depois, sem data" revisto)
- [ ] Mesclar `epic/biblioteca` na `main` (decisão do dono)

### Dúvidas para o dono

- **Conteúdo maior que o slot:** o plano decide **avisar** (pendência derivada), sem recortar nem recusar. Se preferir recusar a edição que não cabe, a B3 muda a regra antes de começar.
- **Ordem das fases:** a B2 (três portas) vem antes da B3 (canvas) para o design system do Figma do dono ser convertido e validado cedo, com o Material 3 como rede de segurança. Se o dono quiser ver a tela na app primeiro, B3 e B2 trocam de lugar sem conflito (as duas dependem só da B1).
- **Teste com o JSON real do backend** continua esperando o dono (pendência da L2, registrada na B2).

---

## Decisões consolidadas dos PRs

### #169 — Plano da etapa (B1 a B5) e laboratório no histórico

- Motor puro em `src/model/components/` (B1); partes com Konva ou navegador em `src/canvas/components/` e `src/storage/fonts.ts` (B3).
- Parser do componente escrito à mão (estrito), não com zod; devolve o formato do `parseSpec`.
- Chaves novas da `formatVersion` 4: `component`, `doc`, `examples`, `fonts`, `origins`, `migrations`; `path`, `slot` e `ignore` em `sources`.
- Aplicar uma biblioteca copia a pasta inteira para `specs/<id>/`; as versões 1 a 3 seguem em `specs/<id>.json`.
- Contrato de versão: mudança aditiva ou quebra; `migrations` declarativas; toda quebra exige migração.
- Conteúdo maior que o slot ou a tela só **avisa** (pendência derivada), sem recortar nem recusar.
- Ordem entre irmãs = ordem do array `markings`, com ação de reordenar e sem campo novo.
- Markdown próprio e restrito (`src/model/markdown.ts`, sem `innerHTML`); `TypedForm` extraído; o Material 3 vira `examples/libraries/material3/`, gerado e conferido por teste.
- Dúvidas ao dono: avisar ou recusar; ordem B2 antes de B3; teste com o JSON real do backend (pendente).

### #170 — B1: formato da biblioteca

- `arrange.ts` e `screen.ts` foram junto para `src/`; `renderScene.ts` e `fonts.ts` ficaram no laboratório até a B3.
- `origins` com fonte única da verdade (`parseOrigins` num `superRefine` do `spec.ts`); `dist/index.html` +51 kB (1.049.712 → 1.100.792 B), 460 KiB de folga no orçamento de 1,5 MiB.
- `isPackagePath` em `src/model/packagePaths.ts` (evita ciclo).
- Exemplos em dois modos (`values`, ou `system` + `file`); tela de exemplo em `origins[].examples`; `table` e `ref` não são aceitos em exemplo.
- Fora do contrato de versão: camada, `labelField`, `allowedChildren`, `requiresOwner`, `description`, `tags`, `code`, `platforms`, `sources`, `doc`.
- Material 3: 0 erros e 42 avisos fixados por teste (2 fontes ausentes, 40 de conteúdo maior que a caixa; a medida fora do navegador é aproximada).
- Motor e validador não exportados por `src/model/index.ts` até B2/B3; ESLint com bloco por profundidade para `src/model/components/`.
- Defeitos achados: preview dos containers citava campos inexistentes (corrigido); mudança de coluna de `table` era quebra impossível de cobrir (passos aceitam `tabela.coluna`).
- Para a B3: o aviso "fill dentro de hug" só em column hug; uniformizar.

### #171 — B2: validação pelas três portas (app, MCP 0.5.0, skill)

- `.json` v4 isolado só é validado, não aplicado (pede pasta ou zip); idem `apply`/`update_specialization` em propostas (`package-spec-unsupported`); pacote por proposta ficou para a B4.
- Layout em disco: pacote → `specs/<id>/<nome>`; arquivo único → `specs/<id>.json`.
- Cache do pacote na sessão por `id@versão`; troca de pasta = `removeSpecDir` + regravação (falha no meio deixa pasta incompleta, sem gravar o `mapping.json`).
- Seletor de pasta em modo leitura; ocultos e `__MACOSX` ignorados; pasta-raiz única removida.
- Os 40 avisos de desenho aparecem só na revisão do pacote; o Diagnóstico usa os níveis 1 e 2.
- Limites: app 500 arquivos / 64 MB; MCP 2000 arquivos / 32 MB de texto.
- Pendente: teste com o JSON real do backend (o aceite do marco depende dele); e2e e seletor de pasta em Chrome real não rodados.

### #172 — B3: telas com componentes na app (schema v10; MCP 0.5.0)

- Desenha a primeira anotação tipada própria cujo tipo tem componente; herdadas não desenham. O filtro "sem anotação" não se aplica a marcação que desenha.
- Ordem entre irmãs: `reorderMarking` / `move_marking`; a trava não impede; na proposta, `position` só aparece se a ordem relativa muda (criada antes de irmã gera `position` com `from: null`).
- Arrumar: container escolhido e internos; `hug` remedidos (nunca abaixo de `minSize`), fixas/`fill` mantêm o eixo principal, `stretch` estica o cruzado; a trava impede; sem mudança, sem undo; nunca na carga, no MCP ou ao aplicar proposta.
- `minSize`: criar e definir retângulo recusam abaixo; ajuste fino e gesto prendem.
- "Não cabe" = pendência `component-overflow`, só avisa. Medidor aproximado até o canvas montar, Konva depois; o MCP é sempre aproximado.
- Tela em branco: cor e tamanho editáveis, não troca por foto, sem "Copiar recorte", só criada no editor; `get_marking_image` devolve desenho simplificado.
- Janela Biblioteca à esquerda (atalho 8), que vira aba do Catálogo na B5. Zoom semântico sem cartão nem nome.
- **Decisões do dono:** uma versão do MCP por épico (0.5.0); snapshot por PR; rc só na última fase via rótulo `mcp-rc`; preview automático a cada PR pelo Deploy existente (Pages só aceita deploy da `main`); roteiros principais executáveis pelo Cowork sozinho, R0.5 e R6.2 viraram sob demanda (RF/RA, RA com e2e); limite de passo do guia 1.200 → 1.300.
- Orçamentos: quadro inteiro 24 ms; editar campo e zoom 16 ms.
- Em aberto (levados adiante): especialização aplicada no mesmo lote MCP não enxerga componentes; hover só com a roda; preview com build antigo (não reproduzido); `click_button` do dialog-pilot acerta botões de outras abas; observações de layout a 1098 px; `move_marking` para o índice atual é silencioso; temporário `.proposal.json.*.tmp`; `csp.spec.ts` oscila localmente.
- Achados do Cowork (3 rodadas) corrigidos: componente desenhado com "Ocultar sem anotação", Arrumar remede `hug`, slot do Row sem tracejado, sem sobreposição nem rolagem horizontal a 1098 px, plural "1 mudança aplicada".

### #174 — B4: atualização da biblioteca (migrações, impacto, `plan_library_update`)

- Contrato só na v4 com cópia aplicada; v1–v3 sem `migrations` (inválido vira pendência); sem cópia aplicada não compara, mas a cadeia roda.
- Pendência em vez de perda: `map-values` deixa `unknown-option`; `fill-field` troca por `default` só o valor inválido (`invalid-value`, conta como perda).
- `rename-field` reescreve as refs em todo o projeto; entre formas diferentes apaga a origem e conta perda.
- `rename-type` não troca a camada (pendência `layer-mismatch`); `remove-type` com `delete` apaga as anotações vinculadas, cada uma é perda.
- Atualização aditiva mantém o diálogo do pacote (validação), sem seção de impacto.
- Pacote copiado, não movido (fica na pasta da proposta; o zip só leva enquanto não aplicada).
- A visão Proposto não desenha componentes novos (limitação conhecida).
- `readSpecInput` do MCP procura primeiro na pasta do projeto, depois nas raízes.
- MCP segue 0.5.0; ferramenta nova `plan_library_update`; erros `invalid-library` e `spec-missing-migrations`; sai `package-spec-unsupported`.
- Pedidos do dono: o Deploy grava `deploy.json` com o commit da `main` publicado, roda os checks da `main` só se mudou e, se falharem, republica a produção do commit publicado e o preview sai (sem `deploy.json`, falha bloqueia como antes); guia do testador com aba em foco via link clicado de aba de apoio e `relato.md` sempre em disco e anexado no fechamento.

### #175 — B5: Catálogo

- A janela `library` foi substituída por `catalog` (Ctrl+Shift+9; o 8 ficou vago; layouts salvos migram; trocar = constante em `src/store/toolWindows.ts` + textos).
- Links nos documentos: `mapping://<specId>/<typeId>` (ou `mapping://<typeId>`); destino desconhecido avisa e não navega.
- Playground e galeria seguem o `sizing`: `hug` medido (de `minSize` ao dobro de `size`); `fill` e números ficam no `size`. Fora de projeto, campos `ref` desabilitados.
- Página do componente em diálogo grande no editor; na tela inicial, lista e página lado a lado; mais de um pacote → seletor de biblioteca. Textos em `src/i18n/catalog.ts`.
- Rodada R10 do Cowork: 8/8 ok, 2 achados baixos corrigidos (rótulo cortado no playground: largura ou altura digitada fixa o eixo até "Restaurar valores"; tabelas do Catálogo sem palavras partidas e com rolagem horizontal). Observações: navegar abre no topo; "Destino não encontrado" fixo no topo.
- Guia do testador: link da aba em foco fixo (`elementFromPoint`), "Disco primeiro", regra do navegador e do link de PR, "Primeiros 10 minutos", preparo do R10 sem projeto telas, console lido ao abrir a aba. Sugestão ao Fechamento: Cowork com modelo mais leve, só com o link do PR, para validar "Primeiros 10 minutos".

### #176 — Fechamento

- `lab/README.md` registra o que foi para o produto (motor, validação, desenho, Catálogo) e o que fica no laboratório (páginas e o pacote `mapping-viewer`); páginas cujo motor já está em `src/` apontam para ele.
- Esta seção saiu do `PLAN.md` para o histórico; `PLAN.md` ficou sem etapa em andamento; `CLAUDE.md`, `README.md` e `docs/ROADMAP.md` marcam a Biblioteca como concluída e "Depois, sem data" foi revisto.
- O PR leva o rótulo `mcp-rc`: ao mesclá-lo em `epic/biblioteca` sai `mcp-v0.5.0-rc.<n>`. A estável `mcp-v0.5.0` é tag do dono, depois do merge do épico na `main`, e apaga as rc.
- Correções feitas no próprio PR, depois da rodada do Cowork: `d5757b2` (R3.11, Diagnóstico sem a seção Biblioteca ao reabrir), `870198b` (R10.5, tela "Abrir biblioteca"), `a536c98` (teste `tests/e2e/csp.spec.ts` instável) e `12218c1` (guia: schemaVersion 10 no preparo do R3.8; R9.11 com 3 marcações que não cabem). R3.10 do guia reescrito sem números por arquivo.
- **Decisão do dono:** corrigir os achados no próprio PR #176, antes da release candidate, em vez de abrir etapa de correção.
- O merge do épico `epic/biblioteca` na `main` continua sendo decisão do dono e não acontece neste PR.

---

## Rodada do Fechamento (R0, R1, R3, R9, R10, A18 e passada visual)

**Relato:** [`relato-2026-10-18-fechamento.md`](relato-2026-10-18-fechamento.md). Build `33be65a · 2026-10-18` (PR #176), preview do branch no Chrome 155 (Windows, DPR 1,25), MCP `0.5.0-snapshot.pr176+33be65a`. Modo dirigido, 82 passos: **80 ✅ e 2 ❌**.

| Roteiro | Resultado |
| --- | --- |
| R0 | 6/6 |
| R1 | 24/24 |
| R3 (R3.1 a R3.17) | 16 de 17 (❌ R3.11) |
| R9 (R9.1 a R9.15) | 15/15 |
| R10 (R10.1 a R10.8) | 7 de 8 (❌ R10.5) |
| A18 (teste avançado) | 10/10 |
| Passada visual (Catálogo, Biblioteca) | 2/2 |

**Achados**

1. **R3.11 — Diagnóstico sem a seção "Biblioteca" ao reabrir o projeto.** Causa: `openLoaded` em `src/app/controller.ts` não repassava `libraryIssues` ao abrir um projeto já gravado; a seção só aparecia logo depois de aplicar ou atualizar na mesma sessão. Correção: `d5757b2` (repassa `libraryIssues`, com teste).
2. **R10.5 — tela "Abrir biblioteca": clicar num link do documento não voltava ao topo e o aviso "Destino não encontrado" ficava fora da tela.** Causa: a tela não tinha altura limitada, então a janela inteira rolava (a página ficava em 400 px e encostava na borda esquerda). Correção: `870198b` (altura limitada em `.app-catalog`, com margem; lista e página rolam por si, o link leva ao topo e o aviso fica visível).

Também: o teste `tests/e2e/csp.spec.ts` oscilava (exportava em loop durante a importação); `a536c98` passou a esperar as 4 linhas da Árvore. E o guia foi ajustado (`12218c1`).

**Reteste:** [`relato-2026-10-18-reteste.md`](relato-2026-10-18-reteste.md), build `a536c98 · 2026-10-18`: preparo (9 itens) e 8 passos (R3.10, R3.11, R10.1 a R10.5, passada visual do Catálogo), **todos ✅**; os dois achados confirmados corrigidos (R3.11 também depois de recarregar a página). Divergência de texto do guia no R3.10 (31 avisos em `material3.spec.json` e 11 em `components/…`, o total de 42 confere) corrigida no `docs/TESTING.md`.

**Pontos não conferidos por inteiro** (dentro de passos ✅): "Propostas antigas abrem" (A18.2), valor fora das opções por `map-values` (A18.5), `disabled` do botão Atualizar por script (A18.10), "Conferindo o pacote…" (R3), tooltips (visual) e o botão Copiar do Diagnóstico (R3.11, conferido no reteste).

## O que ficou para depois

Sem correção nesta etapa:

- **Teste com o JSON real do backend** (pendência da L2): depende do dono; o aceite do marco da B2 (design system do Figma convertido) segue aberto até lá.
- **Campos de tabela** no lugar de listas numeradas nos componentes.
- **Props no próprio nó** (hoje as propriedades do componente ficam nos campos do tipo).
- **Vários slots por componente.**
- **Exportar durante uma importação** pode não abrir o diálogo (progresso e mensagem do editor são compartilhados).
- **"Adicionar à tela" duas vezes** empilha as marcações no mesmo ponto.
- **Camadas "Componentes" extras** depois de "Converter em camadas livres".
- **Mensagem de cabeçalho do diálogo do pacote enganosa:** diz "O pacote não tem uma especialização legível" quando o erro é de conteúdo (o erro real vem logo abaixo).
- **`.tmp` do MCP em `proposals/`** (`.proposal.json.*.tmp`) quando apagar é proibido.
- **Pontos "Em aberto" da B3 que ainda valem** (seção #172): especialização aplicada no mesmo lote MCP não enxerga componentes; hover só com a roda; `click_button` do dialog-pilot acerta botões de outras abas; observações de layout a 1098 px; `move_marking` para o índice atual é silencioso. (O `csp.spec.ts` instável foi corrigido no Fechamento; "preview com build antigo" não foi reproduzido.)
- **A visão Proposto não desenha componentes novos** (limitação conhecida da B4).
- Do roadmap: "Depois, sem data" em [`../ROADMAP.md`](../ROADMAP.md).

---

## Rodada completa do Cowork (2026-10-18, build 62b9c54) e correções

**Rodada:** R0 a R10 e passada visual, sem interação do dono. 129 passos: **125 ✅**, 3 ❌/⚠️ (R4.6, R9.7 e Visual: Diagnóstico) e 1 não executado (R6.1, arraste com Esc). Achados: 1 médio e 4 baixos. Nenhum perde dados. MCP 0.5.0 sem mudança.

**Achados e correções**

1. **R9.7 — médio, não é defeito.** A ordem entre irmãs chega certa ao Konva (conferido no modelo, no `CanvasController` e no navegador). O Text field do Material 3 não tem fundo e, nas coordenadas do guia, o Button cobria só ~2 px do texto. Correção: guia ajustado (Button em X 80, Y 230) e teste de regressão em `tests/canvas/CanvasControllerComponents.test.ts`.
2. **Diagnóstico — baixo.** As ações não cobriam as abas: a faixa de abas rola e a aba ficava cortada na borda. Correção: o `Tabs` mantém a aba escolhida à vista; e2e em `tests/e2e/narrowLayout.spec.ts`.
3. **R4.6 — baixo, não é regressão.** O build da rodada 7 já mostrava o nome proposto. O título de Detalhes, a trilha e a barra seguem a visão, como a Árvore (o painel usa o projeto à vista). Correção: só o guia.
4. **R7.2 — baixo.** O rastro `folders.reopen` não grava mais quando o resultado é o projeto inconsistente (diálogo de reparo, caminho normal), salvo se houve pedido de permissão.
5. **R5.3 — baixo.** Rejeitar a anotação criada pelo ✕ do cartão com o mouse abre a nota sugerida com o foco, como o popover. A remoção de anotação, que usa o mesmo controle, também.
6. **R5.4a — observação tratada como defeito.** Limpar a seleção na revisão leva os Detalhes ao nível da proposta, em vez de manter o último item com "Nada selecionado".

Também nesta rodada:

- **Camadas:** o selo truncado da especialização ganha o `Tooltip` com o nome inteiro.
- **Cliente stdio** (`scripts/testing/mcp-stdio-client.mjs`): sem argumentos, lê as raízes do `.mcp.json` da pasta WS.
- **Guia (`docs/TESTING.md`):** schema 10 (R7.1/R7.3); backups `mapping.v10` (R6.5); três rejeitadas (R5.4a); nome do arquivo da imagem (R5.1); chips lado a lado (R9.5); tela2 sem o R6.2 (R6.7); alternativas ao arraste (R9.9, R10.7); larguras que variam com a fonte (R10.4); linha de validação (R10.1); atalhos com foco num campo; raízes do cliente stdio.
- **R6.1 pendente de decisão do dono:** arraste com Esc durante a gravação mexe com a integridade do `mapping.json`, e o agente não consegue segurar o botão e apertar Esc. O passo fica marcado como pendente de decisão, para o dono escolher entre manter como passo [pessoa], mover para roteiro sob demanda ou cobrir por e2e.

## Rodada dirigida de 2026-10-19 (conferência do PR #177) e correções

Relato: [`relato-2026-10-19-dirigida.md`](relato-2026-10-19-dirigida.md) (build `6e66293`): 16 passos, 14 ✅, 1 ❌ (R5.3, média) e 1 achado baixo (paleta).

- **R5.3 (média), terceira rodada com o mesmo sintoma:** a nota sugerida não abria no Chrome real ao rejeitar a anotação criada (✕ do cartão ou Rejeitar do popover). Duas causas, vistas no Playwright: o Chrome dispara `blur` ao remover o campo focado quando o cartão remonta, e esse `blur` apagava o pedido da nota (o jsdom não dispara, por isso os testes de componente passavam); e o critério `e.detail > 0` tratava como teclado o clique sintético da extensão. Correção: o `NoteArea` ignora o `blur` da remoção para o pedido (o texto ainda grava) e `clickSource.ts` só conta como teclado Enter/Espaço no próprio botão. E2e com clique real e sintético nos dois caminhos.
- **Paleta (baixa):** sem mudança. "A tela sob o centro da vista vale antes da seleção" é a regra registrada (`src/ui/componentTarget.ts`, `docs/ARCHITECTURE.md`, R10.7); o R9.7 do guia passou a dizer em que tela adicionar e que ela fica no centro. Trocar a regra (seleção primeiro) fica para o dono decidir.
- **Tabs (observação):** a aba ativa também volta à vista quando a faixa é estreitada depois (`ResizeObserver`); teste de componente e e2e.

## Rodada dirigida de conferência do PR #179 e correções

Relato: [`relato-2026-10-19-dirigida-pr179.md`](relato-2026-10-19-dirigida-pr179.md) (build `bcfbaf1`): 10 passos, 8 ✅, 1 ❌, 1 ⚠️. A nota sugerida (R5.3a a R5.3c) passou no Chrome real.

- **R5.3d (média):** decidir pelo teclado remontava o cartão (ou o popover) e o foco caía no `body`. O store da revisão guarda qual controle tinha o foco (`requestControlFocus`) e o par ✓ ✕ novo o recupera ao montar, só se o foco se perdeu; e2e com teclado real nos dois caminhos.
- **Detalhes fora da tela a ~900 px (média):** as larguras guardadas das laterais não olhavam a largura real da janela (a regra antiga só recolhia o Detalhes na primeira visita). `fitSideWidths` encolhe a direita e depois a esquerda até o mínimo de cada uma para o canvas manter `--size-canvas-min`, sem mudar os tamanhos guardados; e2e com layout guardado a 1100, 902 e 900 px.
- **Guia (R9.7):** como centrar a tela (fechar a janela de baixo, **Enquadrar tudo**, arrastar o fundo do canvas).

Conferência curta do PR #179 ([`relato-2026-10-19-dirigida-pr179-curta.md`](relato-2026-10-19-dirigida-pr179-curta.md), build `7dcee05`): 6 de 6 ✅, sem achados. Fica como observação o foco no `body` depois de **Limpar** com o mouse no popover (o popover continua aberto).

**Decisão do dono (2026-10-19): o Adicionar do Catálogo segue a seleção primeiro.** Container selecionado → dentro dele; seleção numa tela (ou numa marcação dela) → essa tela, centrado no centro da vista se ele cai nela, senão no centro da tela; sem seleção → a tela sob o centro da vista. Se a marcação nova fica fora da área visível, a vista faz um pan mínimo até ela, sem mudar o zoom (`revealRect` em `src/canvas/viewport.ts`). O arraste do Catálogo para o canvas entrou nas Evoluções do `docs/ROADMAP.md`.

**Decisão do dono (2026-10-19): o R6.1 passa a ser coberto por e2e.** `tests/e2e/folder.spec.ts` ("renomear e cancelar o arraste com Esc deixa o nome novo e o rect antigo", com Esc antes e depois da gravação): nome novo e `rect` antigo no `mapping.json`, uma gravação só; o teste falha se o Esc deixar de cancelar o gesto. O passo saiu do R6 e virou o roteiro sob demanda **RB**.
