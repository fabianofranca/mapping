# Named slots with default content — 2026-11-15 (épico `epic/slots-nomeados`)

## Pendências

- `PropertyGrid` (`src/ui/PropertyGrid.tsx`, used by `TypedFields.tsx`): the `status` line (`.props-status`) now also carries the note of a default-content field of a slot that has a child ("The slot <name> has content: this field does not draw or go into the code"), with the `hint` still being the field's description. An existing pattern: no new component, token or icon; the `PropertyGrid` guide and preview need one more state of the `status`.

## Sincronização

Versão 90 (content and index, in a single publish) of the **Mapping** artifact, on 2026-11-15. The only pending item was recorded: the `PropertyGrid` guide (`components/PropertyGrid/README.md`) now lists the default-content field of a slot that has a child ("The slot <name> has content: this field does not draw or go into the code") as a use of the `status` line, with the `hint` still being the field's description, and its preview (`preview.html`) gained a default-content row showing that state. No new component, token or icon.

## Ficou sem gravar

- `PropertyGrid` guide and preview: one more state of the `status` line. Motivo: the closing session does not write to the **Mapping** artifact; it stays for the next design-system pass.
