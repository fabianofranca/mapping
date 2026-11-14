# Spatial markings, notes and arrows — 2026-10-23 (PR #217, MCP 0.9.0, schema v13)

## Adicionado

- A marking that belongs to the canvas (without a container) and can enclose containers; containment is resolved by geometry and saved (the agent reads `parent`/`members`, never computes it).
- Multiple selection and joint dragging.
- Notes: built-in library of floating markings (`floating`).
- Arrows as markings that point (collection `arrows`, `appliesTo`) and tables with `repeat`.
- Specialization `formatVersion` 7, proposal `formatVersion` 3 and component `formatVersion` 2.

## Alterado

- Inheritance between markings was removed (schema v13).
