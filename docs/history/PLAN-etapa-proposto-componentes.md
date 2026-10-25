# Histórico — Etapa Proposto com componentes (seção do antigo PLAN.md)

> Fases PC1 e PC2 concluídas no épico `epic/proposto-componentes` (plano no PR #225, PC1 no #227, PC2 no #228, ajuste da rodada do Cowork no #229 e fechamento num PR sem número, o da PC2c; o épico é o PR #226). Origem: aprovação do dono em 2026-10-24. Sem schema, formato de proposta nem MCP novos (schema v13 e MCP 0.9.0 continuam).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes (marcados ao fechar a etapa). Depois dela vêm as decisões consolidadas dos PRs, a rodada do Cowork e o que ficou para depois.

---

## Etapa — Proposto com componentes (épico `epic/proposto-componentes`)

### Objetivo

Na revisão de propostas, a visão **Proposto** desenha os componentes que a proposta cria, com as marcas de revisão aprovadas pelo dono em 2026-10-24 (design system Mapping, seção "Revisão de propostas" › "Componentes novos na visão Proposto"; referência visual no canvas "Mapping — Proposto com componentes"). Nada de schema, formato de proposta nem MCP muda: é só desenho na app (o MCP fica 0.9.0, sem snapshot de versão nova e sem rótulo `mcp-rc`).

### Diagnóstico (2026-10-24)

- O derivado já desenha no Proposto as marcações novas de tipos que o catálogo conhece: `componentScenes` (`src/store/derived.ts`) lê o projeto à vista (`review.derived.shownProject`, o `previewProject` da proposta) e um teste descartável confirmou a cena da marcação criada. O canvas recebe `drawingsOf(drawnProject)` (`src/canvas/CanvasController.ts`).
- A limitação registrada na B4 (PR #174, "Visão Proposto não desenha os componentes novos") é o **catálogo**: `createComponentLibrary` (`src/store/componentLibrary.ts`, criado em `src/store/session.ts` por volta da linha 355) carrega os componentes das especializações do projeto **confirmado** (`store.committed`), lidos de `specs/<id>/`. Os tipos e versões que a proposta traz no pacote dela (`proposals/<id>/<dir>/`, mudança `specialization` de criar ou atualizar; ver `proposalPackageDir` e o trecho de `packages` em `src/model/proposalApply.ts`) não entram no catálogo, então as marcações desses tipos ficam sem desenho até aplicar.
- O cache por marcação (`createDrawingCache`, `src/model/componentDrawings.ts`) compara o `component` por identidade: um catálogo do Proposto que reaproveita os mesmos objetos de componente das especializações que a proposta não muda mantém as cenas das demais marcações.
- A regra do fantasma da criação rejeitada está em `src/canvas/reviewMarks.ts` (hoje só na visão Atual); o desenho da linha tracejada 6/4, da pontilhada e dos selos está em `src/canvas/renderers/review.ts`; a legenda usa a chave `review.legend.rejected` em `src/i18n/pt-BR.ts` e `src/i18n/en-US.ts`.

### Regras (aprovadas pelo dono em 2026-10-24)

- **Pendente, visão Proposto:** desenho inteiro, com os valores propostos, e a marca de criada por cima (linha tracejada 6/4 e selo "+" sobre `cv-badge`, como hoje).
- **Aceita, visão Proposto:** igual à pendente; a decisão aparece só no `DecisionMark` (Detalhes, Árvore, janela Propostas), não no canvas.
- **Rejeitada, visão Proposto:** sem desenho; só o fantasma pontilhado 1,5/2,5 com o nome e o selo ✕.
- **Inválida** (no conjunto que bloqueia Aplicar): desenho com a linha `cv-invalid` e o selo de inválida.
- **Visão Atual:** o componente criado não aparece (como hoje).
- **Componente existente alterado:** continua desenhado com os valores propostos e a linha dupla de alterada.
- **Campo obrigatório faltando num componente novo:** o desenho mostra o reservado/nó desconhecido como o canvas já faz, e a marcação leva a pendência de incompleta de sempre.

### Decisões do plano (do coordenador, a confirmar pelo dono)

1. **Catálogo do Proposto.** Na visão Proposto, com uma proposta aberta que cria ou atualiza especializações (mudança não rejeitada e não aplicada), o catálogo lido pelo derivado é o do projeto confirmado mais os componentes dos pacotes da proposta, lidos de `proposals/<id>/<dir>/` pelo mesmo carregador (`loadSpecComponents`), sem gravar nada. Na visão Atual e fora da revisão, o catálogo é o de hoje. Os componentes das especializações que a proposta não muda são os mesmos objetos (o cache por marcação vale). Enquanto o pacote proposto carrega, as marcações dele ficam sem desenho, como no carregamento do catálogo hoje. As fontes do pacote proposto entram pelo mesmo registro de fontes.
2. **Fantasma da criação rejeitada nas duas visões.** O fantasma pontilhado com nome e ✕ passa a aparecer na visão Proposto e continua na Atual (que já o mostra); a legenda `review.legend.rejected` deixa de dizer "(só em Atual)". A regra vale para toda marcação criada e rejeitada, com ou sem componente (`reviewMarks` não distingue).
3. **Tipo de especialização rejeitada.** Se a mudança da especialização for rejeitada e a da marcação não, a marcação aparece no Proposto sem desenho (o tipo não está no catálogo), com a pendência que o modelo já dá; não há regra nova.
4. A visão Proposto continua somente leitura e sem gesto: o desenho só reinstancia quando a proposta, a decisão ou a visão mudam, nunca a cada quadro.

### Fluxo, coordenador e esforço

- **Fluxo:** épico `epic/proposto-componentes` a partir da `main`; cada fase é um branch curto com PR com base no épico, na ordem PC1 → PC2; o PR do épico para a `main` fica aberto até o fim. Gates antes de cada PR: `npm run lint && npm run typecheck && npm test && npm run build`. Descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR. Sem mudança de MCP: nenhum rótulo `mcp-rc`.
- **Coordenador e esforço por fase** (regra da seção "Uso de modelos" do [`CLAUDE.md`](CLAUDE.md); a sessão confere o modelo antes de começar a fase). Os subagentes são sempre Sonnet (produção) e Haiku (mecânico):

| Fase | Coordenador | Esforço do coordenador | Subagentes                                                              |
| ---- | ----------- | ---------------------- | ----------------------------------------------------------------------- |
| PC1  | Opus        | high                   | Sonnet medium (high no briefing do catálogo do Proposto); mecânicos Haiku low |
| PC2  | Opus        | medium                 | Sonnet medium; mecânicos Haiku low                                      |

### Fases

#### PC1 — Catálogo do Proposto e desenho dos componentes novos (pendente, aceita, inválida, alterada)

**Coordenador:** Opus. **Esforço:** high; subagentes Sonnet medium (high no briefing do catálogo do Proposto); mecânicos Haiku low.

**Toca em (aproximado):** `src/store/componentLibrary.ts`, `src/store/session.ts`, `src/store/derived.ts` (o derivado recebe o catálogo da visão), `src/store/review.ts` se precisar, `src/canvas/CanvasController.ts` só se precisar, `src/storage/` (ler o pacote em `proposals/<id>/`, pasta e zip), `tests/store/`, `tests/canvas/`, `tests/canvas/renderPerformance.test.ts`, `tests/e2e/`, `docs/ARCHITECTURE.md` (uma linha sobre o catálogo do Proposto).

- [x] Proposta que cria marcações de um tipo já aplicado: o Proposto desenha cada uma com os valores propostos, a linha tracejada e o selo "+" (teste de canvas)
- [x] Proposta que traz um pacote novo ou atualizado: os componentes dos tipos novos ou da versão nova aparecem no Proposto e não na Atual; nada é gravado em `specs/` antes de aplicar (testes de store e de canvas)
- [x] Aceita igual à pendente no canvas (teste); inválida com a linha `cv-invalid` e o selo de inválida, com desenho (teste)
- [x] Componente existente alterado desenhado com os valores propostos e a linha dupla (teste que garante o que já funciona)
- [x] Campo obrigatório faltando num componente novo: reservado/nó desconhecido no desenho e a pendência de incompleta (teste)
- [x] Visão Atual não desenha o componente criado (teste)
- [x] Cache: trocar de visão ou decidir uma mudança não reinstancia as marcações que não mudaram (identidade da cena), e pan/zoom não reinstanciam nada (teste)
- [x] Orçamento de desempenho: uma proposta com dezenas de componentes novos (por exemplo, 60) dentro do orçamento de quadro, no padrão de `tests/canvas/renderPerformance.test.ts` (roda no `npm run test:perf`)
- [x] E2E: no padrão dos testes da revisão em `tests/e2e/` (o host do canvas publica `data-components`), abrir uma proposta com componentes novos e conferir a contagem no Proposto e na Atual
- [x] `npm run lint && npm run typecheck && npm test && npm run build` passam

#### PC2 — Fantasma da criação rejeitada no Proposto, legenda, roteiro e fechamento

**Coordenador:** Opus. **Esforço:** medium; subagentes Sonnet medium; mecânicos Haiku low.

**Toca em:** `src/canvas/reviewMarks.ts`, `src/i18n/pt-BR.ts`, `src/i18n/en-US.ts`, `tests/canvas/reviewMarks.test.ts`, `tests/canvas/renderers/review.test.ts`, `docs/PROPOSAL-FORMAT.md` ou `docs/ARCHITECTURE.md` se citarem a regra antiga, `docs/TESTING.md` (seção 8), `docs/history/`, `PLAN.md`, `docs/ROADMAP.md`, `CLAUDE.md`.

- [x] Criação rejeitada: no Proposto, sem desenho e com o fantasma pontilhado 1,5/2,5, o nome e o selo ✕; na Atual, o fantasma continua (testes unitários de `reviewMarks` por estado e visão: pendente, aceita, rejeitada, inválida, alterada, nas duas visões)
- [x] `review.legend.rejected` em pt-BR e en-US sem "(só em Atual)"
- [x] Roteiro novo no `docs/TESTING.md`, seção 8, executável pelo Cowork sozinho (extensão do navegador e shell; proposta preparada com um componente novo pendente, um aceito, um rejeitado, um inválido e um existente alterado), seguindo as convenções da seção 8
- [x] Rodada dirigida do Cowork só com o desenvolvimento completo (PC1 mesclada e a PC2 pronta, no preview do PR da PC2), com o prompt de `docs/TESTING-COWORK.md` apontando para o roteiro novo (e os roteiros da revisão que a etapa toca); relato em `docs/history/relato-<data>-proposto-componentes.md` e achados corrigidos antes do fechamento
- [x] Fechamento (depois da rodada do Cowork): histórico em `docs/history/PLAN-etapa-proposto-componentes.md` com as decisões consolidadas dos PRs; `PLAN.md` sem etapa em andamento; `docs/ROADMAP.md` (tira "a visão Proposto desenhar componentes novos" de "o que a Biblioteca deixou" e registra a etapa concluída) e `CLAUDE.md` (etapa atual) atualizados
- [x] `npm run lint && npm run typecheck && npm test && npm run build` passam

### Fora do escopo

Mudança de schema, de formato de proposta ou do MCP; desenhar componentes na visão Atual; regras novas para imagens criadas ou removidas.

---

## Decisões consolidadas dos PRs

- **PC0 (PR #225, o plano):** o diagnóstico é que a lacuna real era o catálogo (os tipos já aplicados já geravam a cena no Proposto; faltavam os tipos e versões do pacote em `proposals/<id>/`). O fantasma da criação rejeitada aparece nas duas visões e a legenda deixa de dizer "(só em Atual)". Especialização rejeitada com marcação pendente: a marcação aparece sem desenho, sem regra nova. As fontes do pacote proposto entram pelo mesmo registro de fontes. Coordenadores: PC1 Opus high (o dono trocou de Fable para Opus depois que o diagnóstico reduziu a fase) e PC2 Opus medium. MCP sem versão nova e sem rótulo `mcp-rc`.
- **PC1 (PR #227, catálogo do Proposto):**
  - O catálogo do Proposto (`src/store/proposedCatalog.ts`, exposto como `review.components` e lido pelo derivado do editor em `src/ui/EditorContext.tsx`) soma ao da biblioteca aplicada os pacotes que a proposta cria ou atualiza.
  - O pacote é lido uma vez por proposta e `id@versão`, quando a proposta abre (rejeitados inclusive), nunca ao trocar de visão nem ao decidir. Mudança externa nos arquivos de `proposals/<id>/` sem trocar a versão só aparece ao reabrir a proposta.
  - Na Atual, sem proposta ou sem pacotes, o catálogo é o próprio objeto da biblioteca aplicada. No Proposto, as especializações que a proposta não muda usam o mesmo `SpecComponents` (o cache por marcação vale).
  - Seguem a visão (leem `review.components`): desenho, tamanhos mínimos, tipos de componente, avisos, a lista de problemas do Diagnóstico, alvo de "Adicionar à tela", Arrumar e soltar componente (os três inertes na revisão, que é somente leitura). Ficam na biblioteca aplicada (`session.components`): as fontes do Diagnóstico, o Catálogo e as actions.
  - As fontes dos pacotes da proposta ficam num registro próprio enquanto ela está aberta (seguem a lista de pacotes, não a visão); `fontsEpoch` é a soma com o da base. Limitação conhecida: se a versão aplicada e a proposta declararem a mesma família, as duas ficam registradas e o navegador escolhe por peso e estilo.
  - Especialização rejeitada com a marcação pendente só acontece editando a decisão à mão (pela app, rejeitar a especialização rejeita as dependentes); a marcação fica sem desenho.
  - Os orçamentos de desempenho falham às vezes no `npm test` completo na máquina do desenvolvedor por carga; isolados (`npm run test:perf`, como no CI), passam. Orçamento da fase: 60 componentes novos, troca para o Proposto em até 24 ms (medido 10 a 13 ms) e pan/zoom em até 16 ms sem refazer desenho (medido 2 a 4 ms).
- **PC2 (PR #228, fantasma, legenda e roteiro R13):**
  - Só a criação rejeitada ganhou o fantasma no Proposto; alteração ou remoção rejeitada de marcação existente continua só na Atual. A legenda deixa de dizer "só em Atual" por pedido do dono e passa a valer para os dois casos, sem distinguir.
  - O fantasma da rejeitada usa um tracejado próprio (1,5/2,5, `REJECTED_GHOST_DASH`); o fantasma da posição antiga de uma movida continua 1,5/3.
  - Fantasma de componente sem nome leva o nome do tipo (o mesmo que a Árvore mostra), resolvido da criação da anotação tipada na proposta; sem tipo resolvível, fica sem nome.
  - Roteiro R13 "Proposto com componentes" no `docs/TESTING.md` com a proposta `examples/proposta-componentes.zip` (gerada por `npm run build:proposal-components`, conferida por `tests/examples/proposalComponents.test.ts`; fixture comum com o e2e em `tests/e2e/proposedComponentsFixture.ts`), e a rodada dirigida preparada na seção 11 do `docs/TESTING-COWORK.md`.
  - Os documentos de design `docs/redesign/HANDOFF-PROPOSALS.md` e `HANDOFF-REVIEW-DETAILS.md` (referência histórica) ainda dizem que a rejeitada só aparece na Atual; ficaram como estão.
- **PC2b (PR #229):** a seção 11 do `docs/TESTING-COWORK.md` apontava para o preview do PR da PC2 (#228), já mesclado; a rodada roda no preview do PR do épico (#226), que tem a PC1 e a PC2, e o build id esperado é o do último commit de `epic/proposto-componentes`.
- **PC2c (PR da PC2c, achados da rodada e fechamento):**
  - A marca de alterada (linha dupla e ∿) aparece nas duas visões, como em qualquer marcação alterada desde a etapa 4: o roteiro R13.8 estava errado, não o código.
  - O campo obrigatório faltando é desenhado com o texto padrão do componente (o "Label" do Button), o reservado que o componente já tem, e o Inválido também aparece em Incompletas ("O componente não cabe"): roteiro R13.9 ajustado.
  - O zip `examples/proposta-componentes.zip` passou a levar o pacote inteiro do Material 3 em `specs/material3/` (docs, exemplos e fontes), o que tirou os 16 erros de biblioteca do Diagnóstico (R13.11).
  - O cabeçalho oculto "Mudança" da grade de anotações em Detalhes passou a acompanhar a troca de idioma (era calculado uma vez no `useMemo` da extensão da revisão).
  - O resumo da mudança na lista da revisão ganhou dica (`title`) com o texto inteiro, como a etiqueta da linha já tinha.

## Rodada do Cowork

Dirigida, no preview do PR do épico, build `70cc7ee · 2026-10-24`: 33 passos, 29 ✅, 4 ⚠️, 0 ❌. Achados: 1 média e 3 baixas, todos corrigidos no PR da PC2c. Relato em [`relato-2026-10-24-proposto-componentes.md`](relato-2026-10-24-proposto-componentes.md).

## O que ficou para depois

- A mesma família de fonte em duas versões (o pacote da proposta e o aplicado) fica registrada as duas vezes; o navegador escolhe por peso e estilo.
- O pacote da proposta é lido uma vez por proposta e `id@version`: mudança nos arquivos sem trocar a versão só aparece ao reabrir a proposta.
- A legenda não distingue mais a alteração rejeitada (que continua só na Atual) da criação rejeitada (nas duas visões).
- `docs/redesign/HANDOFF-PROPOSALS.md` e `HANDOFF-REVIEW-DETAILS.md` ainda dizem que a rejeitada aparece só na Atual (documentos históricos, mantidos).
- Barra horizontal de 4 px na Árvore.
- O número de avisos do Catálogo fica instável nos primeiros segundos ao criar projeto.
- O primeiro `Tab` no campo da nota da revisão não sai do campo.
- O prompt do Cowork apontava para uma seção que só existia no branch do épico (o testador precisou clonar o branch).
