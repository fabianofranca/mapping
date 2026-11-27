# Decorative markings (Frame, Bracket, Line) — 2026-11-27 (épico `epic/decorative-markings`)

## Pendências

- **DM4 — Details:** a new checkbox row, **Decorative** (`Choice` with a hint, with `ext?.mark`/`ext?.below` for the review), under **Floating** in the Details of a marking; the two rows disable each other, and the hint of the disabled one changes to say why (`marking.floatingDisabledHint`, `marking.decorativeDisabledHint`). Sync it with the Details of a marking in the Mapping artifact of Claude Design.

- **DM5 — Palette and canvas:** the notes library's **Frame**, **Bracket** and **Line** are new Palette items and new canvas drawings (neutral gray outline `#79747E`, solid or dashed, a filled frame as a background surface). Sync the three drawings and their Palette entries with the Mapping artifact of Claude Design.

## Sincronização

Gravado no artefato **Mapping** em 2026-11-27: versão 116 (one write, index last with `lastChange`, no file deleted).

- **DM4:** `MarkingPanel` guide and preview. The Details section now lists **Decorativa** (`Choice` with a `HelpTip` hint) under Flutuante, with `ext?.mark`/`ext?.below` for the review; the guide records that the two rows disable each other and that the hint of the disabled one says why (`marking.floatingDisabledHint`, `marking.decorativeDisabledHint`). The preview gets the new row in every Details card (disabled in the Floating and read-only cards) and a new card, "Decorativa (caixa marcada)".
- **DM5:** `CatalogWindow` guide and preview: Frame, Bracket and Line entries in the Palette tab (under the Notas library, button "Adicionar na tela X", since they are not floating). `ComponentDrawing` guide and preview: five new cards for the three drawings (dashed Frame, filled Frame without outline as a background surface, Bracket open to the right, horizontal Line, dashed vertical Line) and a guide paragraph with the neutral gray outline `#79747E`.
- **Contrast:** no new token or color in the DS; `#79747E` is the component's own default, not a DS token. It holds at least 3:1 as a meaningful mark on the grounds the previews use: 3.67:1 on `color-canvas-bg` and 4.55:1 on `color-surface` (light), 4.27:1 and 3.59:1 (dark). The filled Frame uses `color-surface`.

## Ficou sem gravar

Nothing yet.
