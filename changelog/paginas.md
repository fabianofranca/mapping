# Pages — [Não lançado] (épico `epic/paginas`, PR #883, MCP 0.44.0, schema v21)

## Adicionado

- Format v21: the project has **pages** (`pages` at the root, `pageId` on every container and on every canvas marking). Each page is a canvas of its own: containment, image overlap, arrows and anchors are decided inside the page. A v20 project opens with one page holding everything, and the original goes to `backups/` before the first save. An earlier app opens the file read-only, as a newer version.
- Model: `createPage`, `renamePage`, `movePage`, `deletePage` (content moved to another page or discarded, the last page cannot go), `moveRootsToPage` (the whole root goes, keeps its relative positions and enters at the right of the destination's content) and `pageContent`.
- Validation and repair for pages: `pages-empty`, `page-duplicate-name`, `page-missing`, `page-required`, `page-parent-mismatch` and `arrow-cross-page`, each with its mechanical repair (an arrow between pages is removed and listed).

- Page selector ("Page" menu in the canvas bar, next to the perspective picker): lists the pages with their root counts, marks the open one and ends with **New page…** and **Manage pages…**. It is always visible, even with one page, and the status bar says "Page <name>".
- **Manage pages** dialog: create, rename, reorder (**Move up**/**Move down**) and delete pages.
- Deleting a page with content asks first, counting roots, markings, arrows and annotations, with two exits: **Move the content to…** another page, or **Delete the page and everything in it**; each is one undo entry, and **Cancel** has focus. The last page cannot be deleted.
- **Move to page** (right-click menu on a root or a selection, and the root's Details): the whole group goes along. If an arrow would be cut, nothing changes and a dialog lists the arrows with **Go to the arrow**. Otherwise the app stays on the page and shows the notice "Moved to <page>" with **Open the page**.
- Performance budget: the derived state of the open page of a project split into 4 pages costs at most about a third of the whole project's.

## Alterado

- The `dist/index.html` ceiling went up 32 KiB, from 2244608 to 2277376, by the budget rule; above the limits, `bug` #2019 for the owner to review
- "Comment here" on an empty canvas spot is only offered on the first page for now: the anchor of a canvas point has no page until the conversations phase (PG4).
- `createArrow` and `setArrowEndpoint` refuse ends on different pages (`arrow-cross-page`); `setMarkingSpace` refuses sending a marking with arrows into a container of another page.
- A new container or canvas marking goes to the first page unless `pageId` says otherwise; placement only looks at the page.
- The open page is remembered per project (UI state, outside undo; resumes the first page when the kept one no longer exists, with a notice). Only the open page is drawn and listed.
- A perspective is cut by the open page: the picker shows how many roots each one has on it, and a perspective with nothing on the page shows an empty canvas with the notice "Nothing from this perspective on this page". "New perspective > Start from: Full" takes the roots of all pages.
- The "Main" perspective is renamed "Full" ("Completa" in pt-BR; "Only in Full"). Only the texts change.
- Going to an item on another page (citations, comments, incomplete items, notices, proposals in review) switches to its page. Undo and redo never switch page; the status bar says where the change happened ("Undone in <page>", "Redone in <page>").
- The arrow destination picker lists only the open page; canvas point pins show only in the Full perspective.
