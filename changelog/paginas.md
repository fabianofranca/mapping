# Pages — [Não lançado] (épico `epic/paginas`, PR #883, MCP 0.44.0, schema v21)

## Adicionado

- Format v21: the project has **pages** (`pages` at the root, `pageId` on every container and on every canvas marking). Each page is a canvas of its own: containment, image overlap, arrows and anchors are decided inside the page. A v20 project opens with one page holding everything, and the original goes to `backups/` before the first save. An earlier app opens the file read-only, as a newer version.
- Model: `createPage`, `renamePage`, `movePage`, `deletePage` (content moved to another page or discarded, the last page cannot go), `moveRootsToPage` (the whole root goes, keeps its relative positions and enters at the right of the destination's content) and `pageContent`.
- Validation and repair for pages: `pages-empty`, `page-duplicate-name`, `page-missing`, `page-required`, `page-parent-mismatch` and `arrow-cross-page`, each with its mechanical repair (an arrow between pages is removed and listed).

## Alterado

- `createArrow` and `setArrowEndpoint` refuse ends on different pages (`arrow-cross-page`); `setMarkingSpace` refuses sending a marking with arrows into a container of another page.
- A new container or canvas marking goes to the first page unless `pageId` says otherwise; placement only looks at the page.
