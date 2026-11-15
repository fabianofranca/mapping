# Named slots with default content — [Não lançado] (épico `epic/slots-nomeados`, PR #0, MCP 0.42.0, schema v20)

## Adicionado

- Component format (`formatVersion` 4): the `slot` node gains `id` (pattern `^[a-z][a-zA-Z0-9_-]*$`, so it can equal the parameter of a platform, like `floatingActionButton`) and `fallback`, the default content: a `frame` drawn while no child marking is in the slot. A component can now have several slots, each one with its own `id`; with a single slot the `id` stays optional and everything works as before. In a `formatVersion` 1 to 3 both keys are `only allowed with formatVersion 4`.
- The box rule: the `visible`, the sizes, the `anchors` and the `layout` of a slot and of its ancestors in the template cannot cite a field that only the `fallback` cites (`slot: the box cannot depend on a field of the default content: <field>`), because the default content is replaced by the child and the box has to be the same with or without it.
- Which slot a child marking is in is derived from the geometry, never written to the project: the greatest intersection with the slot's box, the closest one when there is none, and a tie goes to the template order; a type that a slot accepts wins over a slot that accepts everything (`accepts` and `max` come with the specialization in a later phase). A new child with no geometry goes to the requested slot, else to the first one that accepts its type and is not full.
- `docs/COMPONENT-FORMAT.md` ("Several slots and default content"), `docs/component.schema.json`, `docs/AGENT-GUIDE.md`, `docs/ARCHITECTURE.md` and the `spec-author` skill: the slot `id` and `fallback`, the rule that a code content lambda becomes a slot named by its parameter, and the pitfalls (numbered fields for free content, a slot without `id` in a component with two, a slot box that depends on the default content).

## Alterado

- **Break:** a `formatVersion` 4 component with two or more slots and no `id` in them, valid until now (the children went to the first slot), is now an error: `slot: with more than one slot, each one needs an id`, at the slot node. Put an `id` in each slot (the parameter name of the platform's lambda is a good one). No component of the repository's libraries, examples and fixtures has two slots, so none of them changes. A component with a single slot, with or without `id`, and a `formatVersion` 1 to 3 component keep working as before.
- `docs/COMPONENT-FORMAT.md`: "One slot per component" leaves "Known limits", which now records the break above.
