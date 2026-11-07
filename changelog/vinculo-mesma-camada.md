# Vínculo na mesma camada — [Não lançado] (épico `epic/vinculo-mesma-camada`, PR #704, MCP 0.24.0, schema v15)

## Adicionado

- Vínculo na mesma camada: um tipo cuja especialização declara (`formatVersion` 13) pode ter dona da própria camada, inclusive do mesmo tipo (um evento dono de outros eventos, cada filho no papel em que se liga, como Sucesso e Falha). `allowedChildren` aceita a cláusula `{ layer }` da camada do próprio tipo e o id de um tipo da mesma camada. A anotação livre continua só com dona de outra camada, e o ciclo continua barrado. Schema v15 do `mapping.json`, sem mudança de dados.
- Guia do agente e skill `spec-author`: o "quando" é papel também entre eventos (encadeamento por papel, com um lote de exemplo), e o anti-padrão `chainedAfter` e `trigger` como campos do tipo.

## Alterado

- MCP: o texto do erro `invalid-annotation-parent` diz que a dona pode ser de outra camada ou, na anotação tipada, de um tipo que aceite o vínculo, inclusive na mesma camada.

## Corrigido

- MCP: a célula `ref` de uma tabela aceita o mesmo valor do campo `ref`, inclusive apelidos do mesmo lote (#677).
