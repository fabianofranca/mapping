# Proposals faithful to what is applied — 2026-11-05 (epic `epic/propostas-fieis`, PR #547, MCP 0.17.0, schema v13)

## Adicionado

- `plan_changes` and `propose_changes` (MCP 0.17.0) carry `membership` when the batch changes the parent or the space of a marking or container that already existed (by geometry): each entry says who it is, where it leaves from, where it goes and a short sentence ("Button leaves Topo; now directly in Detalhes"). With no change of containment, the field does not appear.

## Alterado

- The proposal is now saved in `formatVersion` 4: the marking-creation change carries `insertBefore`, the place in the array where the marking enters. An old app refuses the file instead of dropping the field when rewriting the decisions. Proposals of versions 1 to 3 are still read and applied as before.

## Corrigido

- The applied `wrap_items` has the plan's hierarchy in the rectangle tie (when the wrapped item fills the container): the new marking has no parent, the item becomes its child and the item's children stay in it. Applying all the changes of a proposal gives the same order of markings and the same parents as the proposed project, as long as the batch has no reordering (`move_marking`); with reordering and equal rectangles the applied result can still diverge (issue #549), and the documentation says so.
- A `move_marking` that changes nothing (the marking is already at the requested position, in the batch state at that point) says "already at position N among the K siblings: nothing changes" in the summary, instead of describing a move; the `index` explains that the siblings are those of the batch state.
