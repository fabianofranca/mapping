# Canvas performance — 2026-11-10 (épico `epic/canvas-desempenho`)

## Pendências

- **`Arrow` and `Canvas.md` (CD3, arrow level of detail):** from afar the arrow has three levels by its size on screen. Below `size-lod-min-marking` (24 px long) it is **the stroke only**: no halo, no tip and no label. Connecting two invisible markings (below `size-lod-hide-marking`, 2 px, in both measures) the arrow **disappears**. The selected one (including in multi-selection) and those connected to a selected marking or one under the mouse stay **complete**, like the markings. An arrow outside the visible area is not drawn. No new token.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-10: versions 75 and 76 (76 is the index, with `lastChange`). `project/Canvas.md` (Arrows section: level of detail) and `project/components/Arrow/README.md` ("From afar (level of detail)" paragraph).

## Ficou sem gravar

Nothing: the only pending item was written.
