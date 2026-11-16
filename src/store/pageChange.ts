import { projectIndex, type Project } from '../model';

// Where an undo or redo happened (stage #883, PG2, decision 12): undo and redo never switch the
// open page, so when the whole change is on another page the status bar says which one
// ("Undone on <page>"). Pure: compares the two snapshots item by item.

/** What the history entry touched besides the items: any of these changed means "not just a page". */
const GLOBAL_KEYS = [
  'layers',
  'specializations',
  'platformRepos',
  'docRepos',
  'drawingMode',
  'direction',
] as const;

function samePageList(a: Project, b: Project): boolean {
  return (
    a.pages === b.pages ||
    (a.pages.length === b.pages.length &&
      a.pages.every((g, i) => g.id === b.pages[i]?.id && g.name === b.pages[i]?.name))
  );
}

/** Adds the page of `id` in each project to `into` (an item that moved page touches both). */
function addPagesOf(
  into: Set<string>,
  id: string,
  ...pages: readonly (ReadonlyMap<string, string> | undefined)[]
): void {
  for (const map of pages) {
    const page = map?.get(id);
    if (page !== undefined) into.add(page);
  }
}

/** The pages with an item that is new, gone or different between `from` and `to`. */
function touchedPages(from: Project, to: Project): ReadonlySet<string> {
  const before = projectIndex(from);
  const after = projectIndex(to);
  const touched = new Set<string>();
  const compare = <T extends { readonly id: string }>(
    was: readonly T[],
    now: readonly T[],
    owner: (item: T) => string,
  ): void => {
    const known = new Map(was.map((item) => [item.id, item]));
    for (const item of now) {
      if (known.get(item.id) !== item) {
        addPagesOf(touched, owner(item), before.pageOf, after.pageOf);
      }
      known.delete(item.id);
    }
    for (const gone of known.values()) {
      addPagesOf(touched, owner(gone), before.pageOf, after.pageOf);
    }
  };
  compare(from.containers, to.containers, (c) => c.id);
  compare(from.markings, to.markings, (m) => m.id);
  compare(from.arrows, to.arrows, (a) => a.id);
  compare(from.annotations, to.annotations, (a) => a.markingId);
  return touched;
}

/**
 * The name of the page where the change `from` → `to` happened, or `null` when there is nothing
 * to tell: the change touches the open page, the page list or something that is not an item
 * (layers, specializations…), or nothing at all. With several pages, the first in order.
 */
export function pageOfChange(
  from: Project,
  to: Project,
  openPage: string,
): string | null {
  // A single page has nowhere else to tell about: no index to build for the common case.
  if (from.pages.length < 2 && to.pages.length < 2) return null;
  if (!samePageList(from, to)) return null;
  if (GLOBAL_KEYS.some((key) => from[key] !== to[key])) return null;
  const touched = touchedPages(from, to);
  if (touched.size === 0 || touched.has(openPage)) return null;
  return to.pages.find((g) => touched.has(g.id))?.name ?? null;
}
