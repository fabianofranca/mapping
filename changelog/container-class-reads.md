# Container classes: own set in the drawing, chosen sets across specializations — [Não lançado] (épico `epic/container-class-reads`, PR #0, MCP 0.61.2, schema v24)

Schema unchanged.

## Corrigido

- A component's `$container.<set>` reads the set of its own specialization (its thresholds and classes), the same one the `outside-container-class` item reads, so the canvas and **Incomplete** agree when two specializations declare the same computed set (#2489).
- A set that one specialization declares as chosen can be chosen in the container Details, and its stored choice is not listed as undeclared, even when an earlier specialization declares the same id as computed (#2489).
- The MCP accepts a choice in a set that some applied specialization declares as chosen even when an earlier one declares the same id as computed; `chosenSets` lists the chosen sets (#2489).
- The MCP no longer keeps an incomplete component catalog after a transient read failure of a component file: the next call reads the file again and draws the type (#2815).
