# Container context — [Não lançado] (épico `epic/container-context`)

## Pendências

- **`ContainerClassField` (`src/ui/ContainerClassField.tsx`, CX3):** a new Details property of the container, next to density and direction. It is a composition of `Property` and the `Select` control (size `sm`) with no shape of its own, plus a read-only `props-text` line per computed set; it adds no token and no style. To map in the DS as part of the container Details, not as a component.
- **Diagnostics section "Container classes" (`DiagnosticsContainerClasses` in `src/ui/DiagnosticsView.tsx`, CX3):** a new section with the same shape as the "Drawing mode" one (heading, hint, list), listing the undeclared stored choices. Same pattern as `DiagnosticsDrawingMode`; no new component.
- The pending item `outside-container-class` is a text of the existing **Incomplete** list and Details alert: no visual change.
