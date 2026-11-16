import { useId } from 'preact/hooks';
import { t } from '../i18n';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { MenuPopover } from './MenuPopover';
import { destinationPages, movableRoots, moveRootsToPage } from './movePage';

// "Move to page" in the Details of a root (stage #883, PG2, decision 11): a menu with the OTHER pages,
// the same store action and refusal as the right-click menu. It only exists for a root (a container
// with no parent or a canvas marking); with a single page the button is disabled and says why.

export function MovePageControl({
  itemId,
  readOnly,
}: {
  readonly itemId: string;
  readonly readOnly: boolean;
}) {
  const editor = useEditor();
  const hintId = useId();
  const project = editor.store.committed.value;
  if (project === null || movableRoots(project, [itemId]).length === 0) return null;
  const label = t('page.move.menu');
  const pages = destinationPages(project, [itemId]);
  if (readOnly || project.pages.length < 2) {
    const empty = project.pages.length < 2;
    return (
      <div class="row page-move-row">
        <Button disabled aria-describedby={empty ? hintId : undefined}>
          {label}
        </Button>
        {empty && (
          <span id={hintId} class="muted page-move-hint">
            {t('page.move.menuEmpty')}
          </span>
        )}
      </div>
    );
  }
  return (
    <div class="row page-move-row">
      <MenuPopover label={label} buttonLabel={label} class="menu-popover-control">
        {pages.map((page) => (
          <Button
            key={page.id}
            role="menuitem"
            onClick={() => moveRootsToPage(editor, [itemId], page.id)}
          >
            <span class="menu-item-name">{page.name}</span>
          </Button>
        ))}
      </MenuPopover>
    </div>
  );
}
