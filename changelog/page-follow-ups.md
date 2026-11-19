# Page follow-ups — [Não lançado] (épico `epic/page-follow-ups`, PR #2277, MCP 0.47.1, schema v21)

Schema and formats unchanged (proposal `formatVersion` 10, conversation `formatVersion` 2).

## Corrigido

- **Move to page no longer releases an anchor in silence:** a move that would cut an anchor is refused, like an arrow, in the MCP (`move_to_page` and `delete_page` with `move_to`: error `page-anchor-crossing`, with `anchors` in `details`; `page-arrow-crossing` also lists the anchors when an arrow crosses too). Nothing is written, and the hint says how to resolve it (add the other marking's root to `roots`, or `update_marking` with `anchor: null`). In a review, accepting only one of the `page` changes that would release an anchor blocks **Apply accepted** with the same two exits. In the app, **Move to page** shows the dialog "The move would cut anchors" (or "arrows and anchors"), with each anchor and **Go to the marking**, and the review names the anchor ("<anchored> would be anchored to <target> on another page.").
- **Deleting a page with Move the content takes locked items along instead of failing** (`delete_page` with `move_to` in the MCP too): the locked roots go with the others, shifted like them, and stay locked. **Move to page** of a locked root still refuses.
- **A v21 file without `pages` opens through Repair and open:** the key absent is read as an empty list (the first page is created and everything goes to it), instead of a schema error.
- **The review opens a page that the proposal creates:** in the Proposed view, choosing the creation of a root on a page that the proposal itself adds opens that page (the status bar says its name), and the **Page** menu lists it with the tag "New in this proposal". The Current view and exiting the review go back to the page that was open before, with no "no longer exists" notice.

## Alterado

- **The Delete page confirmation says how many conversations on empty spots of the page lose their place:** a line in the empty, the move and the discard forms ("N conversations on empty spots of this page lose their place: they stay in Comments, without a place."); no line when there is none.
- **The `dist/index.html` ceiling went up 16 KiB, from 2310144 to 2326528, by the budget rule; above the limits, `bug` #2282 for the owner to review.**
