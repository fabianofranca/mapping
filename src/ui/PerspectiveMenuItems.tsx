import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { projectIndex, type Project } from '../model';
import { principalOnly, type PrincipalOnlyCommand } from '../store/perspectiveGestures';
import { showToast } from '../store/ui';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { perspectiveRows, type PerspectiveRow } from './perspectiveRows';

// Right-click menu items tied to perspectives (stage #659, PE3): Send to perspective
// (submenu of checkboxes), Remove from this perspective, and the hint for commands that only
// apply on Main. The target is always the ROOT of the item under the cursor (or of each
// selected item).

/** The distinct roots of the items (`ids`), in the order they appear; ids without a root drop out. */
export function rootsOf(project: Project, ids: readonly string[]): readonly string[] {
  const { rootOf } = projectIndex(project);
  const roots = new Set<string>();
  for (const id of ids) {
    const root = rootOf.get(id);
    if (root !== undefined) roots.add(root);
  }
  return [...roots];
}

/**
 * Does the command only apply on Main while a perspective is open? The interface disables it
 * and shows `PrincipalOnlyHint` (decision 5).
 */
export function blockedOutsideMain(
  project: Project,
  openId: string | null,
  command: PrincipalOnlyCommand,
  targets: readonly string[] = [],
): boolean {
  return principalOnly(project, openId, command, targets);
}

/** The "Main only" hint under the disabled item; the item cites it through `aria-describedby`. */
export function PrincipalOnlyHint({ id }: { readonly id: string }) {
  return (
    <span id={id} class="menu-hint">
      {t('perspective.principalOnly')}
    </span>
  );
}

/** Um item de menu que pode estar bloqueado fora da Principal (com a dica sob ele). */
export function PrincipalOnlyItem({
  blocked,
  disabled = false,
  variant,
  onClick,
  children,
}: {
  readonly blocked: boolean;
  readonly disabled?: boolean;
  readonly variant?: 'danger';
  readonly onClick: () => void;
  readonly children: string;
}) {
  const hintId = useId();
  return (
    <>
      <Button
        role="menuitem"
        variant={variant}
        disabled={blocked || disabled}
        aria-describedby={blocked ? hintId : undefined}
        onClick={onClick}
      >
        {children}
      </Button>
      {blocked && <PrincipalOnlyHint id={hintId} />}
    </>
  );
}

/**
 * "Send to perspective ›" and "Remove from this perspective". `ids` are the items (container
 * or marking) of the menu target; the actions use each one's root. Checking a box sends,
 * unchecking removes; Main and the open one stay checked and locked. → opens the submenu and
 * ← closes it.
 */
export function PerspectiveMenuItems({
  ids,
  close,
}: {
  readonly ids: readonly string[];
  readonly close: () => void;
}) {
  const { store, session, ui } = useEditor();
  const [expanded, setExpanded] = useState(false);
  const parent = useRef<HTMLButtonElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const project = store.committed.value;
  const openId = session.perspective.id.value;
  const localIds = session.perspective.localIds.value;
  const wasExpanded = useRef(false);
  // Opened by the pointer: focus stays where it is (opening on hover does not steal focus).
  const byPointer = useRef(false);
  const [flip, setFlip] = useState(false);
  // Opened by hover only: the first click on the parent item confirms (does not close).
  const openedByHover = useRef(false);

  // With no room on the right, the submenu opens to the left of the parent item (staying in the window).
  useLayoutEffect(() => {
    if (!expanded) {
      setFlip(false);
      return;
    }
    const box = sub.current?.getBoundingClientRect();
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    if (box && box.right > width) setFlip(true);
  }, [expanded]);

  // Opening takes focus to the first enabled checkbox; closing returns it to the parent item.
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

  // With no perspective, there is nowhere to send to and nowhere to remove from.
  if (!project || project.perspectives.length === 0) return null;
  const roots = rootsOf(project, ids);
  if (roots.length === 0) return null;
  const locked = store.locked.value;
  const actions = session.perspectiveActions;
  const fail = () => showToast(ui, t('perspective.error'));
  const toggle = (row: PerspectiveRow) => {
    if (!row.perspective) return;
    const result = row.checked
      ? actions.removeRootsFromPerspective(row.perspective.id, roots)
      : actions.sendRootsToPerspective(row.perspective.id, roots);
    if (!result.ok) fail();
  };
  const hoverOpen = () => {
    if (locked || expanded) return;
    byPointer.current = true;
    openedByHover.current = true;
    setExpanded(true);
  };
  const onParentClick = () => {
    if (openedByHover.current) {
      openedByHover.current = false;
      return;
    }
    setExpanded((open) => !open);
  };
  const hoverClose = () => {
    if (!expanded) return;
    byPointer.current = true;
    openedByHover.current = false;
    setExpanded(false);
  };
  // Sair do item (e do submenu, que fica dentro dele) fecha o que o hover abriu; aberto por
  // clique ou tecla, o submenu fica.
  const hoverLeave = () => {
    if (openedByHover.current) hoverClose();
  };
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
          {t('perspective.menu.send')}
          <Icon name="chevronRight" />
        </Button>
        {expanded && !locked && (
          <div
            class={
              flip ? 'popover menu-submenu menu-submenu-left' : 'popover menu-submenu'
            }
            data-submenu
            role="menu"
            aria-label={t('perspective.menu.send')}
            ref={sub}
          >
            <div class="menu-items">
              <div class="menu-heading">{t('perspective.menu.sendHeading')}</div>
              {perspectiveRows(project, openId, localIds, roots, true).map((row) => (
                <Button
                  key={row.perspective?.id ?? 'main'}
                  role="menuitemcheckbox"
                  aria-checked={row.checked}
                  disabled={row.locked}
                  onClick={() => toggle(row)}
                >
                  {row.checked ? <Icon name="check" /> : <span class="menu-check-slot" />}
                  {row.perspective?.name ?? t('perspective.principal')}
                  {row.note !== null && <span class="menu-note">{row.note}</span>}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      {openId !== null && (
        <Button
          role="menuitem"
          disabled={locked}
          onPointerEnter={hoverClose}
          onClick={() => {
            close();
            if (!actions.removeRootsFromPerspective(openId, roots).ok) fail();
          }}
        >
          {t('perspective.menu.remove')}
        </Button>
      )}
    </div>
  );
}
