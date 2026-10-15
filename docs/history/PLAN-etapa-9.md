# Histórico — Etapa 9, ajustes do teste manual avançado (seção do antigo PLAN.md)

> Fases 9.1 a 9.7 concluídas (o plano entrou no PR #145; fases nos PRs #146 a #149, #151 e #152; o handoff do Claude Design, feito pelo dono, no #150; o fechamento no PR desta fase). Origem: o teste manual avançado do dono (seção 9 do [`../TESTING.md`](../TESTING.md)) sobre o build `3e7a660 · 2026-10-15`. As fases foram mergeadas **sem teste manual**, por pedido do dono; o teste fica para a rodada dirigida do Cowork descrita em [`../TESTING-COWORK.md`](../TESTING-COWORK.md) ("Rodada dirigida da etapa 9"). Referência atual: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (propostas, revisão e "Detalhes na revisão"), [`../FORMAT.md`](../FORMAT.md) (schema v9), [`../SPEC-FORMAT.md`](../SPEC-FORMAT.md) (`path` no `code`; o campo `codeRef` ignorado), [`../MCP.md`](../MCP.md) e [`../AGENT-GUIDE.md`](../AGENT-GUIDE.md) (MCP 0.4.0), [`../TESTING.md`](../TESTING.md) (R3, R4 e R5 reescritos) e, em `docs/redesign/`, o briefing ([`BRIEF-REVIEW-DETAILS.md`](../redesign/BRIEF-REVIEW-DETAILS.md)) e o handoff aprovado ([`HANDOFF-REVIEW-DETAILS.md`](../redesign/HANDOFF-REVIEW-DETAILS.md)) dos Detalhes na revisão.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da 9.7, marcados ao fechar a etapa. Onde o texto descreve a regra da época (a execução por modelo, as fases a fazer, o que "o handoff decide"), ficou como estava. Depois dela vêm o fechamento (as decisões consolidadas dos PRs) e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 9: ajustes do teste manual avançado

### Objetivo

Corrigir o que o dono encontrou ao começar o teste manual avançado (seção 9 do [`docs/TESTING.md`](docs/TESTING.md)) sobre o build `3e7a660 · 2026-10-15` (canal estável), antes do uso com pessoas. São quatro pontos, levantados um a um na sessão de planejamento:

1. **Não há como apagar uma proposta.** A app só lista, revisa e aplica; o MCP só retira (`withdraw_proposal`, que muda o status e não apaga nada).
2. **O `code` da especialização não tem onde dizer em que arquivo está o símbolo.** Ex.: o tipo `Button` mapeia para a função `TDSButton` do BFF, e o caminho do `.kt` que a define foi parar no `notes`.
3. **O `codeRef` guarda onde o código foi gerado, e isso não ajuda a gerar.** Decisão do dono: o mapeamento e a especialização só guardam o que um agente lê para decidir como o código deve ser; referência ao código gerado sai do formato.
4. **Os Detalhes na revisão não mostram a marcação.** Na revisão, Detalhes troca o painel normal por cartões Antes/Depois; numa criação (importação nova, "tudo novo") o cartão é uma linha de resumo e não dá para ver os campos. O dono quer o mesmo painel do modo normal, com um marcador em cada campo alterado que mostra o valor atual e a decisão. Precisa de desenho no Claude Design.

Nada disso está nas Evoluções nem na lista do marco do [`docs/ROADMAP.md`](docs/ROADMAP.md). Os pontos 2 e 3 mudam o formato (schema v9 do `mapping.json`, especialização e MCP 0.4.0); os pontos 1 e 4 são da app.

### Decisões

- **Mesmas regras das etapas anteriores:** um branch e um PR por fase, a partir da `main`, na ordem abaixo; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`, e `npm run build:mcp` nas fases que tocam `mcp/`); defeito com o teste que o reproduz antes da correção, ajuste com teste de componente; nenhuma string fora de `t()`, nenhum valor de design fora dos tokens, controles e ícones só de `src/ui/controls/` e `src/ui/icons.tsx`, toda mutação por action do store; descrição do PR com Resumo, Como testar (desktop; o branch pode ser publicado pelo `workflow_dispatch`) e Decisões tomadas; checkboxes da fase marcados aqui no mesmo PR; roteiro do `docs/TESTING.md` que passa a descrever outro comportamento é atualizado no mesmo PR (`tests/tooling/testingGuide.test.ts`).
- **Apagar proposta (ponto 1):** só na app (o MCP não muda; o agente continua com `withdraw_proposal`); só propostas que **não estão abertas** (retirada, substituída, aplicada); **apaga de fato** a pasta `proposals/<id>/` (o `proposal.json` e as imagens), com confirmação e sem desfazer; **uma por vez**, pelo menu ⋯ da linha na janela Propostas, que só existe fora da revisão. Proposta aplicada nesta sessão: o vínculo da aplicação no histórico (`HistoryLink`) sai; o desfazer daquela entrada, se o executor confirmar que é seguro, continua voltando o projeto sem tocar na proposta (as imagens copiadas para `images/` seguem a limpeza normal da sessão); se não for, a entrada sai do histórico e a confirmação avisa.
- **`path` no `code` (ponto 2):** `code.<plataforma>.path` opcional, irmão do `symbol`: o arquivo que define o símbolo, **relativo à raiz do repositório da plataforma** (a mesma regra do caminho de código de hoje, `isValidCodePath`); sem linha. Vira link pelo `urlTemplate` e caminho local pelo `localPath` dos repositórios por plataforma (`platformRepos`, que ficam). **Sem nova `formatVersion`**: vale na v2 e na v3. Na app, nos Detalhes de uma anotação tipada, uma linha "Definição: Plataforma · arquivo" por plataforma com `path`, com **Abrir no repositório** e **Copiar caminho**. No MCP, o `code` de `get_code_hints` e de `get_marking` traz o `path` com o endereço, o arquivo local e se ele existe (só `stat`, como hoje).
- **`codeRef` removido (ponto 3):** sai do formato, não só da documentação.
  - **Projeto:** schema **v9**; a migração v8 → v9 descarta os valores dos campos `codeRef` (backup pré-migração em `backups/`, como toda migração).
  - **Especialização:** um campo `"type": "codeRef"` continua sendo lido e é **ignorado** (o campo sai do tipo), com um aviso na importação e no `validate_specialization`; as cópias em `specs/` dos projetos existentes continuam abrindo. Nenhuma `formatVersion` nova.
  - **O que fica:** plataformas, `code` por tipo (com o `path`) e repositórios por plataforma. O aviso "plataforma sem repositório" passa a valer para plataforma usada em `code.path`.
  - **`find_by_code`** passa a procurar o `path` e o `symbol` dos **tipos** das especializações aplicadas e devolve os tipos e as anotações desses tipos ("estou neste `.kt`: que tipos o usam e em que marcações").
  - **Proposta antiga** com mudança num campo `codeRef`: a mudança aparece como inválida na revisão (campo inexistente) e não é aplicada; o agente reenvia sem ela.
  - **MCP 0.4.0** (respostas e operações mudam de forma incompatível), uma release só para os pontos 2 e 3; leva junto o código `unknown-type` de `mcp/batch.ts` no registro de erros e no `AGENT-GUIDE.md` (pendente da auditoria da etapa 8, "próxima mudança do MCP"). A tag `mcp-v0.4.0` é do dono, depois do merge da 9.4.
- **Detalhes na revisão (ponto 4):**
  - O mesmo painel dos Detalhes do modo normal (`MarkingPanel`/`SelectionPanel` com as anotações), **somente leitura**, sobre o **projeto à vista** (`review.derived.shownProject`): acompanha a visão Atual/Proposto, como o canvas e a Árvore.
  - Cada campo alterado ganha um **marcador focável**; hover ou foco abre um popover com o valor atual, o proposto e, nas alterações, a **decisão daquele campo** (cada campo é uma mudança: `name`, `rect`, `values.<campo>`, cada par). Em conflito, o popover mostra Atual, Antes e Depois. Os atalhos da revisão continuam valendo.
  - **Criação:** os campos mostram o marcador "novo" sem decisão própria; a decisão fica no cabeçalho do item e no de cada anotação criada (criação é uma mudança da entidade inteira).
  - **Remoção:** o painel mostra o projeto atual com o estado "será removida" e a decisão no cabeçalho.
  - **Cabeçalho do item:** decisão de três estados, notas, "item trancado" e "conjunto inválido".
  - **O que não tem campo no painel normal** (`source`, posição e troca de arquivo da imagem com **Comparar**, camadas, especializações, repositórios): os níveis Proposta, Projeto e Imagem ficam como hoje ou numa seção "Outras mudanças" no fim do painel; o handoff decide.
  - **Desenho antes do código:** a 9.1 escreve o briefing; o dono roda no Claude Design e o handoff entra em `docs/redesign/HANDOFF-REVIEW-DETAILS.md` antes da 9.5. O handoff manda nos detalhes visuais; o que contrariar uma decisão acima vira pergunta no PR da 9.5.
  - O índice "mudanças por entidade e campo" é estado derivado da revisão (`createReviewDerived` em `src/store/derived.ts`), sem regra de negócio nova no modelo.
- **Ordem:** o briefing vai primeiro para o Claude Design correr em paralelo às fases 9.2 a 9.4. A 9.3 e a 9.4 vão nessa ordem (o `path` antes da remoção, que reaproveita a exibição do `codeRef` para a linha "Definição").

### Execução: modelo por fase

Pedido do dono (2026-10-15): cada fase vai para um agente executor com o modelo que ela pede, para gastar o limite de uso só onde rende; a sessão de planejamento coordena (passa a fase, revisa o diff contra o plano e o `CLAUDE.md`, roda os gates e abre o PR). Fase em Sonnet que voltar com problema que a revisão não corrija em pouco tempo é refeita em Opus, com registro no PR.

| Fase | Modelo | Por quê |
| ---- | ------ | ------- |
| 9.1  | (sessão de planejamento) | Só documentação, escrita durante o planejamento |
| 9.2  | Sonnet | Escopo fechado e com padrão a copiar; o ponto delicado (vínculo no histórico) é conferido na revisão |
| 9.3  | Sonnet | Campo opcional novo seguindo o caminho do `codeRef` |
| 9.4  | Opus   | Atravessa o projeto inteiro: migração v9, especialização com campo ignorado, `find_by_code`, propostas antigas e MCP |
| 9.5  | Opus   | Ponto de extensão nos painéis normais sem quebrá-los, índice derivado e orçamentos de desempenho, interpretando o handoff |
| 9.6  | Sonnet | Compõe a decisão sobre o que a 9.5 deixar pronto, mais testes e guia |
| 9.7  | Sonnet | Documentação; precisa ler os PRs e consolidar as decisões |

### Fora desta etapa

- Apagar várias propostas de uma vez, arquivar (esconder sem apagar) e apagar pelo MCP (`delete_proposal`).
- Linha no `code.<plataforma>` (o `symbol` localiza; a linha muda a cada edição).
- Aposentar o `codeRef` só na documentação, mantendo o código (descartado: o dono quer o formato enxuto).
- As observações da lista do marco, exceto os achados baixos 4 e 10 do portão (lista da revisão), que entram na 9.5 ou na 9.6 só se o handoff tocar a janela Propostas.

### Fases

#### 9.1 — Briefing dos Detalhes na revisão (Claude Design)

**Ponto 4.** Só documentação: o pedido para o Claude Design, no formato do [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) (de onde vieram a revisão e os cartões de hoje).

**Toca em:** novo `docs/redesign/BRIEF-REVIEW-DETAILS.md`, `PLAN.md`.

- [x] Estado atual com `arquivo:linha`: a troca de painel na revisão (`src/app/EditorPanel.tsx`), `ReviewDetails`, `ChangeCard`, `DiffValue` e o resumo de uma criação (`src/ui/review/changeText.ts`, `valueParts`); o painel normal (`MarkingPanel`, `SelectionPanel`, `AnnotationsPanel`, `TypedFields`, `KeyValueGrid`) e as seções recolhíveis
- [x] As decisões do ponto 4 acima, como requisitos
- [x] Restrições: tokens de `src/theme/tokens.ts` (claro e escuro), controles de `src/ui/controls/` e ícones de `src/ui/icons.tsx` (o que faltar vem pedido como token, controle ou ícone novo), só desktop (900 px a 1920 px), modelo de foco e política de teclado (`docs/ARCHITECTURE.md`, "Foco e teclado"), pt-BR e en-US
- [x] Estados a desenhar: marcação alterada (um campo, vários, tabela, par livre, `rect`, pai); criada ("tudo novo", com anotações tipadas e livres); removida; conflito; item trancado; conjunto inválido; campo com decisão aceita, rejeitada e pendente; visão Atual e Proposto; imagem trocada; níveis Proposta e Projeto; notas; teclado (marcador focado, popover aberto)
- [x] O que o handoff precisa trazer (telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto) e onde ele entra (`docs/redesign/HANDOFF-REVIEW-DETAILS.md`)

**Aceite**: o dono cola o briefing no Claude Design sem precisar explicar nada além dele; o handoff volta com todos os estados listados.

#### 9.2 — Apagar proposta

**Ponto 1.** Ajuste com regra no modelo, armazenamento e a sessão das propostas.

**Toca em:** `src/model/proposalView.ts` (quem pode ser apagada: status diferente de `open`), `src/storage/types.ts` (`ProjectStorage.removeProposal`), `src/storage/folder.ts` (apaga `proposals/<id>/` inteira), `src/storage/local.ts` (apaga as chaves `proposals/<id>/…` e marca "não exportado", como `writeProposal`), `src/store/proposals.ts` (`remove(id)` na fila das propostas: relê o arquivo e recusa se ele voltou a estar aberto ou ficou ilegível; tira da lista sem o aviso "apagada por fora"), `src/store/history.ts` (tirar o `HistoryLink` daquela proposta), `src/store/review.ts` (a entrada do retomar sai do blob), `src/ui/review/ProposalRow.tsx` e `ProposalList.tsx` (menu ⋯ com **Apagar proposta…**, confirmação `alert`, foco na ação da linha seguinte ou no título da lista), `src/i18n/*`, `tests/model/proposalView.test.ts`, `tests/storage/proposals.test.ts`, `tests/store/proposals.test.ts`, `tests/components/review/proposalList.test.tsx`, `docs/ARCHITECTURE.md` (propostas), `docs/TESTING.md` (R4: um passo que apaga a proposta aplicada).

- [x] Regra no modelo com teste: só retirada, substituída e aplicada
- [x] `removeProposal` na pasta e no projeto local, com testes (o zip exportado depois não leva a proposta)
- [x] `proposals.remove(id)` na fila, com testes: recusa se o arquivo mudou para aberto ou ficou ilegível; a conferência seguinte (`scan`) não avisa "apagada por fora"; a nova que tinha `supersedes` para ela continua listada sem erro
- [x] Histórico: a entrada da aplicação perde o vínculo (decisão acima), com teste de desfazer e refazer depois de apagar
- [x] Interface: menu ⋯ só nas linhas que não estão abertas, confirmação com o título e o aviso de que não dá para desfazer, foco depois de apagar; teste de componente
- [x] `docs/ARCHITECTURE.md` e o passo novo no R4 do `docs/TESTING.md`

**Aceite**: numa pasta, apagar a proposta aplicada do `proposta-exemplo` remove `proposals/<id>/` do disco, a linha some sem aviso "apagada por fora" e o `Ctrl+Z` não dá erro; uma proposta aberta não tem a ação.

#### 9.3 — Arquivo do símbolo no `code` da especialização

**Ponto 2.** Formato da especialização, modelo, app e MCP (sem release: a versão sobe na 9.4).

**Toca em:** `src/model/spec.ts` (`path` na entrada de `code`), `src/model/codeRefs.ts` (`codeLink` e `codeLocalPath` para um caminho de tipo), `src/model/codeBlueprint.ts` (`path` na planta), `src/ui/` (linha "Definição" nos Detalhes da anotação tipada, reaproveitando `CodeRefs.tsx`), `src/i18n/*` (e a ajuda de especializações, `src/i18n/specHelp.ts`), `mcp/codeViews.ts` e `mcp/codeFiles.ts` (endereço, arquivo local e existência do `path`), `docs/SPEC-FORMAT.md`, `docs/spec.schema.json`, `docs/AGENT-GUIDE.md`, `docs/MCP.md`, `.claude/skills/spec-author/SKILL.md` (preencher o `path` quando o arquivo for conhecido), `examples/specs/sdui.json`, `tests/model/spec.test.ts`, `tests/model/codeBlueprint.test.ts`, `tests/model/codeRefs.test.ts`, `tests/mcp/code.test.ts`, `tests/components/` (Detalhes), `tests/i18n/specHelp.test.ts`, `docs/TESTING.md` (R3).

- [x] Validação com testes: `path` opcional, não vazio, relativo à raiz (a regra de `isValidCodePath`), nas `formatVersion` 2 e 3
- [x] `codeBlueprint` com o `path`; link e caminho local do tipo com testes
- [x] Detalhes: linha "Definição: Plataforma · arquivo" com **Abrir no repositório** e **Copiar caminho**; teste de componente
- [x] MCP: `path`, endereço, arquivo local e `exists` no `code` de `get_code_hints` e `get_marking`; teste em `tests/mcp/code.test.ts`
- [x] `SPEC-FORMAT.md`, `spec.schema.json`, `AGENT-GUIDE.md`, `MCP.md`, a skill e o `sdui.json` com o `path`; o R3 confere a linha "Definição"

**Aceite**: uma especialização com `code.bff = { symbol: "TDSButton", path: "…/TDSButton.kt" }` importa sem erro; os Detalhes do Button mostram "Definição: BFF · TDSButton.kt" com o link do repositório; o `get_code_hints` devolve o caminho e o endereço.

#### 9.4 — Remoção do `codeRef` e MCP 0.4.0

**Ponto 3.** Fase grande (estimativa de 1,5 a 2 dias), num PR só: tirar o campo do modelo quebra a app e o MCP juntos.

**Toca em:** `src/model/` (`types.ts`, `schema.ts` e `migrations.ts` para a v9; `spec.ts` lê e ignora `codeRef`; `typed.ts`, `issues.ts`, `typedDisplay.ts`, `codeRefs.ts`, `specWarnings.ts`, `index.ts`; `findByCode` pelos tipos), `src/store/project.ts` e `src/store/derived.ts` (aviso de plataforma sem repositório pelo `code.path`), `src/ui/` (`CodeRefField.tsx` sai; `CodeRefs.tsx` fica só para a "Definição"; `TypedFields.tsx`, `AnnotationSummary.tsx`, `PlatformRepos.tsx`, `HelpDialog.tsx`), `src/theme/details.css`, `src/i18n/*` (com `specHelp.ts`), `mcp/` (`operations.ts`, `batch.ts`, `views.ts`, `codeViews.ts`, `codeFiles.ts`, `findByCode.ts`, `changes.ts`, `tools.ts`, `server.ts`, `modelErrors.ts`, `errors.ts`, `version.ts`), `docs/FORMAT.md` (v9 e a migração), `docs/SPEC-FORMAT.md`, `docs/spec.schema.json`, `docs/MCP.md`, `docs/AGENT-GUIDE.md` (o fluxo "Do mapeamento ao código" sem o passo de registrar onde implementou), `docs/ARCHITECTURE.md`, `docs/TESTING.md` (R3 reescrito, R3.6, e a seção 6), `examples/specs/sdui.json` (o Screen sem `implementacao`), `examples/workspace/README.md` e `AGENTS.md`, `.claude/skills/spec-author/SKILL.md`, `README.md`, os testes que citam `codeRef` em `tests/model`, `tests/store`, `tests/components` e `tests/mcp`, e `tests/e2e/codeRefs.spec.ts` (vira o e2e da "Definição").

- [x] Migração v8 → v9 com teste: valores de campos `codeRef` descartados, backup pré-migração gravado; projeto v8 sem `codeRef` migra sem mudar mais nada
- [x] Especialização com campo `codeRef`: importa, o campo some do tipo e aparece o aviso (app e `validate_specialization`); testes
- [x] Pendências, exibição (Detalhes, Lista, resumo do zoom semântico) e editor sem `codeRef`; aviso de plataforma sem repositório pelo `code.path`
- [x] `find_by_code` pelo `path` e pelo `symbol` dos tipos, com as anotações desses tipos; testes no modelo e no MCP
- [x] Proposta antiga com mudança num campo `codeRef`: inválida na revisão e não aplicada; teste
- [x] MCP 0.4.0: sem `codeRefs` nas respostas nem `codeRef` nas operações; `unknown-type` no registro de erros e no `AGENT-GUIDE.md`; `npm run build:mcp` e `tests/mcp/version.test.ts`
- [x] Documentação, exemplos, skill e o R3 do guia sem `codeRef`; nenhum nome de plataforma no código do núcleo (`src/` e `mcp/`)

**Aceite**: um projeto v8 com `codeRef` preenchido abre, migra para v9 com backup e grava sem os valores; uma especialização antiga com campo `codeRef` importa com aviso; `grep -ri coderef src mcp` só encontra a migração e a leitura que ignora o campo; o dono cria a tag `mcp-v0.4.0`.

#### 9.5 — Detalhes na revisão, parte 1: o painel normal com os marcadores

**Ponto 4.** Depende do handoff (`docs/redesign/HANDOFF-REVIEW-DETAILS.md`) no repositório.

**Toca em:** `src/app/EditorPanel.tsx` (na revisão, o painel normal sobre o projeto à vista), `src/ui/MarkingPanel.tsx`, `SelectionPanel.tsx`, `AnnotationsPanel.tsx`, `TypedFields.tsx`, `KeyValueGrid.tsx`, `FieldEditors.tsx`, `TableField.tsx` (um ponto de extensão para o marcador do campo, sem saber de revisão), `src/ui/review/` (marcador e popover), `src/store/derived.ts` (índice de mudanças por entidade e campo), `src/theme/tokens.ts` e CSS (o que o handoff trouxer), `src/ui/icons.tsx` (ícones novos do handoff), `src/i18n/*`, `tests/tooling/shownProjectReaders.test.ts` (os Detalhes passam a ler o projeto à vista também na revisão), `tests/components/review/details.test.tsx`, `tests/store/review.test.ts`.

- [x] Índice derivado "mudanças por entidade e campo" com teste (memoizado pela proposta, como o resto de `review.derived`)
- [x] Na revisão, Detalhes mostra o painel normal em somente leitura sobre `shownProject` (Atual e Proposto); seções recolhidas que contêm mudanças abrem
- [x] Marcador focável em cada campo alterado, com popover (hover e foco) mostrando o valor atual e o proposto; conflito com Atual, Antes e Depois
- [x] Criação com o marcador "novo" em cada campo; remoção com o estado "será removida"
- [x] Testes de componente: alteração, criação ("tudo novo"), remoção, conflito, teclado (Tab até o marcador, popover, Esc); `tests/components/editorRenders.test.tsx` no limite

**Aceite**: no R4 do guia, com o `proposta-exemplo.zip` e uma importação nova, selecionar uma marcação mostra o painel normal com os campos e os marcadores, nas visões Atual e Proposto.

#### 9.6 — Detalhes na revisão, parte 2: decidir no painel

**Ponto 4.**

**Toca em:** `src/ui/review/` (decisão no popover do marcador e no cabeçalho do item, notas, avisos de item trancado e de conjunto inválido; os níveis Proposta, Projeto e Imagem como o handoff decidir; `ChangeCard`/`DiffValue` saem do nível do item e ficam só onde ainda forem usados), `src/ui/review/ReviewDetails.tsx`, `src/i18n/*`, `tests/components/review/*`, `tests/e2e/` (revisão), `docs/ARCHITECTURE.md` (Detalhes na revisão), `docs/TESTING.md` (R4 e R5, que descrevem os cartões Antes/Depois), e `docs/TESTING-COWORK.md` e o apêndice A do guia, se citarem os cartões.

- [x] Decisão de três estados no popover de cada campo alterado e no cabeçalho do item e de cada anotação criada; "junto" (dependências) visível como hoje
- [x] Notas, item trancado e conjunto inválido no cabeçalho do item
- [x] Níveis Proposta, Projeto e Imagem conforme o handoff (com **Comparar** na imagem trocada)
- [x] Testes de componente das decisões (campo, item, criação, remoção) e o e2e da revisão atualizado
- [x] `ARCHITECTURE.md` e os roteiros R4 e R5 do guia descrevendo o painel novo

**Aceite**: o R4 e o R5 do guia passam decidindo pelo painel; nenhuma decisão que hoje se faz pelos cartões fica sem caminho (inclusive pelo teclado).

#### 9.7 — Fechamento

**Toca em:** `PLAN.md`, novo `docs/history/PLAN-etapa-9.md`, `docs/ROADMAP.md`, `CLAUDE.md`.

- [x] Esta seção vai para `docs/history/PLAN-etapa-9.md` com as decisões consolidadas dos PRs; `PLAN.md` volta a "nenhuma etapa em andamento"; `docs/ROADMAP.md` marca a etapa 9 concluída; `CLAUDE.md` atualiza "Etapa atual" e a lista das etapas
- [x] O briefing (`BRIEF-REVIEW-DETAILS.md`) fica em `docs/redesign/` como referência, ao lado do handoff
- [x] Rodada dirigida do Cowork para a etapa 9 (pedido do dono: as fases são mergeadas sem teste manual e testadas no fim): lista dirigida em `docs/TESTING-COWORK.md` (ou no prompt da rodada) com R3, R4.12 e R4.13, os passos novos do R4 e do R5 (9.6) e a migração de um projeto v8 com `codeRef` para v9; conferir que o guia e o apêndice A descrevem o comportamento novo

---

## Fechamento (fase 9.7)

### Decisões consolidadas dos PRs

**Coordenação**

- Plano no #145. Cada fase foi para um agente executor com o modelo da tabela "Execução: modelo por fase" (acima), a partir da `main`, e o coordenador (a sessão de planejamento) revisou o diff contra o plano e o `CLAUDE.md`, rodou os gates e abriu o PR. Mergeados nesta ordem: #146 (9.1), #147 (9.2), #148 (9.3), #149 (9.4), #150 (handoff do Claude Design, PR do dono), #151 (9.5), #152 (9.6) e, por fim, o fechamento (9.7).
- **Nenhuma fase foi testada à mão** antes do merge (pedido do dono): o teste manual das fases foi adiado para a rodada dirigida do Cowork (R3 inteiro, R4.12 e R4.13, R4 e R5 decididos pelo painel e a migração v8 → v9), descrita em [`../TESTING-COWORK.md`](../TESTING-COWORK.md).
- Schema **v9** do `mapping.json`; especialização sem `formatVersion` nova; **MCP 0.4.0** (tag `mcp-v0.4.0` criada pelo dono depois do #149 e Release publicada).

**Plano (#145)**

- A ordem pôs o **briefing primeiro** (9.1), para o Claude Design correr em paralelo às fases 9.2 a 9.4.
- O índice "mudanças por entidade e campo" é **estado derivado da revisão** (`createReviewDerived`), não regra do modelo.
- Apagar uma proposta **aplicada** tira só o vínculo (`HistoryLink`) do histórico; o resto do desfazer continua.

**9.1 — Briefing (#146)**

- Os estados **E11** (item criado na visão Atual) e **E12** (camada escondida) foram acrescentados à lista do briefing; o requisito 7 foi pedido como **escolha** (o handoff decide entre as alternativas).

**9.2 — Apagar proposta (#147)**

- Projeto **somente leitura** e **revisão aberta** recusam apagar. Se o `proposal.json` foi apagado por fora, apagar remove o resto da pasta sem aviso; o `seen` da proposta apagada também sai do blob do retomar. A proposta **aplicada** ganhou um aviso extra na confirmação (as mudanças já aplicadas continuam no projeto).
- O foco, sem linhas depois de apagar, vai à lista ou ao estado vazio ("Como o agente envia propostas").
- R4.12 e R4.13 usam uma pasta nova, `loja-apagar`, para não mexer no R6 nem no R8. `detachLinks` mantém o desfazer do projeto.
- Mudança de processo pedida pelo dono no mesmo PR: a subseção "Execução: modelo por fase" (acima).

**9.3 — `path` no `code` (#148)**

- `path` plano no MCP, ao lado do `symbol`, com `url`, `localFile` e `exists`; `pathUrl` na planta (`codeBlueprint`); `pattern` no `spec.schema.json`; "Definição" como última linha da grade dos Detalhes; passo R3.4b do guia; o item da rodada dirigida do Cowork foi acrescentado à 9.7 (o terceiro checkbox).

**9.4 — Remoção do `codeRef`, schema v9, MCP 0.4.0 (#149)**

- A migração v8 → v9 **identifica os campos pela cópia em `specs/`** (`MigrationContext`); sem a cópia, os valores **ficam** e viram `unknown-field` (a migração não adivinha pelo formato do valor).
- Renomes: `codeRefs.ts` → `codeLocations.ts` e `CodeRefs.tsx` → `CodeDefinitions.tsx`. `line` saiu do `CodeLocation`; `codeLink` tira `#…{line}` do `urlTemplate`.
- Especialização antiga aceita o campo `codeRef` com **qualquer conteúdo** e o ignora com aviso (`ignored-field`); o **JSON Schema recusa** o campo. `platform-not-allowed` e `invalid-path` saíram do `ModelErrorCode`; o aviso `missing-repo` ficou mais frequente (vale para plataforma usada em `code.path`).
- O `sdui.json` de exemplo **continua na `formatVersion` 2** (tirou o campo e ganhou `path`, sem versão nova): vale para projetos **novos**; um projeto antigo não recebe o arquivo novo por "Atualizar versão…" (ver o aviso em [`../TESTING-COWORK.md`](../TESTING-COWORK.md)).
- E2e corrigido pelo coordenador: schema v9 nas asserções e espera da gravação antes da mudança externa (com gravação pendente, a mudança de fora vira o diálogo de conflito em vez da recarga).

**Handoff do Claude Design (#150, PR do dono)**

- `docs/redesign/HANDOFF-REVIEW-DETAILS.md`, com quatro pontos aprovados: **somente leitura legível** (controles `disabled` com aparência de leitura), **setas mantêm o foco na lista**, **removidos riscados na visão Proposto** e **camada escondida com "Mostrar aqui"**.

**9.5 — Painel normal com marcadores (#151)**

- Ponto de extensão `DetailsExtension` (por **contexto**) nos painéis normais; `fieldIndex` e `fullPreview` no estado derivado da revisão; controles `disabled` com aparência legível; bloco de decisão **provisório** acima do painel (a 9.6 o completou); tabela no popover mostrada como **listas**; **sem `aria-readonly`** na grade; clique fora segue o modelo da app; hover de **300 ms**; limites **8/12/20** do popover; `type` ao lado do selo e `layerId`/`markingId` no cabeçalho da anotação.

**9.6 — Decidir nos Detalhes (#152)**

- Rótulos por **tipo de item** com uma chave de tradução por variante; a **criação de anotação rejeitada** volta como cartão "Criação rejeitada"; `aria-invalid` e `aria-current` no marcador; a nota de **par livre** só no popover; "substituída" **sem o valor da nova** (o modelo só dá o veredito); focar um marcador do grupo **Projeto** troca de painel; **uma nota por alvo** no botão; `ChangeCard` e `ReviewLevel` saíram. R4 e R5 do guia reescritos para decidir pelo painel.

**9.7 — Fechamento**

- Esta seção saiu do `PLAN.md`; o briefing e o handoff ficam em `docs/redesign/` como referência; `ROADMAP.md` e `CLAUDE.md` atualizados.
- Guia: `schema v8` e `schemaVersion (8)` das seções 3 e 4 viraram v9 (o resto do R3 a R5 já descrevia o comportamento novo desde as fases 9.2 a 9.6); passos **R3.8** e **R3.9** novos (migração de um projeto v8 e especialização antiga com `codeRef`); frase dos Detalhes na revisão no mapa da interface; o `README.md` também citava o schema v8.
- Rodada dirigida do Cowork da etapa 9 descrita em [`../TESTING-COWORK.md`](../TESTING-COWORK.md).

### Fora desta etapa (acrescentado no fechamento)

- **Teste manual das fases adiado.** O dono pediu que as fases fossem mergeadas sem teste manual e testadas no fim: a rodada dirigida do Cowork da etapa 9 é o primeiro teste à mão dos pontos 1 a 4, e o teste manual avançado do dono (seção 9 do guia) continua depois dela.
- **O lote do MCP não devolve o aviso de campo ignorado.** `validate_specialization` e a importação da app avisam do campo `codeRef` ignorado (`ignored-field`), mas o lote do MCP **não** devolve esse aviso ao agente que aplica uma especialização antiga.
- **O `ROADMAP.md` ainda citava o `codeRef` como entregue na 3b.** Resolvido no fechamento por uma observação na própria entrada da etapa 3 (o histórico não foi reescrito).
- **Apagar em lote, arquivar e apagar pelo MCP** (`delete_proposal`), e **linha no `code`**: continuam fora, como no plano.
- **Achados baixos 4 e 10 do portão** (lista da revisão): não entraram (a 9.5 e a 9.6 não tocaram a lista da janela Propostas, só o painel Detalhes); continuam na lista do marco do [`../ROADMAP.md`](../ROADMAP.md), junto das demais observações e dos itens de "Fora desta etapa" das etapas 5 a 8.
- **Próximo passo:** a rodada dirigida do Cowork da etapa 9 e, depois dela, o teste manual avançado do dono (seção 9 do [`../TESTING.md`](../TESTING.md)), antes do uso com pessoas no marco "Uso real".
