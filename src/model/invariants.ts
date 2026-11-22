import {
  MIN_STORED_MARKING_SIZE,
  containsRect,
  containsRectApprox,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
} from './geometry';
import { isValidDensity } from './density';
import { sameSpace } from './spaces';
import { tableRows } from './refs';
import type { Arrow, Entry, Marking, Perspective, Project, Rect } from './types';

export type InvariantCode =
  | 'duplicate-id'
  | 'duplicate-file'
  | 'container-content'
  | 'container-density'
  | 'images-overlap'
  | 'missing-image'
  | 'missing-parent'
  | 'missing-marking'
  | 'missing-layer'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'parent-other-image'
  | 'rect-outside-parent'
  | 'hierarchy-cycle'
  | 'container-parent-missing'
  | 'container-parent-not-canvas'
  | 'container-outside-parent'
  | 'floating-in-container'
  | 'parent-floating'
  | 'arrow-endpoint-missing'
  | 'arrow-self'
  | 'anchor-missing'
  | 'anchor-self'
  | 'anchor-cycle'
  | 'anchor-other-space'
  | 'pages-empty'
  | 'page-duplicate-name'
  | 'page-missing'
  | 'page-required'
  | 'page-parent-mismatch'
  | 'arrow-cross-page'
  | 'missing-parent-annotation'
  | 'annotation-parent-other-marking'
  | 'annotation-parent-same-layer'
  | 'annotation-cycle'
  | 'empty-role'
  | 'role-without-owner'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-spec-file'
  | 'duplicate-entry-id'
  | 'duplicate-row-id'
  | 'perspective-root-missing'
  | 'perspective-root-not-root'
  | 'perspective-root-duplicate'
  | 'perspective-layer-missing'
  | 'perspective-duplicate-name'
  | 'arrival-root-missing'
  | 'arrival-root-not-root'
  | 'arrival-duplicate';

/** Kind of the item with the problem. */
export type InvariantEntity =
  | 'image'
  | 'marking'
  | 'arrow'
  | 'annotation'
  | 'layer'
  | 'spec'
  | 'perspective'
  | 'arrival'
  | 'page';

export interface InvariantIssue {
  readonly code: InvariantCode;
  readonly entity: InvariantEntity;
  /** Id of the item with the problem. */
  readonly id: string;
  /** Name of the item, when there is one (for an unlabeled image, the file). */
  readonly name?: string;
  /** Id of the other item involved, when there is one (e.g. the overlapping image). */
  readonly otherId?: string;
}

/** What `validateProject` reads from each item to identify the problem. */
interface Named {
  readonly id: string;
  readonly name?: string | null;
  readonly file?: string | null;
}

/** Name for the problem list: an unlabeled image's is the file; a specialization has none. */
function itemName(entity: InvariantEntity, item: Named): string | null {
  if (entity === 'spec') return null;
  if (entity === 'image') return item.name ?? item.file ?? null;
  return item.name ?? null;
}

export type EntryIssue = 'empty-key' | 'duplicate-key' | null;

/** Error of each entry, in the same order as `entries`. Also used by the editor (inline error). */
export function validateEntries<T extends Pick<Entry, 'key'>>(
  entries: readonly T[],
): EntryIssue[] {
  const seen = new Set<string>();
  return entries.map(({ key }) => {
    const trimmed = key.trim();
    if (trimmed === '') return 'empty-key';
    if (seen.has(trimmed)) return 'duplicate-key';
    seen.add(trimmed);
    return null;
  });
}

/** Perspective name for comparison: without surrounding spaces and ignoring case. */
export function perspectiveNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Page name for comparison (v21): the same rule as the perspective's. */
export const pageNameKey = perspectiveNameKey;

/**
 * Pages (v21): at least one, unique ids (`duplicate-id`) and unique names (`page-duplicate-name`,
 * `otherId` = the first page with that name). Without a page the project is reported once, on the
 * project itself (`pages-empty`, entity `page`, `id` = the project's).
 */
function validatePages(p: Project, page: Report): void {
  if (p.pages.length === 0) page('pages-empty', { id: p.project.id });
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const g of p.pages) {
    if (ids.has(g.id)) page('duplicate-id', g);
    ids.add(g.id);
    const first = names.get(pageNameKey(g.name));
    if (first !== undefined) page('page-duplicate-name', g, first);
    else names.set(pageNameKey(g.name), g.id);
  }
}

/**
 * The page of each canvas item (v21): a container's own, a canvas marking's own, a container
 * marking's through its container. `undefined` = unknown (the container does not exist).
 */
function pageOfMarking(
  m: Marking,
  containers: ReadonlyMap<string, { readonly pageId: string }>,
): string | null | undefined {
  return m.containerId === null ? m.pageId : containers.get(m.containerId)?.pageId;
}

/**
 * Project roots (v16): the container without a parent and the floating or canvas marking without
 * a parent. Only these appear in a perspective (`items`) or in an arrival (`arrivals`).
 */
function rootIds(p: Project): { all: ReadonlySet<string>; roots: ReadonlySet<string> } {
  const all = new Set<string>();
  const roots = new Set<string>();
  for (const c of p.containers) {
    all.add(c.id);
    if (c.parentId === null) roots.add(c.id);
  }
  for (const m of p.markings) {
    all.add(m.id);
    if (m.floating || (m.containerId === null && m.parentId === null)) roots.add(m.id);
  }
  return { all, roots };
}

/** Code of the invalid root (nonexistent or not a root), or `null` if the root is fine. */
function rootProblem(
  root: string,
  ids: ReturnType<typeof rootIds>,
): 'missing' | 'not-root' | null {
  if (!ids.all.has(root)) return 'missing';
  return ids.roots.has(root) ? null : 'not-root';
}

/** Size class of a rectangle: the smallest `e` with `2^e >= max(1, width, height)`. */
function sizeClass(r: Rect): number {
  const size = Math.max(1, r.width, r.height);
  let e = Math.ceil(Math.log2(size));
  while (2 ** e < size) e++;
  return e;
}

/** The cell range (at most 2 per axis, since the rectangle fits in a cell of its own class or a larger one) of class `e` that `r` touches. */
function cellsOf(r: Rect, e: number): [number, number, number, number] {
  const cell = 2 ** e;
  return [
    Math.floor(r.x / cell),
    Math.floor((r.x + r.width) / cell),
    Math.floor(r.y / cell),
    Math.floor((r.y + r.height) / cell),
  ];
}

/** The indices in the cells of `grid` (class `e`) that `r` touches. */
function* candidatesIn(
  grid: Map<string, number[]> | undefined,
  r: Rect,
  e: number,
): Generator<number> {
  if (!grid) return;
  const [x0, x1, y0, y1] = cellsOf(r, e);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) yield* grid.get(`${x},${y}`) ?? [];
  }
}

type SizeGrids = Map<number, Map<string, number[]>>;

/** One grid per size class, each rectangle in the cells of its own class (buckets grow with `push`). */
function gridsBySize(rects: Rect[], classOf: number[]): SizeGrids {
  const grids: SizeGrids = new Map();
  rects.forEach((r, i) => {
    if (!Number.isFinite(r.x + r.y + r.width + r.height)) return;
    const e = sizeClass(r);
    classOf[i] = e;
    const grid = grids.get(e) ?? new Map<string, number[]>();
    grids.set(e, grid);
    const [x0, x1, y0, y1] = cellsOf(r, e);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  });
  return grids;
}

/**
 * For each container (by index), the later indices, ascending, whose canvas rectangle overlaps
 * it (containers on different pages never do). One grid per size class: a rectangle goes into
 * the cells (at most 4) of the class with the smallest power-of-two cell that holds it, and looks
 * for overlaps in its own class and in every larger one (at most 4 cells per class), so a pair is
 * found from the smaller rectangle's side and one large container among many small ones does not
 * put them all in the same cell. It grows linearly with scattered containers; what stays quadratic
 * is many containers stacked on the same spot (they share every cell). No global maximum.
 */
function overlappingContainers(containers: Project['containers']): number[][] {
  // Each page is its own canvas (v21): containers on different pages never overlap.
  const rects = containers.map((c) => imageCanvasRect(c, c.placement));
  const pages = containers.map((c) => c.pageId);
  const found = rects.map(() => new Set<number>());
  const classOf: number[] = [];
  const grids = gridsBySize(rects, classOf);
  const present = [...grids.keys()].sort((a, b) => a - b);
  const markFrom = (i: number, own: number): void => {
    const r = rects[i] as Rect;
    for (const e of present) {
      if (e < own) continue;
      for (const j of candidatesIn(grids.get(e), r, e)) {
        // Same class: each pair is seen from both sides, keep one; a larger class is only seen from here.
        if (j === i || (e === own && j < i)) continue;
        if (pages[j] === pages[i] && rectsOverlap(rects[j] as Rect, r))
          found[Math.min(i, j)]?.add(Math.max(i, j));
      }
    }
  };
  classOf.forEach((own, i) => markFrom(i, own));
  return found.map((set) => [...set].sort((a, b) => a - b));
}

type Report = (code: InvariantCode, item: Named, otherId?: string) => void;

/** Hidden layers and items (an existing root, that is a root and without repeats) of a perspective. */
function validatePerspectiveContent(
  x: Perspective,
  layerIds: ReadonlySet<string>,
  ids: ReturnType<typeof rootIds>,
  report: Report,
): void {
  for (const layerId of x.hiddenLayers) {
    if (!layerIds.has(layerId)) report('perspective-layer-missing', x, layerId);
  }
  const seen = new Set<string>();
  for (const { root } of x.items) {
    const problem = rootProblem(root, ids);
    if (problem !== null) report(`perspective-root-${problem}`, x, root);
    else if (seen.has(root)) report('perspective-root-duplicate', x, root);
    seen.add(root);
  }
}

/** The arrival points to an existing root, and each root has at most one. */
function validateArrivals(
  p: Project,
  ids: ReturnType<typeof rootIds>,
  report: Report,
): void {
  const arrived = new Set<string>();
  for (const a of p.arrivals) {
    const named = { id: a.root, name: a.fromName };
    const problem = rootProblem(a.root, ids);
    if (problem !== null) report(`arrival-root-${problem}`, named);
    else if (arrived.has(a.root)) report('arrival-duplicate', named);
    arrived.add(a.root);
  }
}

/**
 * Invariants of the perspectives and arrivals (v16). The item with the problem is the
 * perspective (its id and name) with the root or layer in `otherId`; the arrival is identified
 * by the root (`id`). Maps and sets: no lookups inside loops.
 */
function validatePerspectives(p: Project, perspective: Report, arrival: Report): void {
  const ids = rootIds(p);
  const layerIds = new Set(p.layers.map((l) => l.id));
  const perspectiveIds = new Set<string>();
  const names = new Map<string, string>();
  for (const x of p.perspectives) {
    if (perspectiveIds.has(x.id)) perspective('duplicate-id', x);
    perspectiveIds.add(x.id);
    const key = perspectiveNameKey(x.name);
    const first = names.get(key);
    if (first !== undefined) perspective('perspective-duplicate-name', x, first);
    else names.set(key, x.id);
    validatePerspectiveContent(x, layerIds, ids, perspective);
  }
  validateArrivals(p, ids, arrival);
}

/** The marking's page: unknown/missing page, required and absent, or present where it must not be. */
function validateMarkingPage(
  m: Marking,
  pageIds: ReadonlySet<string>,
  report: Report,
): void {
  if (m.containerId !== null) {
    // A container marking has no page of its own: its page is the container's.
    if (m.pageId !== null) report('page-required', m, m.pageId);
  } else if (m.pageId === null) report('page-required', m);
  else if (!pageIds.has(m.pageId)) report('page-missing', m, m.pageId);
}

/** The ends of an arrow are always on the same page (`arrow-cross-page`). */
function validateArrowPage(
  a: Arrow,
  markings: ReadonlyMap<string, Marking>,
  containers: ReadonlyMap<string, { readonly pageId: string }>,
  report: Report,
): void {
  const from = markings.get(a.from);
  const to = markings.get(a.to);
  if (!from || !to) return;
  const fromPage = pageOfMarking(from, containers);
  const toPage = pageOfMarking(to, containers);
  if (fromPage !== undefined && toPage !== undefined && fromPage !== toPage) {
    report('arrow-cross-page', a, a.to);
  }
}

/**
 * Anchors (v20): the target exists, is not the marking itself, is in the same space (the same
 * container, or both on the canvas) and the anchor chain does not close a cycle. The cycle is
 * reported on each marking whose chain reaches back to itself; one that only enters a cycle is
 * not reported.
 */
function validateAnchors(
  p: Project,
  markings: ReadonlyMap<string, Marking>,
  report: Report,
): void {
  for (const m of p.markings) {
    const to = m.anchor?.to;
    if (to === undefined) continue;
    const target = markings.get(to);
    if (target === undefined) report('anchor-missing', m, to);
    else if (to === m.id) report('anchor-self', m, to);
    else if (!sameSpace(target, m)) report('anchor-other-space', m, to);
    else if (anchorChainReturns(markings, m.id)) report('anchor-cycle', m, to);
  }
}

/** Following `anchor.to` from `start`, the chain returns to `start` (without hanging on another cycle). */
function anchorChainReturns(
  markings: ReadonlyMap<string, Marking>,
  start: string,
): boolean {
  const seen = new Set<string>();
  let next = markings.get(start)?.anchor?.to;
  while (next !== undefined && !seen.has(next)) {
    if (next === start) return true;
    seen.add(next);
    next = markings.get(next)?.anchor?.to;
  }
  return false;
}

/** Every container is on exactly one page of the list: `page-required` (empty) or `page-missing` (not on the list). */
function validateContainerPages(
  p: Project,
  pageIds: ReadonlySet<string>,
  imageIssue: Report,
): void {
  for (const image of p.containers) {
    if (image.pageId === '') imageIssue('page-required', image);
    else if (!pageIds.has(image.pageId)) imageIssue('page-missing', image, image.pageId);
  }
}

/**
 * Checks the invariants that the zod schema does not express. Empty list = valid project.
 * See docs/FORMAT.md, "Validity rules". The arrow (v13) has its own:
 * `arrow-endpoint-missing` (an end that is not an existing marking) and `arrow-self`. The
 * specialization rules (layer × type, `allowedChildren`, references) do not block opening: they
 * become pending items (`getAnnotationIssues`). Only the uniqueness of entry and row ids stays
 * here.
 */
export function validateProject(p: Project): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  // Entity and name are only built when there is a problem: the happy path pays nothing.
  const issue =
    (entity: InvariantEntity) => (code: InvariantCode, item: Named, otherId?: string) => {
      const name = itemName(entity, item);
      issues.push({
        code,
        entity,
        id: item.id,
        ...(name === null ? {} : { name }),
        ...(otherId === undefined ? {} : { otherId }),
      });
    };
  const spec = issue('spec');
  const layer = issue('layer');
  const imageIssue = issue('image');
  const marking = issue('marking');
  const arrow = issue('arrow');
  const annotation = issue('annotation');

  validatePerspectives(p, issue('perspective'), issue('arrival'));
  validatePages(p, issue('page'));

  const lists = [
    [p.specializations, spec],
    [p.layers, layer],
    [p.containers, imageIssue],
    [p.markings, marking],
    [p.annotations, annotation],
  ] as const;
  for (const [list, push] of lists) {
    const ids = new Set<string>();
    for (const item of list) {
      if (ids.has(item.id)) push('duplicate-id', item);
      ids.add(item.id);
    }
  }

  // Markings and arrows share the id space (an annotation points to either): the arrow that
  // repeats the id of a marking, or of another arrow, is the duplicate.
  const ownerIds = new Set(p.markings.map((m) => m.id));
  for (const a of p.arrows) {
    if (ownerIds.has(a.id)) arrow('duplicate-id', a);
    ownerIds.add(a.id);
  }

  const specFiles = new Set<string>();
  for (const s of p.specializations) {
    if (specFiles.has(s.file)) spec('duplicate-spec-file', s);
    specFiles.add(s.file);
  }

  const entryIds = new Set<string>();
  for (const a of p.annotations) {
    for (const e of a.entries) {
      if (entryIds.has(e.id)) annotation('duplicate-entry-id', a, e.id);
      entryIds.add(e.id);
    }
    for (const value of Object.values(a.values ?? {})) {
      const rowIds = new Set<string>();
      for (const row of tableRows(value)) {
        if (rowIds.has(row._id)) annotation('duplicate-row-id', a, row._id);
        rowIds.add(row._id);
      }
    }
  }

  const files = new Set<string>();
  const overlaps = overlappingContainers(p.containers);
  const pageIds = new Set(p.pages.map((g) => g.id));
  validateContainerPages(p, pageIds, imageIssue);
  p.containers.forEach((image, i) => {
    // A container without a file does not compete for a name; color and file are mutually exclusive.
    if (image.file !== null) {
      if (files.has(image.file)) imageIssue('duplicate-file', image);
      files.add(image.file);
    }
    if ((image.file === null) !== (image.background !== null)) {
      imageIssue('container-content', image);
    }
    if (image.density != null && !isValidDensity(image.density)) {
      imageIssue('container-density', image);
    }
    for (const j of overlaps[i] ?? [])
      imageIssue('images-overlap', image, p.containers[j]?.id ?? '');
  });

  const containers = new Map(p.containers.map((image) => [image.id, image]));
  const markings = new Map(p.markings.map((m) => [m.id, m]));
  const annotations = new Map(p.annotations.map((a) => [a.id, a]));

  for (const m of p.markings) {
    // Canvas marking (v13): null `containerId`, `rect` in canvas units, no bounds.
    const image = m.containerId === null ? undefined : containers.get(m.containerId);
    if (m.containerId !== null && !image) marking('missing-image', m, m.containerId);
    validateMarkingPage(m, pageIds, marking);
    if (!isIntegerRect(m.rect)) marking('rect-not-integer', m);
    if (
      m.rect.width < MIN_STORED_MARKING_SIZE ||
      m.rect.height < MIN_STORED_MARKING_SIZE
    ) {
      marking('rect-too-small', m);
    }
    if (image && !containsRect(imagePixelRect(image), m.rect)) {
      marking('rect-out-of-image', m);
    }
    // The floating one lives on the canvas, outside the containment tree.
    if (m.floating && (m.containerId !== null || m.parentId !== null)) {
      marking('floating-in-container', m);
    }
    if (m.parentId === null) continue;
    const parent = markings.get(m.parentId);
    if (!parent) {
      marking('missing-parent', m, m.parentId);
      continue;
    }
    if (parent.floating) marking('parent-floating', m, parent.id);
    else if (parent.containerId !== m.containerId)
      marking('parent-other-image', m, parent.id);
    else if (m.containerId === null && parent.pageId !== m.pageId)
      marking('page-parent-mismatch', m, parent.id);
    else if (!containsRect(parent.rect, m.rect))
      marking('rect-outside-parent', m, parent.id);
  }

  // Arrow (v13): connects two existing, different markings (neither another arrow nor a container).
  for (const a of p.arrows) {
    if (!markings.has(a.from)) arrow('arrow-endpoint-missing', a, a.from);
    if (!markings.has(a.to)) arrow('arrow-endpoint-missing', a, a.to);
    if (a.from === a.to) arrow('arrow-self', a, a.from);
    validateArrowPage(a, markings, containers, arrow);
  }

  validateAnchors(p, markings, marking);

  // Parent of a container (v13): a canvas marking, not floating, that contains it entirely.
  for (const c of p.containers) {
    if (c.parentId === null) continue;
    const parent = markings.get(c.parentId);
    if (!parent) imageIssue('container-parent-missing', c, c.parentId);
    else if (parent.containerId !== null || parent.floating) {
      imageIssue('container-parent-not-canvas', c, parent.id);
    } else if (parent.pageId !== c.pageId) {
      imageIssue('page-parent-mismatch', c, parent.id);
    } else if (!containsRectApprox(parent.rect, imageCanvasRect(c, c.placement))) {
      imageIssue('container-outside-parent', c, parent.id);
    }
  }

  for (const m of p.markings) {
    // Walks up the parent chain; if it passes through an already seen id again, there is a cycle.
    const visited = new Set<string>([m.id]);
    let parentId = m.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        marking('hierarchy-cycle', m);
        break;
      }
      visited.add(parentId);
      parentId = markings.get(parentId)?.parentId ?? null;
    }
  }

  const layerIds = new Set(p.layers.map((l) => l.id));
  for (const a of p.annotations) {
    // The annotation's owner is a marking or an arrow (v13).
    if (!ownerIds.has(a.markingId)) annotation('missing-marking', a, a.markingId);
    if (!layerIds.has(a.layerId)) annotation('missing-layer', a, a.layerId);
    for (const entryIssue of validateEntries(a.entries)) {
      if (entryIssue) annotation(entryIssue, a);
    }
    if (a.parentRole === '') annotation('empty-role', a);
    if (a.parentAnnotationId === null) {
      if (a.parentRole !== null) annotation('role-without-owner', a);
      continue;
    }
    const owner = annotations.get(a.parentAnnotationId);
    if (!owner) {
      annotation('missing-parent-annotation', a, a.parentAnnotationId);
      continue;
    }
    if (owner.markingId !== a.markingId) {
      annotation('annotation-parent-other-marking', a, owner.id);
    }
    // Only the free one: a typed one whose owner the type's layer does not accept is the `owner-not-allowed` pending item.
    if (owner.layerId === a.layerId && a.type === null)
      annotation('annotation-parent-same-layer', a, owner.id);
  }

  for (const a of p.annotations) {
    // The same cycle detection used in the marking hierarchy.
    const visited = new Set<string>([a.id]);
    let ownerId = a.parentAnnotationId;
    while (ownerId !== null) {
      if (visited.has(ownerId)) {
        annotation('annotation-cycle', a);
        break;
      }
      visited.add(ownerId);
      ownerId = annotations.get(ownerId)?.parentAnnotationId ?? null;
    }
  }

  return issues;
}
