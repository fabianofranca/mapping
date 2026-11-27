# Container classes: own set in the drawing, chosen sets across specializations — [Não lançado] (épico `epic/container-class-reads`, MCP patch, schema v24)

Schema unchanged.

## Corrigido

- A component's `$container.<set>` reads the set of its own specialization (its thresholds and classes), the same one the `outside-container-class` item reads, so the canvas and **Incomplete** agree when two specializations declare the same computed set (#2489).
- A set that one specialization declares as chosen can be chosen in the container Details, and its stored choice is not listed as undeclared, even when an earlier specialization declares the same id as computed (#2489).
