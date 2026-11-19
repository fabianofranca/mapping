// Pages (v21, stage #883): operations on `Project.pages` and the page of each item. Every root
// (container without a parent, canvas marking without a parent, floating) lives on exactly one
// page, and each page is a canvas of its own: coordinates, containment and free-spot searches
// never look at another page. Pure functions, no browser API.
import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { IMAGE_GAP } from './containers';
import { fail, type PageAnchorCrossing, type PageArrowCrossing } from './errors';
import { boundingBox, right } from './geometry';
import { settleFrom, type SettleOptions } from './hierarchySettle';
import { pageNameKey } from './invariants';
import { canEditImagePlacement, canEditMarkingGeometry, requireUnlocked } from './locks';
import { releasedAnchors } from './anchorRelease';
import { DEFAULT_PAGE_NAME } from './migrations';
import { perspectiveView, rootFootprint } from './perspective';
import { findById, moveItem, updateById } from './project';
import { idInUse, projectIndex } from './projectIndex';
import { firstPageId, requirePage } from './spaces';
import type { Arrow, Page, Perspective, Project, Rect } from './types';

export { DEFAULT_PAGE_NAME, pageNameKey, firstPageId, requirePage };
export type { PageAnchorCrossing, PageArrowCrossing };

/** The page of a container, marking or arrow (`null` if the id does not exist or has none). */
export function pageOfItem(p: Project, id: string): string | null {
  return projectIndex(p).pageOf.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// The list of pages

/** The name of a page: trimmed, not empty (`page-name-empty`), not taken by another one (`page-name-taken`). */
function checkedPageName(p: Project, name: string, selfId: string | null): string {
  const trimmed = name.trim();
  if (trimmed === '') fail('page-name-empty');
  const key = pageNameKey(trimmed);
  if (p.pages.some((g) => g.id !== selfId && pageNameKey(g.name) === key)) {
    fail('page-name-taken', trimmed);
  }
  return trimmed;
}

/** Adds a page at the end of the list. A page id repeated fails with `duplicate-id`. */
export function createPage(
  p: Project,
  args: { readonly id: string; readonly name: string },
): Project {
  if (p.pages.some((g) => g.id === args.id) || idInUse(p, args.id)) {
    fail('duplicate-id', args.id);
  }
  const page: Page = { id: args.id, name: checkedPageName(p, args.name, null) };
  return { ...p, pages: [...p.pages, page] };
}

/** Renames the page. The current name is not a change: it returns `p` as is. */
export function renamePage(p: Project, pageId: string, name: string): Project {
  const current = findById(p.pages, pageId);
  const checked = checkedPageName(p, name, pageId);
  if (checked === current.name) return p;
  return { ...p, pages: updateById(p.pages, pageId, (g) => ({ ...g, name: checked })) };
}

/** Moves the page to position `toIndex` (the display order of the tabs). */
export function movePage(p: Project, pageId: string, toIndex: number): Project {
  const from = p.pages.indexOf(findById(p.pages, pageId));
  if (from === toIndex) return p;
  return { ...p, pages: moveItem(p.pages, from, toIndex) };
}

// ---------------------------------------------------------------------------
// What a page holds

export interface PageContent {
  /** Roots of the page: containers with no parent, canvas markings with no parent and floating ones. */
  readonly roots: number;
  readonly containers: number;
  /** Every marking of the page, those inside its containers included. */
  readonly markings: number;
  readonly arrows: number;
  /** Annotations of the markings and arrows of the page. */
  readonly annotations: number;
}

/** What is on the page (the counts the delete dialog shows). A page that does not exist is `not-found`. */
export function pageContent(p: Project, pageId: string): PageContent {
  requirePage(p, pageId);
  const index = projectIndex(p);
  const onPage = (id: string) => index.pageOf.get(id) === pageId;
  const markings = p.markings.filter((m) => onPage(m.id));
  const arrows = p.arrows.filter((a) => onPage(a.id));
  const annotations = [...markings, ...arrows].reduce(
    (sum, item) => sum + (index.annotationsByMarking.get(item.id)?.length ?? 0),
    0,
  );
  return {
    roots: index.rootsByPage.get(pageId)?.length ?? 0,
    containers: p.containers.filter((c) => c.pageId === pageId).length,
    markings: markings.length,
    arrows: arrows.length,
    annotations,
  };
}

// ---------------------------------------------------------------------------
// Moving roots between pages

/** The offset, in whole units, that takes `box` to the right of `content` (at its top); to the origin if empty. */
function offsetBeside(box: Rect, content: readonly Rect[]): { dx: number; dy: number } {
  const wantedX = content.length === 0 ? 0 : Math.max(...content.map(right)) + IMAGE_GAP;
  const wantedY = content.length === 0 ? 0 : Math.min(...content.map((r) => r.y));
  // `|| 0` turns -0 into 0.
  return {
    dx: Math.ceil(wantedX - box.x) || 0,
    dy: Math.round(wantedY - box.y) || 0,
  };
}

function footprints(p: Project, ids: Iterable<string>): Rect[] {
  const rects: Rect[] = [];
  for (const id of ids) {
    const rect = rootFootprint(p, id);
    if (rect) rects.push(rect);
  }
  return rects;
}

/** The arrows with one end inside the group and the other outside it. */
function crossingArrows(
  p: Project,
  markingIds: ReadonlySet<string>,
): readonly PageArrowCrossing[] {
  const out: PageArrowCrossing[] = [];
  for (const a of p.arrows) {
    if (markingIds.has(a.from) !== markingIds.has(a.to)) {
      out.push({ id: a.id, from: a.from, to: a.to });
    }
  }
  return out;
}

/** The anchors with one end inside the group and the other outside it (the anchored marking or its target leaves alone). */
function crossingAnchors(
  p: Project,
  markingIds: ReadonlySet<string>,
): readonly PageAnchorCrossing[] {
  const out: PageAnchorCrossing[] = [];
  for (const m of p.markings) {
    const to = m.anchor?.to;
    if (to !== undefined && markingIds.has(m.id) !== markingIds.has(to)) {
      out.push({ marking: m.id, to });
    }
  }
  return out;
}

/** The waypoints of an arrow inside the group follow it when they are in canvas units. */
function shiftedArrow(
  p: Project,
  arrow: Arrow,
  d: { readonly dx: number; readonly dy: number },
): Arrow {
  if (arrow.points.length === 0) return arrow;
  const { markings } = projectIndex(p);
  const from = markings.get(arrow.from);
  const to = markings.get(arrow.to);
  // Points in container pixels (both ends in the same container) move along with it.
  if (from?.containerId != null && from.containerId === to?.containerId) return arrow;
  return {
    ...arrow,
    points: arrow.points.map((pt) => ({ x: pt.x + d.dx, y: pt.y + d.dy })),
  };
}

/**
 * The perspectives that show a moved root put it back to the right of what they already show on
 * the destination page, at the top of it, keeping the roots' relative positions.
 */
function repositionPerspectives(
  next: Project,
  moving: ReadonlySet<string>,
  pageId: string,
): readonly Perspective[] {
  return next.perspectives.map((perspective) => {
    const moved = perspective.items.filter((item) => moving.has(item.root));
    if (moved.length === 0) return perspective;
    const others = {
      ...perspective,
      items: perspective.items.filter((i) => !moving.has(i.root)),
    };
    const view = perspectiveView(next, others, pageId);
    const shown = footprints(view, projectIndex(view).roots);
    const boxes = moved.flatMap((item) => {
      const size = rootFootprint(next, item.root);
      return size
        ? [{ x: item.x, y: item.y, width: size.width, height: size.height }]
        : [];
    });
    const box = boundingBox(boxes);
    if (box === null) return perspective;
    const d = offsetBeside(box, shown);
    return {
      ...perspective,
      items: perspective.items.map((item) =>
        moving.has(item.root) ? { ...item, x: item.x + d.dx, y: item.y + d.dy } : item,
      ),
    };
  });
}

/**
 * Takes the roots `rootIds` (each with everything that belongs to it: `rootMembers`) to the page
 * `pageId`. The group keeps its relative positions and enters at the right of the destination
 * page's content (right edge of the content + `IMAGE_GAP`), at the top of it, shifted by a whole
 * offset (`ceil` in `x`, `round` in `y`); an empty destination puts it at the origin. The
 * perspectives that have a moved root put it at the right of what they already show on the
 * destination page. Roots already on the page are left alone; an id that is not a root fails with
 * `not-root`, an unknown id or page with `not-found`, a locked root with `locked`. An arrow or an
 * anchor with one end inside the group and one outside is refused (`page-arrow-crossing` when an
 * arrow crosses, `page-anchor-crossing` when only anchors do; `data` always carries `arrows` and
 * `anchors`): nothing is written, because the settle would otherwise release the anchor in
 * silence. Settles once, with the project before as the reference.
 */
export function moveRootsToPage(
  p: Project,
  rootIds: readonly string[],
  pageId: string,
  options?: SettleOptions,
): Project {
  return moveRoots(p, rootIds, pageId, options, false);
}

/** `moveRootsToPage`; `ignoreLocks` is for the delete with a move (the confirmation counts, as for `discard`). */
function moveRoots(
  p: Project,
  rootIds: readonly string[],
  pageId: string,
  options: SettleOptions | undefined,
  ignoreLocks: boolean,
): Project {
  requirePage(p, pageId);
  const index = projectIndex(p);
  const moving = rootsToMove(p, rootIds, pageId, ignoreLocks);
  if (moving.size === 0) return p;
  const group = groupOf(p, moving);
  const arrows = crossingArrows(p, group.markingIds);
  const anchors = crossingAnchors(p, group.markingIds);
  if (arrows.length > 0 || anchors.length > 0) {
    fail(arrows.length > 0 ? 'page-arrow-crossing' : 'page-anchor-crossing', undefined, {
      arrows,
      anchors,
    });
  }

  const box = boundingBox(footprints(p, moving));
  const content = footprints(p, index.rootsByPage.get(pageId) ?? []);
  const d = box === null ? { dx: 0, dy: 0 } : offsetBeside(box, content);
  const next = withGroupOnPage(p, group, pageId, d);
  const withPerspectives = {
    ...next,
    perspectives: repositionPerspectives(next, moving, pageId),
  };
  return settleFrom(p, withPerspectives, options);
}

/** The roots that change page: each has to be a root, exist and be unlocked (unless `ignoreLocks`); the ones already there are left out. */
function rootsToMove(
  p: Project,
  rootIds: readonly string[],
  pageId: string,
  ignoreLocks: boolean,
): Set<string> {
  const index = projectIndex(p);
  for (const id of rootIds) {
    if (!index.rootMembers.has(id)) {
      fail(index.rootOf.has(id) ? 'not-root' : 'not-found', id);
    }
  }
  const moving = new Set(rootIds.filter((id) => index.pageOf.get(id) !== pageId));
  if (ignoreLocks) return moving;
  for (const id of moving) {
    requireUnlocked(
      index.containers.has(id)
        ? canEditImagePlacement(p, id)
        : canEditMarkingGeometry(p, id),
    );
  }
  return moving;
}

interface MovingGroup {
  readonly containerIds: ReadonlySet<string>;
  readonly markingIds: ReadonlySet<string>;
}

/** Everything that belongs to the roots (`rootMembers`): the containers and the markings. */
function groupOf(p: Project, roots: ReadonlySet<string>): MovingGroup {
  const { rootMembers } = projectIndex(p);
  const containerIds = new Set<string>();
  const markingIds = new Set<string>();
  for (const id of roots) {
    const group = rootMembers.get(id);
    for (const c of group?.containers ?? []) containerIds.add(c.id);
    for (const m of group?.markings ?? []) markingIds.add(m.id);
  }
  return { containerIds, markingIds };
}

/** The group on the page `pageId`, shifted by `d` (canvas markings and the group's own arrows follow). */
function withGroupOnPage(
  p: Project,
  group: MovingGroup,
  pageId: string,
  d: { readonly dx: number; readonly dy: number },
): Project {
  const { containerIds, markingIds } = group;
  return {
    ...p,
    containers: p.containers.map((c) =>
      containerIds.has(c.id)
        ? {
            ...c,
            pageId,
            placement: {
              ...c.placement,
              x: c.placement.x + d.dx,
              y: c.placement.y + d.dy,
            },
          }
        : c,
    ),
    markings: p.markings.map((m) =>
      markingIds.has(m.id) && m.containerId === null
        ? { ...m, pageId, rect: { ...m.rect, x: m.rect.x + d.dx, y: m.rect.y + d.dy } }
        : m,
    ),
    arrows: p.arrows.map((a) => (markingIds.has(a.from) ? shiftedArrow(p, a, d) : a)),
  };
}

// ---------------------------------------------------------------------------
// Deleting a page

/** What happens to the content of the deleted page: it goes to another page, or it is discarded with it. */
export type PageDeletion = { readonly moveTo: string } | { readonly discard: true };

/** Everything on the page goes away: containers, their markings, the page's markings and arrows, and the annotations. */
function withoutPageContent(p: Project, pageId: string): Project {
  const { pageOf } = projectIndex(p);
  const onPage = (id: string) => pageOf.get(id) === pageId;
  const markingIds = new Set(p.markings.filter((m) => onPage(m.id)).map((m) => m.id));
  const arrowIds = arrowIdsAttachedTo(p, markingIds);
  for (const a of p.arrows) if (onPage(a.id)) arrowIds.add(a.id);
  return withoutArrows(
    {
      ...p,
      containers: p.containers.filter((c) => c.pageId !== pageId),
      markings: releasedAnchors(p, markingIds).filter((m) => !markingIds.has(m.id)),
      annotations: p.annotations.filter((a) => !markingIds.has(a.markingId)),
    },
    arrowIds,
  );
}

/**
 * Deletes the page. The last page cannot be deleted (`page-last`). The content goes to another
 * page (`moveTo`: every root, as `moveRootsToPage`, and nothing is lost; a locked root goes along,
 * shifted like the others and still locked) or is discarded (`discard`: containers, markings,
 * arrows and annotations of the page go away). A lock does not prevent either: the person confirmed. A single operation: one undo entry, one settle.
 */
export function deletePage(
  p: Project,
  pageId: string,
  how: PageDeletion,
  options?: SettleOptions,
): Project {
  requirePage(p, pageId);
  if (p.pages.length === 1) fail('page-last', pageId);
  const pages = p.pages.filter((g) => g.id !== pageId);
  if ('moveTo' in how) {
    requirePage(p, how.moveTo);
    if (how.moveTo === pageId) fail('not-found', how.moveTo);
    const roots = projectIndex(p).rootsByPage.get(pageId) ?? [];
    const moved = moveRoots(p, roots, how.moveTo, options, true);
    return { ...moved, pages };
  }
  return settleFrom(p, { ...withoutPageContent(p, pageId), pages }, options);
}
