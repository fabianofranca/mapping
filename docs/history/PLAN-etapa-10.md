# Histórico — Etapa 10, correções da rodada dirigida da etapa 9 (seção do antigo PLAN.md)

> Fases 10.1 e 10.2 concluídas (o plano entrou no PR #154; a 10.1 no #155; o fechamento, no PR desta fase). Origem: a rodada 7 do Cowork (dirigida nas fases 9.2 a 9.6, build `303b576 · 2026-10-15`; [`relato-2026-10-15-dirigida.md`](relato-2026-10-15-dirigida.md): 60 linhas, 58 ✅, 1 achado baixo). Referência atual: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (revisão e foco), [`../TESTING.md`](../TESTING.md) (R3.3, R3.8, R4.5, R4.12, R4.13, R5.3 e o apêndice A) e [`../redesign/HANDOFF-REVIEW-DETAILS.md`](../redesign/HANDOFF-REVIEW-DETAILS.md) (seção 5.5, a nota sugerida).
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo, exceto os checkboxes da 10.2, marcados ao fechar a etapa. Depois dela vêm o fechamento (as decisões consolidadas dos PRs) e o que ficou para depois. As etapas anteriores estão nos outros arquivos desta pasta.

---

## Fases pendentes — Etapa 10: correções da rodada dirigida da etapa 9

### Objetivo

Fechar o que a **rodada 7 do Cowork** (dirigida nas fases 9.2 a 9.6, build `303b576 · 2026-10-15`) encontrou. Relato em [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md): 60 linhas, 58 ✅, nenhum ❌, nenhuma regressão e **1 achado baixo**. Nada impede o uso com pessoas; a etapa é curta e sem rodada nova do Cowork. O próximo passo depois dela continua sendo o teste manual avançado do dono.

### Decisões

- **Mesmas regras da etapa 9:** um branch e um PR por fase, a partir da `main`; gates antes do PR (`npm run lint && npm run typecheck && npm test && npm run build`, e o e2e local quando a fase toca a revisão); defeito com o teste que o reproduz antes da correção; descrição do PR com Resumo, Como testar e Decisões tomadas; checkboxes marcados no mesmo PR; merge pelo coordenador com o CI verde (pedido do dono na etapa 9).
- **Modelo por fase:** 10.1 em Sonnet (interface pequena, com padrão a seguir); 10.2 em Sonnet (documentação).
- **O achado é defeito** (R5.3): rejeitar pelo popover do marcador não abre a nota sugerida (seção 5.5 do `docs/redesign/HANDOFF-REVIEW-DETAILS.md`) e deixa o foco no `body` (regra "um dono por fechamento", `docs/ARCHITECTURE.md`, "Foco e teclado"). Na segunda vez, com nota já escrita, o campo abre.
- **Rejeitar a criação mantém a seleção** (R4.5): hoje a seleção vira "Nada selecionado" porque o item some da visão Proposto; os Detalhes continuam mostrando o item ("A criação foi rejeitada…"), então a seleção fica nele.
- **Ficam para a lista do marco** (ROADMAP), sem código nesta etapa: o nome da imagem com o prefixo `images/` na Árvore, no título dos Detalhes e na barra de status quando a imagem não tem nome (`imageLabel` usa o `file`; comportamento antigo, a referência copiável já usa só o nome do arquivo); e o que já está lá (lista da revisão espremida em altura baixa e títulos cortados, achados 4 e 10 do portão; cadeado da Árvore com `title` diferente do `aria-label`; cartão de texto do Formulário no canvas).

### Fases

#### 10.1 — Nota sugerida e foco ao rejeitar pelo marcador

**Achado baixo do R5.3 e observações do R4.5 e do R4.6.**

**Toca em:** `src/ui/review/ChangePopover.tsx`, `src/ui/review/ChangeMark.tsx`, `src/ui/review/NoteField.tsx`, `src/ui/review/ReviewHeader.tsx` (se a nota do cabeçalho tiver o mesmo caminho), `src/store/review.ts` ou `src/app/useReviewSync.ts` (seleção depois de rejeitar a criação), `tests/components/review/fieldDecision.test.tsx`, `tests/components/review/itemHeader.test.tsx`, `tests/e2e/proposals.spec.ts` (se o e2e cobrir), `docs/TESTING.md` (R4.5 e R5.3).

- [x] Teste que reproduz, antes da correção: rejeitar pelo popover com o mouse, sem nota, abre o campo de nota com o foco (hoje não abre e o foco cai no `body`)
- [x] Rejeitar pelo popover com o mouse abre a nota sugerida vazia com o foco; se ficar vazia, some e o foco volta ao marcador; pelo teclado (`R`) o foco não se move (seção 5.5 do handoff); nunca no `body`
- [x] O 1º `Tab` no campo de nota sai do campo (teste de componente; se o problema era só da tecla sintética da extensão, o teste prova e a fase registra)
- [x] Rejeitar a criação de um item mantém a seleção nele (teste)
- [x] R4.5 e R5.3 do guia descrevendo o comportamento (inclusive a frase "sugerida numa rejeição")

**Aceite**: no R5.3, **Rejeitar** pelo popover da anotação Button abre o campo de nota com o foco na primeira vez; no R4.5, depois de rejeitar a criação do Campo Cupom, ele continua selecionado.

#### 10.2 — Guia e fechamento

**"O que atrapalhou" e observações do relato.**

**Toca em:** `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `PLAN.md`, novo `docs/history/PLAN-etapa-10.md`.

- [x] R4.12 e R4.13: o estado de `images/` depois de apagar a proposta e depois do `Ctrl+Z` (as imagens que ficam órfãs saem)
- [x] R3.3: sem a promessa do cartão de texto no Formulário (marcação com filhas), ou com a condição em que ele aparece
- [x] R3.8: o aviso da migração é uma faixa que some sozinha; onde conferir depois (o backup em `backups/` e o `schemaVersion`)
- [x] Apêndice A: a extensão do Chrome que não injeta arquivos de uma pasta montada (tudo entra pelo seletor, com a pessoa)
- [x] ROADMAP: rodada 7 no andamento do marco; o prefixo `images/` na lista de observações; etapa 10 concluída
- [x] Esta seção vai para `docs/history/PLAN-etapa-10.md` com as decisões dos PRs; `PLAN.md` sem etapa em andamento; `CLAUDE.md` atualizado

---

## Fechamento (fase 10.2)

### Decisões consolidadas dos PRs

**Coordenação**

- Plano no #154, a 10.1 no #155 e o fechamento (10.2) no PR desta fase, mergeados nessa ordem. Cada fase foi para um agente executor em **Sonnet** a partir da `main`; o coordenador (a sessão de planejamento) revisou o diff contra o plano e o `CLAUDE.md`, rodou os gates e abriu o PR.
- **Sem rodada nova do Cowork**: a etapa é curta e o aceite de cada fase está no guia. O próximo passo continua sendo o teste manual avançado do dono.
- Schema **v9** e **MCP 0.4.0** sem mudança.

**Plano (#154)**

- O achado do R5.3 foi tratado como **defeito**, com o teste que o reproduz antes da correção; as observações do R4.5 (seleção) e do R4.6 (`Tab`) entraram na mesma fase.
- O prefixo `images/` no nome da imagem **não entrou**: foi para a lista do marco do [`../ROADMAP.md`](../ROADMAP.md).

**10.1 — Nota sugerida e foco ao rejeitar pelo marcador (#155)**

- **Causa:** ao rejeitar a **anotação criada** pelo popover, ela vira o cartão "Criação rejeitada" e o popover **remonta**; o estado local do pedido da nota se perdia e o foco caía no `body`.
- **Correção:** o pedido da nota passou para o store (`review.noteRequest`), que sobrevive à remontagem. Rejeitar **com o mouse** abre a nota sugerida vazia com o foco; **pelo teclado** (`R`) o foco não se move (seção 5.5 do handoff); uma nota **vazia ao sair some** e o foco fica onde a pessoa o pôs. O foco nunca cai no `body`.
- **`Tab`:** o primeiro `Tab` no campo de nota **já saía** do campo; era a tecla sintética da extensão. Um teste de componente prova (escreve, `Tab`, o foco sai e a nota grava), e o apêndice A registra.
- **Seleção depois de rejeitar a criação:** resolvida no "como ficaria" **sem as decisões** (`src/store/shownSelection.ts`), usada pela trilha, pela barra de status e pela limpeza depois de recarregar; vale **só na visão Proposto** (na Atual nada muda).
- R4.5 e R5.3 do guia reescritos, inclusive a frase "sugerida numa rejeição".

**10.2 — Guia e fechamento**

- Cada ponto do guia foi escrito depois de **conferir no código**:
  - **R4.12 e R4.13:** apagar a proposta aplicada não mexe no projeto, então `images/` continua com `confirmacao.png` e `carrinho-v2.png`. No `Ctrl+Z`, o projeto deixa de citar as duas e volta a citar `carrinho.png`; **na gravação seguinte** (`cleanUp` da sessão) as duas saem de `images/` e `carrinho.png` volta da lixeira em memória. O `mapping.json` nunca cita um arquivo ausente, e o `Ctrl+Shift+Z` traz as duas de volta.
  - **R3.3:** o cartão de texto só aparece se, **fora das filhas visíveis**, sobrar uma área livre de pelo menos 180 × 100 px na tela (`semanticPlacement`, `largestFreeRect`); com as quatro filhas à vista o Formulário mostra só o rótulo com "…". O passo ganhou a camada **Telas** ativa com **Ocultar sem anotação**, que oculta as filhas (sem anotação nessa camada) e libera a área.
  - **R3.8:** a faixa "Projeto atualizado do formato v8…" **não some sozinha**: o código (`CanvasNotices`) a mostra a partir da primeira gravação, com a ação **Dispensar**, e ela sai ao dispensar ou ao fechar o projeto; não há tempo. O relato supôs o contrário; o guia agora diz isso e onde conferir depois (a barra de status `schema v9`, `backups/mapping.v8.<data>.json` e `"schemaVersion": 9`). Um teste temporário confirmou a faixa ainda presente seis segundos depois.
  - **Apêndice A:** a extensão do Chrome pode recusar a injeção de arquivos de uma pasta montada (`file_upload`): tudo entra pelo seletor, com a pessoa; e o `Tab` sintético pode não sair de um `textarea` (a app está certa, a 10.1 provou).
- `ROADMAP.md`: rodada 7 no andamento do marco, o prefixo `images/` na lista de observações e a etapa 10 concluída; `CLAUDE.md` e `PLAN.md` voltam a "nenhuma etapa em andamento".

### Fora desta etapa (acrescentado no fechamento)

- **Prefixo `images/` no nome da imagem** (Árvore, título dos Detalhes e barra de status quando a imagem não tem nome): `imageLabel` usa o `file`; comportamento antigo. A referência copiável já usa só o nome do arquivo. Na lista do marco.
- **Observações do relato sem código:** a lista da revisão espremida em altura baixa e os títulos cortados na janela Propostas (R4.2 e R5.4a; achados 4 e 10 do portão), o cadeado da Árvore com `title` diferente do `aria-label` (R4.4), o `Sair da revisão?` com botão de fechar (R4.10) e o `share · NotAllowedError` no Diagnóstico na hora do Exportar (R3.7). Os `.tmp` que o MCP deixa na pasta montada são limite do shell do testador (EPERM ao apagar).
- **Próximo passo:** o teste manual avançado do dono (seção 9 do [`../TESTING.md`](../TESTING.md)) e, depois, o uso com pessoas no marco "Uso real" ([`../ROADMAP.md`](../ROADMAP.md)).
