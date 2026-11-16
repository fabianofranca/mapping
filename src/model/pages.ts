// Pages (v21, stage #883): operations on `Project.pages` and the page of each item. Every root
// (container without a parent, canvas marking without a parent, floating) lives on exactly one
// page, and each page is a canvas of its own: coordinates, containment and free-spot searches
// never look at another page. Pure functions, no browser API.
import { DEFAULT_PAGE_NAME } from './migrations';
import { fail, type PageArrowCrossing } from './errors';
import { pageNameKey } from './invariants';
import { projectIndex } from './projectIndex';
import type { Project } from './types';

export { DEFAULT_PAGE_NAME, pageNameKey };

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

/** The page of a container, marking or arrow (`null` if the id does not exist or has none). */
export function pageOfItem(p: Project, id: string): string | null {
  return projectIndex(p).pageOf.get(id) ?? null;
}

export type { PageArrowCrossing };
