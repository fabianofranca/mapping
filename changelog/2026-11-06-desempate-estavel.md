# Stable tie-breaking — 2026-11-06 (épico `epic/desempate-estavel`, PR #621, MCP 0.22.0, schema v14)

## Corrigido

- Reordering a marking (the **Order** in Details or the MCP `move_marking`) no longer swaps parent and child of the same rectangle, nor the parent among candidates of the same area, on the next gesture: in ties the hierarchy settle prefers the current relation, and the array order only decides the new tie.
- A proposal with a reordering (`move_marking`) in the batch applies the same parents and the same order among siblings that the review (the **Proposed** view) and the `membership` showed, also when there are equal rectangles (`wrap_items`). Only one rare family is left out, documented as a known limit (#625): a tie between markings that already existed, decided in the batch by a step the proposal does not record, follows the base's relation; check with `get_marking` after applying.
- The review no longer shows an extra position change when two new markings enter at the same place.
- **Wrap** (and the MCP `wrap_items`) puts the new one in the right chain after reordering markings of the same rectangle: it becomes a child of the parent the selected ones had and the direct parent of them, instead of entering in the middle of the chain.
- A proposal with two position changes for the same marking no longer duplicates that marking or loses a sibling when applied: the last one wins.
