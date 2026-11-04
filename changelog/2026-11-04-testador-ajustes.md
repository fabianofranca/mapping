# Auxiliares da nuvem e guia corrigidos — 2026-11-04 (épico `epic/testador-ajustes`, PR #417, MCP 0.13.0, schema v13)

## Corrigido

- `selectFolder`, `openFile`, `saveFile` e `cancelDialog` (`scripts/testing/cloud.mjs`) esperam o diálogo nativo aparecer (5 s, nova tentativa a cada 150 ms, `timeoutMs` opcional) em vez de procurá-lo uma vez só. Ao esgotar o prazo, o erro traz os títulos esperados, a janela ativa do Chrome e, se a aba ativa não for a da app, a causa provável (duas abas na janela). Novo `waitForWindow`.
- `clickNoWait` aceita `{ scope, exact }`, conta os candidatos antes de clicar e falha (com o nome e a contagem) se achar zero ou mais de um, em vez de escolher um em silêncio.
- `docs/TESTING.md`: o R4.5 descreve os dois avisos da rejeição junto (o do cabeçalho de Detalhes e o do canto do canvas) e a marca **junto** como a app a mostra (ícone de elo no cartão, selo com texto na lista da revisão), conferido por um teste de componente; o apêndice A e a seção 4 cobrem o seletor nativo com duas abas, e a receita 4 explica os nomes acessíveis repetidos e o `scope`.
