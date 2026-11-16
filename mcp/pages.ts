import { pageNameKey, projectIndex, type Page, type Project } from '../src/model';
import { ToolError } from './errors';

// Pages (v21, stage #883): how the MCP names and finds them. A page is told by `{ id, name }`; the agent
// passes it as the id or the name (case-insensitive, like the app's page names).

type Json = Record<string, unknown>;

/** `{ id, name }` of a page: how every result says "on this page". */
export function pageView(page: Page): Json {
  return { id: page.id, name: page.name };
}

/** The page by id or, failing that, by name (case-insensitive); `page-not-found` lists the pages. */
export function findPage(p: Project, query: string): Page {
  const wanted = query.trim();
  const found =
    p.pages.find((g) => g.id === wanted) ??
    p.pages.find((g) => pageNameKey(g.name) === pageNameKey(wanted));
  if (found) return found;
  throw new ToolError('page-not-found', `page not found: ${query}`, {
    pages: p.pages.map(pageView),
    hint: 'pass the id or the name of a page; see `pages` in get_project',
  });
}

/** `{ id, name }` of the page of an item (container, marking or arrow); `null` if it has none. */
export function pageOfItemView(p: Project, itemId: string): Json | null {
  const pageId = projectIndex(p).pageOf.get(itemId);
  const page = pageId === undefined ? undefined : p.pages.find((g) => g.id === pageId);
  return page ? pageView(page) : null;
}

/** Does the project have more than one page (so that a root needs to say its page)? */
export function hasSeveralPages(p: Project): boolean {
  return p.pages.length > 1;
}
