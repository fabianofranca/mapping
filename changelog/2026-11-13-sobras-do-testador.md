# Sobras do testador — 2026-11-13 (épico `epic/sobras-do-testador`, PR #1835, MCP sem mudança, schema v19)

## Alterado

- O prompt do testador (`docs/TESTING-NUVEM.md`) volta à redação de antes do PR #1709, com o teto subindo de 32.000 para 32.500 caracteres (`testingGuide.test.ts` e `contextUsage.test.ts`); o parágrafo "Contexto até 300 mil" e o item 5 da Entrega, com `; contexto <mil> mil`, ficam como estão.
- `cloud.mjs tempos`: as marcas de um nome que alternam `start`, `end`, `start`, `end` (o `ambiente` quando o `cloud-up.sh` roda duas vezes) somam os trechos, contam os `run` de dentro deles e não dão aviso de marca repetida; dois `start` ou dois `end` seguidos seguem com o aviso.
- `docs/TESTING.md`: o R18.4 dá o seletor do quadro (`.change-popover [aria-label^="Aviso "]`) e o R18.4 e o R19.27a dizem onde está o **Aceitar tudo** abaixo de 1200 px (no menu **Em lote**).
- `docs/TESTING-NUVEM-CONSULTA.md`: o "Histórico dos blocos" traz os tamanhos atuais dos guias e das bases e a linha de base de custo e contexto do fluxo enxuto (#1543 e retestes), com o critério dos 300 mil; a "Passada visual" diz que a rolagem horizontal da moldura da tabela do Catálogo não é falha, mas a da página ou da janela é.
- Os registros do DS dos previews de `Container`, `RefCell` e `ReferenceField` passam para `docs/design-system/sobras-do-testador.md`.

## Corrigido

- Paleta do Catálogo a 900×720: o nome de cada tipo aparece inteiro (quebra em linhas) e o botão **Adicionar no canvas** fica sem corte, descendo para a linha de baixo quando não cabe ao lado do nome.
- Catálogo: as tabelas do documento do componente não partem mais palavras curtas no meio ("enu/m", "strin/g") e os nomes da lista, como `LazyVerticalGrid` e `HorizontalPager`, não partem na janela estreita; a moldura da tabela rola na horizontal.
- Árvore e Detalhes a 900×720: título da janela, rótulos da Árvore e nome da camada cortados com reticências ganham dica com o texto inteiro, e "Nenhuma anotação nesta camada." vira uma nota abaixo do cabeçalho da camada, sem corte.
