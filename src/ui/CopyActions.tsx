import { t } from '../i18n';
import { selectionWithContents, type ItemRef, type ThreadAnchor } from '../model';
import { selectItems } from '../store/ui';
import { SHORTCUT_LABELS, ariaKeys } from '../app/shortcuts';
import {
  canWrapNow,
  currentWrapItems,
  wrapAvailable,
  wrapItemsNow,
} from '../app/wrapSelection';
import {
  canCopyCrop,
  canCopyItems,
  copyCrop,
  copyReference,
  type ItemCopyTarget,
} from '../app/itemClipboard';
import { CiteItem, CommentItem } from './CiteMenuItems';
import { useEditor } from './EditorContext';
import { Button, IconButton } from './controls';
import { keepFocusAfterAction } from './focus';
import { Popover } from './Popover';

// "Copy reference" and "Copy crop" in the interface: buttons in Details and in the annotation
// card (`CopyButtons`), the ⋯ menu of the Tree row (`ItemMenu`) and the canvas menu
// (`CanvasContextMenu`). They only appear in projects opened from a folder, which the MCP reaches.

/** Buttons beside the ID: copy the reference and, on markings, the crop. */
export function CopyButtons({ target }: { readonly target: ItemCopyTarget }) {
  const editor = useEditor();
  if (!canCopyItems(editor)) return null;
  return (
    <>
      <IconButton
        icon="link"
        label={t('copy.reference')}
        shortcut={target.kind === 'a' ? undefined : SHORTCUT_LABELS.copyReference}
        onClick={() => void copyReference(editor, target)}
      />
      {target.kind === 'm' &&
        canCopyCrop(editor.review.derived.shownProject.value, target.id) && (
          <IconButton
            icon="crop"
            label={t('copy.crop')}
            shortcut={SHORTCUT_LABELS.copyCrop}
            onClick={() => void copyCrop(editor, target.id)}
          />
        )}
    </>
  );
}

/** "Select with contents": the marking and everything it covers. Only for markings. */
export function SelectContentsItem({
  markingId,
  close,
}: {
  readonly markingId: string;
  readonly close: () => void;
}) {
  const { ui, review } = useEditor();
  return (
    <Button
      role="menuitem"
      onClick={() => {
        close();
        const project = review.derived.shownProject.peek();
        if (project && project.markings.some((m) => m.id === markingId)) {
          selectItems(ui, selectionWithContents(project, markingId));
        }
      }}
    >
      {t('multi.selectWithContents')}
    </Button>
  );
}

/**
 * "Wrap": the current selection or, if the menu's row/target is outside it, just that item
 * (`currentWrapItems`). Disabled, with the hint, when nothing fits (note, arrow); hidden in
 * read-only and in review. Shows the Ctrl/Cmd+G shortcut.
 */
export function WrapMenuItem({
  target,
  close,
}: {
  readonly target: ItemCopyTarget;
  readonly close: () => void;
}) {
  const editor = useEditor();
  if (target.kind === 'a' || !wrapAvailable(editor)) return null;
  const row: ItemRef = { kind: target.kind === 'i' ? 'image' : 'marking', id: target.id };
  const enabled = canWrapNow(editor, currentWrapItems(editor, row));
  return (
    <Button
      role="menuitem"
      disabled={!enabled}
      title={enabled ? undefined : t('multi.wrapBlocked')}
      aria-keyshortcuts={ariaKeys(SHORTCUT_LABELS.wrap)}
      onClick={() => {
        close();
        wrapItemsNow(editor, currentWrapItems(editor, row));
      }}
    >
      {t('multi.wrap')}
      <kbd class="kbd menu-shortcut" aria-hidden="true">
        {SHORTCUT_LABELS.wrap}
      </kbd>
    </Button>
  );
}

/** The thread anchor of an item (marking, container or annotation). */
function anchorOf(target: ItemCopyTarget): ThreadAnchor {
  const kind =
    target.kind === 'm' ? 'marking' : target.kind === 'i' ? 'container' : 'annotation';
  return { kind, id: target.id };
}

/**
 * Menu items (buttons) of an image, marking or annotation item: copy, Cite in the
 * thread, Comment, select and Wrap. `close` closes the menu.
 */
export function CopyMenuItems({
  target,
  close,
  copyable = true,
  commentable = true,
}: {
  readonly target: ItemCopyTarget;
  readonly close: () => void;
  /** False when there is nothing to copy (project outside a folder): only the other entries. */
  readonly copyable?: boolean;
  /** False when the menu already has its own Comment (the canvas's, which knows the click point). */
  readonly commentable?: boolean;
}) {
  const editor = useEditor();
  const selectable = target.kind === 'm';
  return (
    <div class="menu-items">
      {copyable && (
        <>
          <Button
            role="menuitem"
            onClick={() => {
              close();
              void copyReference(editor, target);
            }}
          >
            {t('copy.reference')}
          </Button>
          {target.kind === 'm' &&
            canCopyCrop(editor.review.derived.shownProject.value, target.id) && (
              <Button
                role="menuitem"
                onClick={() => {
                  close();
                  void copyCrop(editor, target.id);
                }}
              >
                {t('copy.crop')}
              </Button>
            )}
        </>
      )}
      <CiteItem target={target} close={close} />
      {commentable && <CommentItem anchor={anchorOf(target)} close={close} />}
      {selectable && <SelectContentsItem markingId={target.id} close={close} />}
      <WrapMenuItem target={target} close={close} />
    </div>
  );
}

/** ⋯ menu of a Tree row (fixed popover: the window's scroll does not clip it). */
export function ItemMenu({
  target,
  name,
}: {
  readonly target: ItemCopyTarget;
  readonly name: string;
}) {
  const editor = useEditor();
  const copyable = canCopyItems(editor);
  const label = t('copy.itemActions', { name });
  return (
    <Popover
      class="tree-menu"
      role="menu"
      align="end"
      label={label}
      trigger={({ open, toggle }) => (
        <IconButton
          icon="moreVertical"
          label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        />
      )}
    >
      {(close) => (
        <CopyMenuItems
          target={target}
          close={() => {
            // Closing returns focus to the ⋯; the action that follows may move the row.
            close();
            keepFocusAfterAction(null);
          }}
          copyable={copyable}
        />
      )}
    </Popover>
  );
}
