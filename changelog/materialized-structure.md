# Stored structure for materialized markings — [Não lançado] (épico `epic/materialized-structure`, PR #3145, MCP 0.74.0, schema v27)

## Adicionado

- The **stored structure of a materialized marking** (phase MS1 of #3087, schema v27): a marking whose own annotation has a type that declares a `component` keeps its `parentId` as stored, and the new optional `markings[].slot` (written right after `parentId`, only when set) names the slot of its parent that holds it. The settle only drops an invalid stored parent (missing, itself, another space, floating, decorative or in a cycle) to `null`; a materialized marking is never a parent by geometry, and an observation marking keeps the geometry rule among observation markings only (`src/model/nature.ts`, `settleStructure.ts`).
- A materialized child lives in its parent's space and travels with it; the clipped settle still equals the full one, proved with materialized markings, stored parents and nature changes among the operations (#3137).
- The invariant `slot-without-parent` and its repair `slot-cleared`; `rect-outside-parent` is not reported for a materialized child.
- `addComponentMarking` stores the `parentId` it receives, so a component created inside another keeps its parent now that the geometry no longer picks it.

## Alterado

- In progress: stored structure (parent, slot, order) for materialized markings (#3087).
