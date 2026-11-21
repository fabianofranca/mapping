# Container context — [Não lançado] (épico `epic/container-context`, PR #0, MCP 0.56.0, schema v22, specialization formatVersion 21)

## Adicionado

- Specialization `formatVersion` 21: **container classes**. The root key `containerClasses` declares named sets of classes, each one **computed** from the container's size in units (`by: "width"` or `"height"`, with `below` on every class but the last) or **chosen** per container (no `by`); `classes` on a ready-made size of `containers` carries the choice of a chosen set (the Phone size chooses `android`); `appliesIn` on a type lists the classes the type is meant for (any of the listed ones inside a set, all the sets together). The three keys are outside the version contract (no `version` raise, no migration, no `diffSpecs` difference) and versions 1 to 20 behave as before (#2036, #1901).
- Validation of the new keys with the path of each problem (`containerClasses[i].classes[j]`, `containers[i].classes.<set>`, `…appliesIn.<set>`): reserved ids `width` and `height`, `below` rules, unknown sets and classes, empty and repeated lists, and `appliesIn` only on a type that applies to markings in a container. Messages in both languages (#2036).
- Model API `computedClassOf(set, units)` (the class of a computed set for a size in units), `unitsOf(pixels, density)` and `isComputedSet`, pure and tested (`src/model/containerClasses.ts`). Nothing calls them in the app yet (#2036).
- Example package `examples/libraries/sdui-backend/` (`version` 4): the `platform` (chosen) and `window` (by width: `compact` below 600, `medium` below 840, `expanded`) sets, the new Web desktop size (1440 × 900), `classes` on the Phone size and `appliesIn` on `sdui-sheet` and `sdui-fab` (#2036).
- `docs/SPEC-FORMAT.md` (sections "Container classes (`formatVersion` 21)" and "Container classes a type is meant for"), `docs/spec.schema.json`, Help › Specializations, the `spec-author` skill (step "12c. Container classes"), `docs/AGENT-GUIDE.md` and the MCP descriptions of `get_specialization`, `validate_specialization` and the `spec-format` resource (#2036).

## Alterado

- The current specialization format version is 21 (the MCP server, `docs/SPEC-FORMAT.md`, Help, `spec-author` skill and `docs/AGENT-GUIDE.md`) (#2036).
