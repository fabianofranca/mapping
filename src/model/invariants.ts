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
import { tableRows } from './refs';
import type { Entry, Marking, Perspective, Project, Rect } from './types';

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
  | 'arrival';

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

/**
 * For each container (by index), the later indices, ascending, whose canvas rectangle overlaps
 * it. Groups by grid cells the size of the largest container (each rectangle falls in up to 4
 * cells) and only compares neighbors: it grows linearly with scattered containers, instead of
 * comparing every pair.
 */
function overlappingContainers(containers: Project['containers']): number[][] {
  const rects = containers.map((c) => imageCanvasRect(c, c.placement));
  const size = Math.max(1, ...rects.map((r) => Math.max(r.width, r.height)));
  const found = rects.map(() => new Set<number>());
  const cells = new Map<string, number[]>();
  const cell = (v: number) => Math.floor(v / size);
  rects.forEach((r, i) => {
    const x1 = cell(r.x + r.width);
    const y1 = cell(r.y + r.height);
    if (!Number.isFinite(x1 + y1 + r.x + r.y)) return;
    for (let x = cell(r.x); x <= x1; x++) {
      for (let y = cell(r.y); y <= y1; y++) {
        const key = `${x},${y}`;
        const bucket = cells.get(key) ?? [];
        for (const j of bucket) if (rectsOverlap(rects[j] as Rect, r)) found[j]?.add(i);
        cells.set(key, [...bucket, i]);
      }
    }
  });
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
    else if (target.containerId !== m.containerId) report('anchor-other-space', m, to);
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
    else if (!containsRect(parent.rect, m.rect))
      marking('rect-outside-parent', m, parent.id);
  }

  // Arrow (v13): connects two existing, different markings (neither another arrow nor a container).
  for (const a of p.arrows) {
    if (!markings.has(a.from)) arrow('arrow-endpoint-missing', a, a.from);
    if (!markings.has(a.to)) arrow('arrow-endpoint-missing', a, a.to);
    if (a.from === a.to) arrow('arrow-self', a, a.from);
  }

  validateAnchors(p, markings, marking);

  // Parent of a container (v13): a canvas marking, not floating, that contains it entirely.
  for (const c of p.containers) {
    if (c.parentId === null) continue;
    const parent = markings.get(c.parentId);
    if (!parent) imageIssue('container-parent-missing', c, c.parentId);
    else if (parent.containerId !== null || parent.floating) {
      imageIssue('container-parent-not-canvas', c, parent.id);
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
