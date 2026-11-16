import {
  perspectiveView,
  projectIndex,
  type CitationTarget,
  type Project,
  type ThreadAnchor,
} from '../model';
import type { ProjectStore } from './history';
import type { PageState } from './pages';
import type { PerspectiveState } from './perspectives';

// Going to an item (stage #883, PG2, decision 12): the item may be on another page, or on a page
// that the open perspective does not show. `revealItem` opens what is needed so that the item is
// in the project in view, and only then the caller selects it and frames it (selection and
// framing are the interface's: `ui.selection`, `canvas.centerSelection()`).

/** What `revealItem` needs of the session. */
export interface RevealSession {
  readonly store: Pick<ProjectStore, 'committed'>;
  readonly page: Pick<PageState, 'open' | 'openId'>;
  readonly perspective: Pick<PerspectiveState, 'open' | 'openId' | 'notice'>;
}

export interface RevealOutcome {
  /** The item exists in the project. When `false`, nothing changed. */
  readonly found: boolean;
  /** Its page was not the open one and was opened. */
  readonly pageChanged: boolean;
  /** The open perspective did not show it on that page, so the Completa was opened (with the `outside` notice). */
  readonly perspectiveChanged: boolean;
}

const NOT_FOUND: RevealOutcome = {
  found: false,
  pageChanged: false,
  perspectiveChanged: false,
};

/** Does the open perspective show the item on its page (container, marking or arrow)? */
function shownByPerspective(
  p: Project,
  perspectiveId: string,
  pageId: string,
  itemId: string,
): boolean {
  const perspective = p.perspectives.find((x) => x.id === perspectiveId);
  if (perspective === undefined) return true;
  const index = projectIndex(perspectiveView(p, perspective, pageId));
  return (
    index.containers.has(itemId) || index.markings.has(itemId) || index.arrows.has(itemId)
  );
}

/**
 * Opens the page of the item (a container, marking or arrow id) and, if the open perspective does not
 * show it there, the Completa, leaving the `outside` notice with the perspective's name. Nothing
 * else changes: the caller selects and frames. An unknown id changes nothing. With the review
 * locking the perspective, only the page switches.
 */
export function revealItem(session: RevealSession, itemId: string): RevealOutcome {
  const p = session.store.committed.peek();
  if (p === null) return NOT_FOUND;
  const pageId = projectIndex(p).pageOf.get(itemId);
  if (pageId === undefined) return NOT_FOUND;
  const pageChanged = pageId !== session.page.openId();
  if (pageChanged && !session.page.open(pageId)) return NOT_FOUND;
  const openId = session.perspective.openId();
  if (openId === null || shownByPerspective(p, openId, pageId, itemId)) {
    return { found: true, pageChanged, perspectiveChanged: false };
  }
  const name = p.perspectives.find((x) => x.id === openId)?.name ?? '';
  const perspectiveChanged = session.perspective.open(null);
  if (perspectiveChanged) session.perspective.notice.value = { kind: 'outside', name };
  return { found: true, pageChanged, perspectiveChanged };
}

/** `revealItem` for an annotation: it goes to the page of the marking or arrow that owns it. */
export function revealAnnotation(
  session: RevealSession,
  annotationId: string,
): RevealOutcome {
  const p = session.store.committed.peek();
  const owner = p === null ? undefined : projectIndex(p).annotations.get(annotationId);
  return owner === undefined ? NOT_FOUND : revealItem(session, owner.markingId);
}

/** What a conversation anchor or a citation points at. */
export type RevealTarget = ThreadAnchor | CitationTarget;

/**
 * `revealItem` for whatever an anchor or a citation points at: an item (marking, container, arrow),
 * an annotation or one of its parts (field, pair, row), or a point inside a container. A layer, a
 * conversation, a proposal and a canvas point have no page of their own: nothing changes.
 */
export function revealTarget(
  session: RevealSession,
  target: RevealTarget,
): RevealOutcome {
  switch (target.kind) {
    case 'marking':
    case 'container':
    case 'arrow':
      return revealItem(session, target.id);
    case 'annotation':
      return revealAnnotation(session, target.id);
    case 'field':
    case 'entry':
    case 'row':
      return revealAnnotation(session, target.annotationId);
    case 'point':
      return target.containerId === null
        ? NOT_FOUND
        : revealItem(session, target.containerId);
    default:
      return NOT_FOUND;
  }
}
