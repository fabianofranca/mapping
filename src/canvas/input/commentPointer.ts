// The Comment button click, the click on the thread pin and the canvas context menu with the
// Comment and Comment here items (Comments stage, CM4, decisions 24 and 25). Outside `PointerInput`
// so that it does not grow: functions that read the editor state and write only to the UI state.
import {
  threadSubject,
  type MarkingVisibility,
  type Project,
  type Rect,
  type Thread,
} from '../../model';
import { t } from '../../i18n';
import type { EditorDerived } from '../../store/derived';
import { activatePin, cancelComment, placeComment } from '../../store/threadUi';
import type { CanvasMenu, EditorUi } from '../../store/ui';
import type { PinPlace } from '../commentPins';
import type { Point } from '../viewport';
import { commentAnchorAt, pointAnchorAt, type ArrowHit, type HitItem } from './intents';

/** The threads of a pin, in the order of the loaded threads. */
export function pinThreads(derived: EditorDerived, pin: PinPlace): readonly Thread[] {
  const ids = new Set(pin.group.threadIds);
  return derived.threads.entries
    .peek()
    .map((entry) => entry.thread)
    .filter((thread) => ids.has(thread.id));
}

/** The pin's hint (on hover): the thread's subject, or the count when there are several. */
export function pinTitle(derived: EditorDerived, pin: PinPlace): string {
  const threads = pinThreads(derived, pin);
  const [first] = threads;
  if (threads.length !== 1 || !first) {
    return t('comments.pin.many', { count: String(pin.group.count) });
  }
  return threadSubject(first);
}

export interface CommentTap {
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  readonly project: Project | null;
  /** Read-only or review: commenting is not possible. */
  readonly blocked: boolean;
  readonly visibility: ReadonlyMap<string, MarkingVisibility>;
  readonly arrows: ArrowHit;
  readonly titles: ReadonlyMap<string, Rect> | undefined;
  readonly pin: PinPlace | null;
}

/** The armed Comment click: opens the draft on the item or point (or disarms, if blocked). */
function placeAt(tap: CommentTap, c: Point): void {
  const { ui, project } = tap;
  if (!project || tap.blocked) {
    cancelComment(ui);
    return;
  }
  placeComment(
    ui,
    project,
    commentAnchorAt(project, tap.visibility, c, tap.arrows, tap.titles),
  );
}

/**
 * The click at `c` (canvas) in Comment mode or on a pin. Armed: opens the draft (decision 25);
 * on a pin: selects the item and opens the thread or the list (decision 24). `true` if it consumed the
 * click.
 */
export function tapComment(tap: CommentTap, c: Point): boolean {
  if (tap.ui.commentArm.peek() !== null) {
    placeAt(tap, c);
    return true;
  }
  if (!tap.pin || !tap.project) return false;
  activatePin(tap.ui, tap.project, pinThreads(tap.derived, tap.pin));
  return true;
}

/**
 * The canvas context menu (right button): the item under the cursor, its Comment and, in an empty
 * place or inside a container, Comment here. With no project and no item, there is no menu.
 */
export function canvasMenuAt(
  project: Project | null,
  picked: HitItem | null,
  c: Point,
  at: { readonly x: number; readonly y: number },
): CanvasMenu | null {
  const here =
    project && (!picked || picked.kind === 'image') ? pointAnchorAt(project, c) : null;
  if (!picked) return here ? { ...at, target: null, comment: null, here } : null;
  return {
    ...at,
    target: {
      kind: picked.kind === 'image' ? 'i' : picked.kind === 'arrow' ? 'arrow' : 'm',
      id: picked.id,
    },
    comment: { kind: picked.kind === 'image' ? 'container' : picked.kind, id: picked.id },
    here,
  };
}
