import { computed, type ReadonlySignal } from '@preact/signals';
import {
  perspectiveContentCount,
  perspectiveView,
  type Perspective,
  type Project,
} from '../model';
import type { ProjectStore } from './history';
import { openPerspectiveIn } from './perspectives';

// The project in view (stage #659, PE2, decision 3; stage #883, PG2, decision 16): the open page
// cuts the project first (`pageView`, each page is a canvas of its own) and the open perspective cuts
// what is left (`perspectiveView`). Whoever draws or lists reads it, memoized by project, page and
// perspective object, so nothing here depends on the viewport (pan and zoom do not recompute).

/**
 * `p` as the open page and perspective show it. `pageId` cuts the project down to that page first;
 * without it (editor tests) the whole project counts. Main (`null`) or an id without a perspective
 * is the page itself (`p` itself without a page).
 */
export function projectInPerspective(
  p: Project,
  id: string | null,
  pageId?: string,
): Project;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
  pageId?: string,
): Project | null;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
  pageId?: string,
): Project | null {
  if (p === null) return null;
  // A project with a single page is that page: no cut, and the same object as the project.
  const page = pageId !== undefined && p.pages.length === 1 ? undefined : pageId;
  if (id === null && page === undefined) return p;
  return perspectiveView(p, id === null ? null : openPerspectiveIn(p, id), page);
}

/** How many roots (containers and canvas markings) the perspective shows on the page. */
export function perspectiveRootsOnPage(
  p: Project,
  perspective: Perspective,
  pageId: string,
): number {
  const { containers, markings } = perspectiveContentCount(p, perspective, pageId);
  return containers + markings;
}

/** No open perspective: the default for whoever does not know perspectives (editor tests). */
export const NO_PERSPECTIVE: ReadonlySignal<Perspective | null> = computed(() => null);

/**
 * The open perspective of the confirmed project (`null` = Main). The same object while the
 * perspective does not change: whoever depends on it only recomputes when it really changes.
 */
export function createOpenPerspective(
  store: ProjectStore,
  id: ReadonlySignal<string | null>,
): ReadonlySignal<Perspective | null> {
  return computed(() => {
    const project = store.committed.value;
    return project ? openPerspectiveIn(project, id.value) : null;
  });
}
