# Link in the same layer — 2026-11-07 (épico `epic/vinculo-mesma-camada`, PR #703, MCP 0.24.0, schema v15)

## Adicionado

- Link in the same layer: a type whose specialization declares it (`formatVersion` 13) can have an owner in its own layer, even of the same type (an event that owns other events, each child in the role in which it links, like Success and Failure). `allowedChildren` accepts the `{ layer }` clause for the type's own layer and the id of a type in the same layer. The free annotation still only has an owner in another layer, and the cycle is still barred. Schema v15 of `mapping.json`, with no data change.
- Agent guide and `spec-author` skill: the "when" is a role also between events (chaining by role, with an example batch), and the anti-pattern `chainedAfter` and `trigger` as fields of the type.

## Alterado

- App: the hint and the empty state of the **Linked to** field say that, in a typed annotation, the owner can be in the same layer when its type accepts the link; in a free one, it is still only another layer. The field shows the chosen value in full (`Layer: Name`) on hover, because the visible text can be cut off when the candidates start the same way.
- MCP: the text of the `invalid-annotation-parent` error says the owner can be in another layer or, in a typed annotation, of a type that accepts the link, including in the same layer.

## Corrigido

- MCP: the `ref` cell of a table accepts the same value as the `ref` field, including aliases from the same batch (#677).
