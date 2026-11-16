# Pages — [Não lançado] (épico `epic/paginas`)

## Pendências

Phase PG2 adds these items to the design system (all built from `src/ui/controls/`, `<Icon>` and tokens; no new token or icon was created):

- **Page selector** (`PageMenu`, classes `page-picker`, `page-trigger`, `page-list`, `page-row`, `page-actions`): a popover next to the perspective picker. Trigger is a `Button` with the `file` icon; each row has the `check` icon for the open page, the name and the root count (`--color-text-muted`); the foot has the **New page…** and **Manage pages…** buttons. Tokens: `--space-*`, `--control-height`, `--control-icon`, `--control-radius`, `--color-hover`, `--color-pressed`, `--color-accent`, `--color-border`, `--t-text`, `--t-text-small`.
- **Manage pages dialog** (`ManagePagesDialog`, `page-create`, `page-table`, `page-name`, `page-open-mark`, `page-rename`): `Dialog` with a create field and a table of pages; row actions are `IconButton`s with the `edit`, `check`, `close` and `trash` icons plus **Move up**/**Move down**. Tokens: `--space-*`, `--color-border`, `--color-text-muted`, `--color-accent`, `--t-body-strong`, `--t-text-small`.
- **Delete page confirmations** (`DeletePageDialog`, `page-delete-counts`): the simple one (empty page) and the one with counts and two exits (**Move the content to…** with a `Select`; **Delete the page and everything in it** as a `danger` `Button`); **Cancel** has focus.
- **Move refused dialog** (`MovePageRefusedDialog`, `page-refused-list`, `page-refused-arrow`): `Dialog` listing the arrows (from, to), each with **Go to the arrow**.
- **Page notices** (`PageNotices`, in the `CanvasNotices` foot overlay, `notice notice-info`): `removed`, `moved` (with **Open the page**, a `button-link`), `undone` and `redone`. Tokens of the existing `notice` family. The status bar gets "Page <name>" before the perspective, and the `undone`/`redone` messages.
- **Move to page entries**: **Move to page ›** in the root context menu and a control in the root's Details, listing the other pages (an empty state when there is none). They reuse the existing menu and field styles; tokens as above.
- **Perspective picker**: "Principal" becomes "Completa" (Full), and each row gets the root count on the open page (`perspective-row-page`: `--t-text-small`, `--color-text-muted`).
- **Reference preview window** (`RefPreviewWindow`, classes `ref-preview`, `ref-preview-head`, `ref-preview-title`, `ref-preview-hint`, `ref-preview-body`, `ref-preview-canvas`, `ref-preview-details`, in `src/theme/refPreview.css`): a non-modal floating window with a header (title `{page} › {item}`, a **Go to the page** `Button` and a **Close** `IconButton`), a canvas area holding `.preview-host` and the Details in the "Read-only" state, reusing `.review-details`/`.review-panel`. Tokens: `--space-*`, `--z-popover`, `--color-surface`, `--color-border`, `--radius-md`, `--shadow-popup`, `--t-text-heading`, `--t-text-small`, `--color-focus`. No new icon or token. Keyboard: Esc closes and focus returns to the opener.

## Sincronização

To be filled at the closing of the epic: the PG2 items above go to the **Mapping** artifact.

## Ficou sem gravar

To be filled at the closing: everything above is still unwritten.
