import { fail } from './errors';
import type { Marking, Project, ProjectContainer } from './types';

/**
 * Do the two markings live in the same space (v21)? A container is a space of its own; the canvas
 * is one space **per page**: two canvas markings on different pages are in different spaces.
 */
export function sameSpace(
  a: Pick<Marking, 'containerId' | 'pageId'>,
  b: Pick<Marking, 'containerId' | 'pageId'>,
): boolean {
  if (a.containerId !== b.containerId) return false;
  return a.containerId !== null || a.pageId === b.pageId;
}

/** The page with this id (`not-found` if it does not exist). */
export function requirePage(p: Project, pageId: string): void {
  if (!p.pages.some((g) => g.id === pageId)) fail('not-found', pageId);
}

/** The first page: where whatever has no page of its own goes. */
export function firstPageId(p: Project): string {
  const first = p.pages[0];
  if (!first) fail('not-found', 'pages');
  return first.id;
}

/** The containers of one page (all of them when `pageId` is `undefined`). */
export function containersOfPage(
  p: Project,
  pageId: string | undefined,
): readonly ProjectContainer[] {
  return pageId === undefined
    ? p.containers
    : p.containers.filter((c) => c.pageId === pageId);
}
