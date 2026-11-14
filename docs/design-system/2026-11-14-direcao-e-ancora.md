# Reading direction (RTL) and anchor between markings — 2026-11-14 (épico `epic/direcao-e-ancora`)

## Pendências

Phase R1 (direction in the engine, in the component format, in the screens without geometry and in the viewer) **does not change the app's design system**: no component, token or icon of the app was touched. R2 only assembles the direction with existing controls. The epic's pending items enter in the phases:

- **R2 (done, no new token):** the **Direction** field in the container Details (`ContainerDirectionField`, `Property` + `Select` in the mold of the Drawing mode, but always visible), the **Reading direction** section in the project Settings (`ProjectDirectionSettings`, `Select` in the mold of the Drawing mode) and the read-only section of Diagnostics (`DiagnosticsDirection`, only with `rtl`). Only controls and classes that already exist (`Select`, `Property`, `.repos`, `.diagnostics-modes`): no new component, token or icon.
- **R4 (done, no new token):** the **Anchor** section in the marking Details (`MarkingAnchorSection`: an **Anchored to** `Select` with "None" and the markings of the same space, two **Side** and **Alignment** `Segmented` controls, two numeric `TextField`s for the **Offset** with the short prefix `Gap` and `Shift` in the mold of the X and Y pair, and the **Snap to anchor** button, in `Property` and `PropertyGrid`; a collapsible section like the others, with the anchor's name in the summary) and the **link line** on the canvas (thin dashed stroke from the center of the anchored marking to that of the anchor, in the overlay layer, only on the selected or hovered anchored marking: `--color-border-control`, which the canvas now reads, with the `--cv-halo` halo underneath and today's 6/4 dash). The **Add** button of the Palette gains the label "Add anchored to X" on the types with `anchor` at the root. Only controls, classes and tokens that already exist: no new component, token or icon.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-14: version 88 (`1794622204-661c`, guides and index). Guides: `Canvas.md` (anchor link line, in `--color-border-control` with the `cv-halo` halo), `MarkingPanel` (**Anchor** section and **Direction** field of the container Details) and `SettingsDialog` (**Reading direction** section). No new token, component or icon; `tokens.json` did not change.

## Ficou sem gravar

- Previews (`preview.html`) of `MarkingPanel` (Anchor section, Direction field), `SettingsDialog` (Reading direction) and `Canvas`/`CanvasMarking` (link line). Motivo: regenerating a preview requires checking the light and dark themes in a browser and rebuilding `bundle.css` with the new rules (`src/theme/*.css`), which changes what the other previews draw and goes beyond "touch only what the delivery changed"; it is left for a `bundle.css` sync epic, together with the pending item already open in `2026-11-13-sobras-do-testador.md`.
- The read-only section of Diagnostics (`DiagnosticsDirection`, only with `rtl`). Motivo: the artifact has no Diagnostics guide or preview to extend.
