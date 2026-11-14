# Visual pass over the perspectives and the canvas — 2026-11-10 (épico `epic/passada-perspectivas-canvas`)

## Pendências

- **`PerspectivesSection` (Details):** the **Send to perspective…** trigger now has the look of the `Button` (`font: var(--t-text)`, height `--control-height`, border `--color-border-control`, hover and pressed states). Files: `src/ui/PerspectiveSendMenu.tsx`, `src/theme/editor.css`.
- **`Menu`:** new `menu-popover-control` variant of `MenuPopover` (trigger with the look of the `Button`, instead of that of **project ▾**). `MenuPopover.tsx` does not change; the class was already accepted.
- **`CanvasMarking` and the `Canvas.md` section:** the "Came from…" badge of the large root rises above the name strip of another root right below it and, on any root, picks the spot already pulled into the view (never over the title of another root or over that of the Arrival area); the Arrival area label sits at `tokens.arrival.pad` (8 px) from each edge of the visible area and gets an ellipsis when it does not fit. Files: `src/canvas/arrivals.ts`, `src/canvas/renderers/arrivals.ts`.
- **`Notice`:** short notices (`ui.toast`) and the progress one leave `.canvas-overlay` (top) and go to `.canvas-overlay-foot`: foot of the canvas, on the left, as wide as the text (wraps onto lines if the column is narrow, no ellipsis), without going under the minimap; errors, Read-only, repair and backup stay at the top. Files: `src/app/CanvasNotices.tsx`, `src/theme/canvas.css`.
- **`Breadcrumbs`:** in the canvas bar above 470 px, the segments that are not the last shrink first (`flex-shrink: 20`, minimum `--space-8`); the last one shrinks last. Up to 470 px nothing changes (BC1). File: `src/theme/editor.css`.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-10: version 78. The five pending items above were written: `components/Menu/README.md` (`menu-popover-control` variant), `components/PerspectivesSection/README.md` (trigger with the look of the `Button`), `Canvas.md` ("Came from…" badge and Arrival area label; the `CanvasMarking` guide does not describe these marks, so it did not change), `components/Notice/README.md` (short and progress notices at the foot of the canvas) and `components/Breadcrumbs/README.md` (segment shrinking in the wide bar).

## Ficou sem gravar

Nothing.
