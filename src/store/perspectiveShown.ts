import { computed, type ReadonlySignal } from '@preact/signals';
import { perspectiveView, type Perspective, type Project } from '../model';
import type { ProjectStore } from './history';
import { openPerspectiveIn } from './perspectives';

// The project in view of a perspective (stage #659, PE2, decision 3): whoever draws or lists reads
// `perspectiveView`, memoized by project and perspective object, so nothing here depends on the
// viewport (pan and zoom do not recompute).

/** `p` as the open perspective (`id`) shows it; Main (`null`) or an id without a perspective is `p` itself. */
export function projectInPerspective(p: Project, id: string | null): Project;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
): Project | null;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
): Project | null {
  return p && id !== null ? perspectiveView(p, openPerspectiveIn(p, id)) : p;
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
