# Mensagens do modelo: riscos de manutenção — [Não lançado] (épico `epic/riscos-mensagens`, PR #0, MCP 0.39.1, schema v19)

## Alterado

- **Mensagens do modelo (limpezas internas, #1589):** os problemas da declaração das origens (`origins`) passam a ser dados (caminho, texto e código), com o código no emissor, e o código deixa de ser achado lendo o texto de volta; `pathErrorMsg` mora em `specIssueCode.ts` e o texto do caminho de pacote vem só do catálogo; o contrato de `SPEC_PATTERN_CODES` passa a ser imposto por teste e o texto dos enums do zod sai do catálogo; `spec.onlyFormat10` e `spec.onlyFormat15` saem (vale `spec.onlyFormat` com `{ version }`); a chave do coletor de avisos não aloca no caso comum; e `reason` deixa de ir em `params` quando há `detail`. Nenhum texto muda: o `message` pt-BR do modelo, o en-US e o pt-BR da interface e o JSON do MCP ficam iguais.

## Corrigido

- **Origem da especialização com chave desconhecida ou âncora inválida que traz `": "` ou `"; use "` no valor:** a chave desconhecida com `": "` no nome (`{ "system": "a", "x: y": 1 }`) saía no caminho errado (`origins[0].x`, com o texto `y: chave desconhecida: x: y`) e sem código, então a app em en-US a mostrava em português; a âncora literal `"a; use b"` saía com os parâmetros trocados. Agora o problema sai no caminho certo (`origins[0].x: y`) e na língua da app, na validação da app e no `validate_specialization`/`validate_library` do MCP.
