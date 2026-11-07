# Vínculo na mesma camada — 2026-11-07 (épico `epic/vinculo-mesma-camada`, PR #703, MCP 0.24.0, schema v15)

## Adicionado

- Vínculo na mesma camada: um tipo cuja especialização declara (`formatVersion` 13) pode ter dona da própria camada, inclusive do mesmo tipo (um evento dono de outros eventos, cada filho no papel em que se liga, como Sucesso e Falha). `allowedChildren` aceita a cláusula `{ layer }` da camada do próprio tipo e o id de um tipo da mesma camada. A anotação livre continua só com dona de outra camada, e o ciclo continua barrado. Schema v15 do `mapping.json`, sem mudança de dados.
- Guia do agente e skill `spec-author`: o "quando" é papel também entre eventos (encadeamento por papel, com um lote de exemplo), e o anti-padrão `chainedAfter` e `trigger` como campos do tipo.

## Alterado

- App: a dica e o estado vazio do campo **Vinculada a** dizem que, na anotação tipada, a dona pode ser da mesma camada quando o tipo dela aceita o vínculo; na livre, continua só outra camada. O campo mostra o valor escolhido por inteiro (`Camada: Nome`) ao passar o mouse, porque o texto visível pode cortar quando os candidatos começam igual.
- MCP: o texto do erro `invalid-annotation-parent` diz que a dona pode ser de outra camada ou, na anotação tipada, de um tipo que aceite o vínculo, inclusive na mesma camada.

## Corrigido

- MCP: a célula `ref` de uma tabela aceita o mesmo valor do campo `ref`, inclusive apelidos do mesmo lote (#677).
