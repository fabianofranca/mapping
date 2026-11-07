# Conteúdo fora da imagem — [Não lançado] (épico `epic/conteudo-fora-da-imagem`, PR #766, MCP 0.27.0, schema v17)

## Adicionado

- O `ref` pode apontar para a anotação inteira (`accepts.annotations`, valor `{ "annotationId" }`), na `formatVersion` 14 da especialização; o schema do projeto sobe para a v17 (só a versão muda; uma app antiga abre o arquivo só para leitura).
- Na app, o seletor de `ref` (campo e célula de tabela) oferece as anotações aceitas por `accepts.annotations`, com o rótulo e o nome do tipo, e ganha o filtro por tipo; o valor mostra o rótulo e leva ao alvo.
- O cartão da anotação tipada ganha a linha **Referenciada por**, com as anotações que apontam para ela inteira (cada uma num botão que a seleciona).
- O MCP (0.27.0): o lote aceita `{ "annotation" }` sozinho como `ref` para a anotação inteira, e o `get_code_hints` expande o componente apontado (`targets`).
- O guia do agente ganha a seção "Conteúdo fora da imagem" (o container "depois", o evento que aponta para os componentes e o lote completo).

## Alterado

- O `get_code_hints` passa a incluir, em cada anotação, os `targets` dos campos e das células `ref` para a anotação inteira; os `values` e os `args` continuam com o rótulo, por compatibilidade, e os `types` incluem os tipos dos alvos.
- O roteiro de teste novo **R24 — Conteúdo fora da imagem** (`docs/TESTING.md`) entra na rodada completa, no bloco 2.

## Corrigido

- Nenhum defeito encontrado durante a etapa.
