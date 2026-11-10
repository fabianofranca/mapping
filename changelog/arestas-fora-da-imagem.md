# Arestas do conteúdo fora da imagem — [Não lançado] (épico `epic/arestas-fora-da-imagem`, PR #1417, MCP 0.30.0, schema v18)

## Adicionado

- MCP: `add_container` aceita `beside` (referência, id ou `$apelido` de um container): o novo nasce à direita dele (borda direita + vão), com o topo alinhado e a **mesma `scale`**; lugar ocupado vai para o espaço livre mais próximo, mantendo a escala. Exclusivo com `center` (`invalid-arguments`). Vale com `file` e com fundo; o lote do guia ("Conteúdo fora da imagem") passa a usá-lo.

## Alterado

- MCP: `backlinks` de `get_marking`/`get_annotation` agora agrupa por origem: uma entrada por anotação de origem, `{ from, fromLabel, fromMarking, fields: [{ field, row, column, to }] }`. Quebra quem lia `field` ou `to` direto na entrada.
- MCP: `refs` e `backlinks` trazem `row` (índice 0-based da linha, como no `get_code_hints`) e `column` de uma célula de tabela, ou `null` nos dois quando o `ref` é um campo. O texto `field` continua como se lê na app (1-based).

## Corrigido

- A 900×720 o valor de uma referência mostra o nome do alvo inteiro; o que não cabe aparece no tooltip.
- Na tabela, o ✕ de Limpar da célula `ref` não cobre mais o rótulo do alvo e "(referência quebrada)" aparece inteira (o que não couber vai para o tooltip); a coluna `ref` divide a tabela como as outras, sem rolagem horizontal (CL2), e a referência quebrada quebra entre as palavras. A 900×720 o nome do alvo no campo `ref` não perde mais fração de pixel para a camada.
