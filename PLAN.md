# Mapeador de Imagens — Plano de desenvolvimento

> Este documento guarda o resumo do produto e **só as fases pendentes** (hoje nenhuma). Ao concluir uma tarefa, marque o checkbox correspondente no mesmo PR.

## Produto

Aplicação web para mapear áreas de imagens com **marcações retangulares**, organizar informações em **camadas** e registrar **anotações** (pares chave-valor livres ou anotações **tipadas** definidas por uma **especialização**). Tudo é salvo num `mapping.json` ao lado das imagens (pasta ou zip), num formato pensado para ser lido por um agente de IA, que deve conseguir recortar, na imagem original, a área exata de cada marcação.

Estado: **etapas 1, 1.1, 2, 2.1, 2.2 e 2.3 (redesign da interface) concluídas**; em andamento: **etapa 2.5 (trava de marcações e imagens)**, detalhada abaixo. A etapa 2.4 (CSP) e as seguintes estão no [`ROADMAP`](docs/ROADMAP.md) e entram aqui quando começarem. O `index.html` é um único arquivo autocontido (funciona em `file://` e no GitHub Pages), **desktop primeiro e utilizável no celular**, com tema claro/escuro e pt-BR/en-US.

## Documentação

| Documento                                                | Conteúdo                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`README.md`](README.md)                                 | O que é, como rodar, testar, publicar e usar o preview                         |
| [`CLAUDE.md`](CLAUDE.md)                                 | Regras de trabalho e de arquitetura para o Claude Code                         |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | Camadas, fluxo de dados, regras (com o porquê) e onde fica cada coisa          |
| [`docs/FORMAT.md`](docs/FORMAT.md)                       | Referência do `mapping.json` (schema v4)                                       |
| [`docs/SPEC-FORMAT.md`](docs/SPEC-FORMAT.md)             | Formato do arquivo de especialização (e `docs/spec.schema.json`)               |
| [`docs/history/PLAN-etapas-1-2.md`](docs/history/PLAN-etapas-1-2.md) | Histórico: seções 1 a 13 do plano antigo (inclui o roteiro de teste manual, 13.9) |
| [`docs/history/PLAN-etapa-2-1.md`](docs/history/PLAN-etapa-2-1.md)   | Histórico: etapa 2.1, revisão técnica (achados, decisões e fases 18 a 25)       |
| [`docs/history/PLAN-etapa-2-2.md`](docs/history/PLAN-etapa-2-2.md) | Histórico: etapa 2.2, segunda revisão técnica (fases 26 e 27 concluídas; 28 dispensada) |
| [`docs/history/PLAN-etapa-2-3.md`](docs/history/PLAN-etapa-2-3.md) | Histórico: etapa 2.3, redesign da interface (fases R1 a R9 concluídas; R10 movida para Evoluções) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ordem das etapas (2.4, 2.5, 3, 4), marco de uso real e evoluções |
| [`docs/redesign/HANDOFF.md`](docs/redesign/HANDOFF.md) | Redesign da interface (etapa 2.3, concluída; referência): componentes, tokens, mudanças B#, propostas P# e decisões |

## Etapa 2.5 — Trava de marcações e imagens

Objetivo: proteger marcações e imagens já revisadas contra alterações acidentais, sem impedir a navegação nem a seleção. Decisões: ver a descrição do PR.

- [x] **F1. Schema v5 e modelo** — `locked` em imagens e marcações, migração (`false`), regras em `src/model/locks.ts` (mover, redimensionar e excluir bloqueados; pai trancado trava a geometria dos descendentes), testes.
- [x] **F2. Store e estado derivado** — actions de trancar/destrancar (uma entrada de desfazer, inclusive "trancar todas") e conjunto derivado de marcações com geometria trancada.
- [ ] **F3. Canvas** — sem alças no item trancado, cadeado na seleção e sob o cursor, cursor "não permitido", segurar no celular não pega o item trancado.
- [ ] **F4. Interface** — cadeado na Árvore e em Detalhes, "Trancar todas as marcações desta imagem", atalho de teclado na Ajuda, textos pt-BR/en-US.
- [ ] **F5. Ajustes** — `.gitignore` com `backups/` ao criar projeto em pasta, texto sobre git na tela inicial, ajuda e lista vazia em "Pertence a", testes de `useEditorShortcuts`.
- [ ] **F6. Documentação e verificação** — `FORMAT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, e2e e PR.

## Etapas futuras

A ordem das próximas etapas está em [`docs/ROADMAP.md`](docs/ROADMAP.md). O detalhamento das fases entra aqui quando a etapa começar.
