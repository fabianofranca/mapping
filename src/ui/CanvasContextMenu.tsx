import { useLayoutEffect, useRef } from 'preact/hooks';
import { captureFocusOrigin, restoreFocusAfterRender, type FocusOrigin } from './focus';
import { t } from '../i18n';
import { canCopyItems, type ItemCopyTarget } from '../app/itemClipboard';
import { wrapAvailable } from '../app/wrapSelection';
import {
  ARROW_STYLES,
  canEditArrow,
  projectIndex,
  type ArrowStyle,
  type ThreadAnchor,
} from '../model';
import { arrangeMarking, canArrangeMarking } from './arrange';
import { CiteItem } from './CiteMenuItems';
import { CopyMenuItems } from './CopyActions';
import { Button } from './controls';
import { useEditor } from './EditorContext';
import { Icon } from './icons';
import { createOpenScrollGuard } from './openScrollGuard';
import { placeComment } from '../store/threadUi';
import { peekSelectedItems, isItemSelected } from '../store/ui';
import {
  blockedOutsideMain,
  PerspectiveMenuItems,
  PrincipalOnlyItem,
  rootsOf,
} from './PerspectiveMenuItems';

/**
  * ↓/↑ move focus among the enabled items of the menu (or of the submenu, if focus is in it), in a
  * loop. → and ← of the submenu belong to `PerspectiveMenuItems`.
 */
function moveFocus(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const current = e.target as HTMLElement;
  const submenu = current.closest<HTMLElement>('[data-submenu]');
  const scope = submenu ?? (e.currentTarget as HTMLElement);
  const items = [
    ...scope.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'),
  ].filter((b) => !b.disabled && (submenu !== null || !b.closest('[data-submenu]')));
  const at = items.indexOf(current as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const step = e.key === 'ArrowDown' ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
}

/** Minimum gap between the menu and the browser window's edge. */
const EDGE = 8;

const ARROW_STYLE_LABELS: Readonly<
  Record<
    ArrowStyle,
    'arrow.canvasMenu.straight' | 'arrow.canvasMenu.curve' | 'arrow.canvasMenu.elbow'
  >
> = {
  straight: 'arrow.canvasMenu.straight',
  curve: 'arrow.canvasMenu.curve',
  elbow: 'arrow.canvasMenu.elbow',
};

/**
  * Items of an arrow's menu (ME4): the stroke style (Straight, Curve, Elbow; the current one
  * checked) and Delete. Each choice is a history entry. When locked (or the project read-only), the
  * items are disabled.
 */
function ArrowMenuItems({
  arrowId,
  close,
}: {
  readonly arrowId: string;
  readonly close: () => void;
}) {
  const { actions, store, review } = useEditor();
  const project = review.derived.shownProject.value;
  const arrow = project ? projectIndex(project).arrows.get(arrowId) : undefined;
  if (!project || !arrow) return null;
  const editable = !store.locked.value && canEditArrow(project, arrowId);
  return (
    <div class="menu-items">
      {ARROW_STYLES.map((style) => (
        <Button
          key={style}
          role="menuitemradio"
          aria-checked={arrow.style === style}
          disabled={!editable}
          onClick={() => {
            close();
            actions.setArrowStyle(arrowId, style);
          }}
        >
          {arrow.style === style && <Icon name="check" />}
          {t(ARROW_STYLE_LABELS[style])}
        </Button>
      ))}
      <CiteItem target={{ kind: 'arrow', id: arrowId }} close={close} />
      <Button
        role="menuitem"
        variant="danger"
        disabled={!editable}
        onClick={() => {
          close();
          actions.removeArrow(arrowId);
        }}
      >
        {t('arrow.canvasMenu.delete')}
      </Button>
    </div>
  );
}

/**
  * Comment (item under the cursor) and Comment here (empty place of a container or the canvas),
  * decision 25: they open the thread's draft; nothing is saved before Send. Read-only: disabled.
 */
function CommentMenuItems({
  comment,
  here,
  close,
}: {
  readonly comment: ThreadAnchor | null;
  readonly here: ThreadAnchor | null;
  readonly close: () => void;
}) {
  const { ui, store, review, session } = useEditor();
  const project = review.derived.shownProject.value;
  if (!project) return null;
  const openId = session.perspective.id.value;
  const items: readonly (readonly [ThreadAnchor | null, string])[] = [
    [comment, t('comments.comment')],
    [here, t('comments.here')],
  ];
  return (
    <div class="menu-items">
      {items.map(([anchor, label]) =>
        anchor === null ? null : (
          <PrincipalOnlyItem
            key={label}
            // The draft of a canvas point shows outside Main, but the final pin does not.
            blocked={
              anchor.kind === 'point' &&
              anchor.containerId === null &&
              blockedOutsideMain(project, openId, 'draw-canvas')
            }
            disabled={store.locked.value}
            onClick={() => {
              close();
              placeComment(ui, project, anchor);
            }}
          >
            {label}
          </PrincipalOnlyItem>
        ),
      )}
    </div>
  );
}

/**
  * Canvas context menu (right mouse button): copy the reference and the crop, Wrap (Ctrl/Cmd+G) the
  * item under the cursor, which the right click selects; on an arrow, the style and Delete. Opened
  * by `ui.canvasMenu`; closes with Esc, a click outside, scrolling or on choosing an item.
 */
export function CanvasContextMenu() {
  const editor = useEditor();
  const { ui } = editor;
  const menu = ui.canvasMenu.value;
  const panel = useRef<HTMLDivElement>(null);
  // Who had focus before the menu opened (there is no trigger: it opens by right click) and the
  // open panel: on closing (Esc, choice, click outside), the focus that was in the menu returns
  // there instead of falling on `body` (stage 8, F6).
  const origin = useRef<FocusOrigin | null>(null);
  const shown = useRef<HTMLElement | null>(null);
  const close = () => {
    ui.canvasMenu.value = null;
  };

  // Anchors at the cursor, without leaving the window.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!menu || !el) {
      if (origin.current && shown.current) {
        restoreFocusAfterRender(shown.current, origin.current, { current: undefined });
      }
      origin.current = null;
      shown.current = null;
      return;
    }
    origin.current ??= captureFocusOrigin();
    shown.current = el;
    const width = globalThis.innerWidth || document.documentElement.clientWidth;
    const height = globalThis.innerHeight || document.documentElement.clientHeight;
    el.style.left = `${Math.max(EDGE, Math.min(menu.x, width - el.offsetWidth - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(menu.y, height - el.offsetHeight - EDGE))}px`;
    el.querySelector<HTMLElement>('button')?.focus();
  }, [menu]);

  // In a layout effect: the listeners enter together with the menu, with no gap for a click
  // outside.
  useLayoutEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    // The scrolling that the opening itself causes does not count (openScrollGuard).
    const scrollCloses = createOpenScrollGuard(() => panel.current);
    const onScroll = (e: Event) => {
      if (scrollCloses(e)) close();
    };
    document.addEventListener('scroll', onScroll, true);
    globalThis.addEventListener('resize', close);
    globalThis.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      globalThis.removeEventListener('resize', close);
      globalThis.removeEventListener('blur', close);
    };
    // `close` only writes to a stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const copyable = canCopyItems(editor);
  const target = menu?.target;
  const arrowId = target?.kind === 'arrow' ? target.id : null;
  const copyTarget: ItemCopyTarget | null =
    target && target.kind !== 'arrow' ? { kind: target.kind, id: target.id } : null;
  const arrangeId =
    target?.kind === 'm' &&
    !editor.store.locked.value &&
    canArrangeMarking(editor, target.id)
      ? target.id
      : null;
  const selectable = target?.kind === 'm';
  // Marking and image (container) always have Wrap, with or without a folder (`WrapMenuItem`
  // vanishes by itself when it does not exist: read-only, review).
  const wrappable = copyTarget !== null && wrapAvailable(editor);
  // The target's items (the selection, if the item under the cursor is in it): Send uses each one's
  // root.
  const picked = peekSelectedItems(ui);
  const perspectiveIds: readonly string[] =
    copyTarget === null
      ? []
      : isItemSelected(picked, {
            kind: copyTarget.kind === 'i' ? 'image' : 'marking',
            id: copyTarget.id,
          })
        ? picked.map((item) => item.id)
        : [copyTarget.id];
  const openId = editor.session.perspective.id.value;
  const real = editor.store.committed.value;
  // Delete of a root only applies in Main: outside it, it shows disabled, with the hint.
  const deleteBlocked =
    real !== null &&
    perspectiveIds.length > 0 &&
    blockedOutsideMain(real, openId, 'delete', rootsOf(real, perspectiveIds));
  const comment = menu?.comment ?? null;
  const here = menu?.here ?? null;
  const commentable = comment !== null || here !== null;
  if (
    !menu ||
    !(
      // Cite in the thread applies to every item, with or without a folder.
      copyTarget !== null ||
      copyable ||
      arrangeId !== null ||
      selectable ||
      arrowId !== null ||
      wrappable ||
      commentable
    )
  ) {
    return null;
  }
  return (
    <div
      class="popover"
      role="menu"
      aria-label={t('copy.canvasMenu')}
      ref={panel}
      onKeyDown={moveFocus}
      onContextMenu={(e) => e.preventDefault()}
    >
      {copyTarget && (
        <CopyMenuItems
          target={copyTarget}
          close={close}
          copyable={copyable}
          commentable={false}
        />
      )}
      {arrowId !== null && <ArrowMenuItems arrowId={arrowId} close={close} />}
      {commentable && <CommentMenuItems comment={comment} here={here} close={close} />}
      {perspectiveIds.length > 0 && (
        <PerspectiveMenuItems ids={perspectiveIds} close={close} />
      )}
      {arrangeId !== null && (
        <div class="menu-items">
          <PrincipalOnlyItem
            blocked={real !== null && blockedOutsideMain(real, openId, 'arrange')}
            onClick={() => {
              close();
              arrangeMarking(editor, arrangeId);
            }}
          >
            {t('arrange.action')}
          </PrincipalOnlyItem>
        </div>
      )}
      {deleteBlocked && (
        <div class="menu-items menu-items-group">
          <PrincipalOnlyItem blocked variant="danger" onClick={close}>
            {t('common.delete')}
          </PrincipalOnlyItem>
        </div>
      )}
    </div>
  );
}
