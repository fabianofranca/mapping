import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { destinationPages, movableRoots, moveRootsToPage } from './movePage';

// "Move to page ›" of the right-click menu (stage #883, PG2, decision 11): a submenu with the OTHER
// pages. The target is the roots among the menu's items (a selection moves as a group; what is not a
// root is ignored). With a single page the item is disabled and says there is no other page. The
// opening and the keys follow the "Send to perspective" submenu: hover or → opens, ← closes, and on
// the right edge the submenu flips to the left.

/** The roots the menu would move, or `[]` (the item is then absent). */
export function useMovableRoots(ids: readonly string[]): readonly string[] {
  const { store } = useEditor();
  const project = store.committed.value;
  return project === null ? [] : movableRoots(project, ids);
}

/** The disabled item, with the hint under it (`aria-describedby`). */
function EmptyItem() {
  const hintId = useId();
  return (
    <div class="menu-items menu-items-group">
      <Button role="menuitem" disabled aria-describedby={hintId}>
        {t('page.move.menu')}
      </Button>
      <span id={hintId} class="menu-hint">
        {t('page.move.menuEmpty')}
      </span>
    </div>
  );
}

interface SubmenuProps {
  readonly roots: readonly string[];
  readonly close: () => void;
  readonly flip: boolean;
  readonly innerRef: { current: HTMLDivElement | null };
}

function Submenu({ roots, close, flip, innerRef }: SubmenuProps) {
  const editor = useEditor();
  const project = editor.store.committed.value;
  if (project === null) return null;
  return (
    <div
      class={flip ? 'popover menu-submenu menu-submenu-left' : 'popover menu-submenu'}
      data-submenu
      role="menu"
      aria-label={t('page.move.menu')}
      ref={innerRef}
    >
      <div class="menu-items">
        {destinationPages(project, roots).map((page) => (
          <Button
            key={page.id}
            role="menuitem"
            onClick={() => {
              close();
              moveRootsToPage(editor, roots, page.id);
            }}
          >
            <span class="menu-item-name">{page.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function MovePageMenuItems({
  ids,
  close,
}: {
  readonly ids: readonly string[];
  readonly close: () => void;
}) {
  const { store } = useEditor();
  const roots = useMovableRoots(ids);
  const [expanded, setExpanded] = useState(false);
  const [flip, setFlip] = useState(false);
  const parent = useRef<HTMLButtonElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  // Opened by the pointer: focus stays where it is (opening on hover does not steal focus).
  const byPointer = useRef(false);
  const openedByHover = useRef(false);
  const wasExpanded = useRef(false);

  // With no room on the right, the submenu opens to the left of the parent item.
  useLayoutEffect(() => {
    if (!expanded) {
      setFlip(false);
      return;
    }
    const box = sub.current?.getBoundingClientRect();
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    if (box && box.right > width) setFlip(true);
  }, [expanded]);

  // Opening by key takes focus to the first page; closing returns it to the parent item.
  useEffect(() => {
    if (byPointer.current) {
      byPointer.current = false;
    } else if (expanded) {
      sub.current
        ?.querySelector<HTMLElement>('button:not(:disabled)')
        ?.focus({ preventScroll: true });
    } else if (wasExpanded.current) {
      parent.current?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded]);

  const project = store.committed.value;
  if (project === null || roots.length === 0) return null;
  if (project.pages.length < 2) return <EmptyItem />;
  const locked = store.locked.value;

  const onKeyDown = (e: KeyboardEvent) => {
    const inSub = sub.current?.contains(e.target as Node) ?? false;
    if (e.key === 'ArrowRight' && e.target === parent.current && !locked) {
      e.preventDefault();
      setExpanded(true);
    } else if (e.key === 'ArrowLeft' && inSub) {
      e.preventDefault();
      openedByHover.current = false;
      setExpanded(false);
    }
  };
  const hoverOpen = () => {
    if (locked || expanded) return;
    byPointer.current = true;
    openedByHover.current = true;
    setExpanded(true);
  };
  const hoverLeave = () => {
    if (!openedByHover.current || !expanded) return;
    byPointer.current = true;
    openedByHover.current = false;
    setExpanded(false);
  };
  const onParentClick = () => {
    if (openedByHover.current) {
      openedByHover.current = false;
      return;
    }
    setExpanded((open) => !open);
  };

  return (
    <div class="menu-items menu-items-group" onKeyDown={onKeyDown}>
      <div class="menu-sub-host" onPointerEnter={hoverOpen} onPointerLeave={hoverLeave}>
        <Button
          role="menuitem"
          buttonRef={parent}
          aria-haspopup="menu"
          aria-expanded={expanded}
          disabled={locked}
          onClick={onParentClick}
        >
          {t('page.move.menu')}
          <Icon name="chevronRight" />
        </Button>
        {expanded && !locked && (
          <Submenu roots={roots} close={close} flip={flip} innerRef={sub} />
        )}
      </div>
    </div>
  );
}
