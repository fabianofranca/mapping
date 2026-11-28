import { canContain, equalRectRanks, pickParent, type Entry } from './settleParent';
import type { Marking, Project } from './types';

// The creation rule (stage #3087, decision 7): a materialized marking that is created without an explicit
// parent, or that becomes materialized, takes once the parent the geometry gives at that moment: the smallest
// non-floating, non-decorative marking of its space that fully contains it, **of either nature**. After that
// the parent is stored and no geometry changes it. This is the rule up to schema 26, which only the nature
// of the candidates distinguishes from the settle's own (an observation marking only looks among observation
// markings). Pure.

/** The key of the space a marking lives in: its container, or the canvas of its page. */
const spaceKeyOf = (m: Pick<Marking, 'containerId' | 'pageId'>): string =>
  m.containerId ?? `\u0000canvas:${m.pageId ?? ''}`;

/**
 * The parent the geometry gives each of `ids` now. A floating marking has none; a marking whose
 * space holds no larger or earlier one that contains it has none (`null`). Same tie rules as the settle
 * (`pickParent`): of the candidates of least area, the current parent if it is one of them, else the innermost.
 */
export function creationParents(
  p: Project,
  ids: Iterable<string>,
): Map<string, string | null> {
  const wanted = new Set(ids);
  const out = new Map<string, string | null>();
  if (wanted.size === 0) return out;
  // Only the spaces that hold a wanted marking are read.
  const spaces = new Set<string>();
  for (const m of p.markings)
    if (wanted.has(m.id) && !m.floating) spaces.add(spaceKeyOf(m));
  const groups = new Map<string, Entry[]>();
  p.markings.forEach((m, i) => {
    if (m.floating) return;
    const key = spaceKeyOf(m);
    if (!spaces.has(key)) return;
    const group = groups.get(key);
    if (group) group.push({ m, i });
    else groups.set(key, [{ m, i }]);
  });
  for (const group of groups.values()) {
    const ranks = new Map<string, number>();
    equalRectRanks(group, ranks);
    const rankOf = (id: string): number => ranks.get(id) ?? -1;
    for (const e of group) {
      if (!wanted.has(e.m.id)) continue;
      const own = rankOf(e.m.id);
      const candidates = group.filter(
        (c) => !c.m.decorative && canContain(c.m.rect, rankOf(c.m.id), e.m.rect, own),
      );
      out.set(e.m.id, pickParent(candidates, e.m.parentId, rankOf));
    }
  }
  for (const id of wanted) if (!out.has(id)) out.set(id, null);
  return out;
}

/** The parent the geometry gives the marking now (`creationParents` of one). */
export function creationParent(p: Project, markingId: string): string | null {
  return creationParents(p, [markingId]).get(markingId) ?? null;
}
