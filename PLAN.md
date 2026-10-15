# Mapping — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje, as da etapa 10). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1 a 2.5, 3a (servidor MCP, base), 3b (referências de código), 4 (propostas de alteração com revisão), 5 (pré-voo para uso real), 6 (correções da primeira rodada de testes), 7 (correções da rodada dirigida), 8 (consolidação por subsistema) e 9 (ajustes do teste manual avançado; schema v9 e servidor MCP 0.4.0) concluídas**. O próximo passo é a rodada dirigida do Cowork da etapa 9 ([`docs/TESTING-COWORK.md`](docs/TESTING-COWORK.md)) e, depois, o teste manual avançado do dono (seção 9 do [`docs/TESTING.md`](docs/TESTING.md)). As demais (marco de uso real e evoluções) estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **só desktop** (largura mínima de 900 px), com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v9)                                       |
| [`docs/PROPOSAL-FORMAT.md`](docs/PROPOSAL-FORMAT.md)     | Formato da proposta de alteração e regras da revisão (etapa 4)                 |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
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
| [`docs/history/relato-2026-10-12-dirigida.md`](docs/history/relato-2026-10-12-dirigida.md) | Relato da rodada 2 (dirigida) do Cowork sobre o build `db5060d`; origem da etapa 7 |
| [`docs/history/relato-2026-10-12-dirigida-r3.md`](docs/history/relato-2026-10-12-dirigida-r3.md) | Relato da rodada 3 (dirigida) do Cowork sobre o build `2bdb662`; confirma a etapa 7 sem achados |
| [`docs/history/relato-2026-10-12-dirigida-r4.md`](docs/history/relato-2026-10-12-dirigida-r4.md) | Relato da rodada 4 (dirigida) do Cowork sobre o build `48f8e32`; observações O1 a O9, citadas no aceite das fases 8.2 e 8.4 |
| [`docs/history/relato-2026-10-13-portao.md`](docs/history/relato-2026-10-13-portao.md) | Relato da rodada 5 (completa, portão da etapa 8) do Cowork sobre o build `e701862`; achados devolvidos às fases 8.2, 8.4 e 8.5 |
| [`docs/history/relato-2026-10-14-dirigida.md`](docs/history/relato-2026-10-14-dirigida.md) | Relato da rodada 6 (dirigida) do Cowork sobre o build `1710ed5`; confirma as devoluções do portão e fecha a etapa 8 |
| [`docs/history/relato-2026-10-15-dirigida.md`](docs/history/relato-2026-10-15-dirigida.md) | Relato da rodada 7 (dirigida, etapa 9) do Cowork sobre o build `303b576`; 58 ✅, 1 achado baixo; origem da etapa 10 |
| [`docs/history/revisao-tecnica-2026-10-12.md`](docs/history/revisao-tecnica-2026-10-12.md) | Revisão técnica dirigida (síntese e seis relatórios, 71 achados); origem da etapa 8 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das próximas etapas, marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |
| [`docs/redesign/HANDOFF-PROPOSALS.md`](docs/redesign/HANDOFF-PROPOSALS.md) | Design das propostas de alteração (fase 4.0): telas, componentes e tokens novos, comportamento, atalhos e pontos em aberto |
| [`docs/redesign/BRIEF-REVIEW-DETAILS.md`](docs/redesign/BRIEF-REVIEW-DETAILS.md) | Briefing para o Claude Design dos Detalhes na revisão (fase 9.1, concluída; referência): problema, estado atual, requisitos, restrições e os estados E1 a E17 |
| [`docs/redesign/HANDOFF-REVIEW-DETAILS.md`](docs/redesign/HANDOFF-REVIEW-DETAILS.md) | Design dos Detalhes na revisão (etapa 9, aprovado; referência): marcador e popover por campo, cabeçalho do item, “Outras mudanças”, comportamento, textos e decisões |

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

- [ ] Teste que reproduz, antes da correção: rejeitar pelo popover com o mouse, sem nota, abre o campo de nota com o foco (hoje não abre e o foco cai no `body`)
- [ ] Rejeitar pelo popover com o mouse abre a nota sugerida vazia com o foco; se ficar vazia, some e o foco volta ao marcador; pelo teclado (`R`) o foco não se move (seção 5.5 do handoff); nunca no `body`
- [ ] O 1º `Tab` no campo de nota sai do campo (teste de componente; se o problema era só da tecla sintética da extensão, o teste prova e a fase registra)
- [ ] Rejeitar a criação de um item mantém a seleção nele (teste)
- [ ] R4.5 e R5.3 do guia descrevendo o comportamento (inclusive a frase "sugerida numa rejeição")

**Aceite**: no R5.3, **Rejeitar** pelo popover da anotação Button abre o campo de nota com o foco na primeira vez; no R4.5, depois de rejeitar a criação do Campo Cupom, ele continua selecionado.

#### 10.2 — Guia e fechamento

**"O que atrapalhou" e observações do relato.**

**Toca em:** `docs/TESTING.md`, `docs/TESTING-COWORK.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `PLAN.md`, novo `docs/history/PLAN-etapa-10.md`.

- [ ] R4.12 e R4.13: o estado de `images/` depois de apagar a proposta e depois do `Ctrl+Z` (as imagens que ficam órfãs saem)
- [ ] R3.3: sem a promessa do cartão de texto no Formulário (marcação com filhas), ou com a condição em que ele aparece
- [ ] R3.8: o aviso da migração é uma faixa que some sozinha; onde conferir depois (o backup em `backups/` e o `schemaVersion`)
- [ ] Apêndice A: a extensão do Chrome que não injeta arquivos de uma pasta montada (tudo entra pelo seletor, com a pessoa)
- [ ] ROADMAP: rodada 7 no andamento do marco; o prefixo `images/` na lista de observações; etapa 10 concluída
- [ ] Esta seção vai para `docs/history/PLAN-etapa-10.md` com as decisões dos PRs; `PLAN.md` sem etapa em andamento; `CLAUDE.md` atualizado

