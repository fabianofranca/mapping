# Histórico — Etapa 2.5, trava de marcações e imagens (seção do antigo PLAN.md)

> Fases F1 a F6 concluídas.
>
> Arquivo histórico: seção movida do `PLAN.md` sem alterações de conteúdo. As seções 1 a 13 estão em [`PLAN-etapas-1-2.md`](PLAN-etapas-1-2.md); as etapas seguintes, nos outros arquivos desta pasta.

---

## Etapa 2.5 — Trava de marcações e imagens

Objetivo: proteger marcações e imagens já revisadas contra alterações acidentais, sem impedir a navegação nem a seleção. Decisões: ver a descrição do PR.

- [x] **F1. Schema v5 e modelo** — `locked` em imagens e marcações, migração (`false`), regras em `src/model/locks.ts` (mover, redimensionar e excluir bloqueados; pai trancado trava a geometria dos descendentes; descendente trancado não impede o pai: mover o leva junto e excluir o pai o exclui), testes.
- [x] **F2. Store e estado derivado** — actions de trancar/destrancar (uma entrada de desfazer, inclusive "trancar todas") e conjunto derivado de marcações com geometria trancada.
- [x] **F3. Canvas** — sem alças no item trancado, cadeado na seleção e sob o cursor, cursor "não permitido", segurar no celular não pega o item trancado.
- [x] **F4. Interface** — cadeado na Árvore e em Detalhes, "Trancar todas as marcações desta imagem", atalho de teclado na Ajuda, textos pt-BR/en-US.
- [x] **F5. Ajustes** — `.gitignore` com `backups/` ao criar projeto em pasta, texto sobre git na tela inicial, ajuda e lista vazia em "Pertence a", testes de `useEditorShortcuts`.
- [x] **F6. Documentação e verificação** — `FORMAT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, e2e e PR.
