// Mechanical repair of a project that violates invariants (docs/FORMAT.md, "Inconsistent
// files"). Pure function: whoever writes the repaired one (and the backup of the original) is
// the session.
import {
  IDENTITY_PLACEMENT,
  fromCanvasRect,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  right,
  snapPlacement,
  toCanvasRect,
} from './geometry';
import { IMAGE_GAP } from './containers';
import {
  perspectiveNameKey,
  validateProject,
  type InvariantCode,
  type InvariantEntity,
  type InvariantIssue,
} from './invariants';
import type {
  Annotation,
  Arrival,
  Arrow,
  Marking,
  Perspective,
  Project,
  ProjectContainer,
  Rect,
} from './types';

/** What the repair did to the item. */
export type RepairAction =
  'new-id' | 'clipped' | 'removed' | 'made-root' | 'moved' | 'renamed' | 'released';

export interface RepairRecord {
  readonly action: RepairAction;
  /** The invariant that motivated the repair. */
  readonly code: InvariantCode;
  readonly entity: InvariantEntity;
  readonly id: string;
  /** Name of the item, when there is one (for an image without a label, the file). */
  readonly name?: string;
}

export interface RepairResult {
  /** The repaired project; it is only valid with `unrepaired` empty. */
  readonly project: Project;
  /** Each repair made, in order. */
  readonly repaired: readonly RepairRecord[];
  /** Problems with no unambiguous mechanical repair: with any, the project is still refused. */
  readonly unrepaired: readonly InvariantIssue[];
}

/** Invariants with a mechanical repair. Everything else stays in `unrepaired`. */
const REPAIRABLE: ReadonlySet<InvariantCode> = new Set<InvariantCode>([
  'duplicate-entry-id',
  'rect-out-of-image',
  'missing-image',
  'missing-marking',
  'missing-layer',
  'missing-parent',
  'hierarchy-cycle',
  'images-overlap',
  'container-parent-missing',
  'container-parent-not-canvas',
  'container-outside-parent',
  'floating-in-container',
  'parent-floating',
  'arrow-endpoint-missing',
  'arrow-self',
  'duplicate-id', // only the perspective one (see `isRepairable`)
  'perspective-root-missing',
  'perspective-root-not-root',
  'perspective-root-duplicate',
  'perspective-layer-missing',
  'perspective-duplicate-name',
  'arrival-root-missing',
  'arrival-root-not-root',
  'arrival-duplicate',
  'anchor-missing',
  'anchor-self',
  'anchor-cycle',
  'anchor-other-space',
]);

/**
 * The `duplicate-id` is only repairable on the perspective (nothing points to it by id besides
 * the arrival, which keeps the name); on the other entities the reference would be ambiguous.
 */
function isRepairable(issue: InvariantIssue): boolean {
  if (issue.code === 'duplicate-id') return issue.entity === 'perspective';
  return REPAIRABLE.has(issue.code);
}

/**
 * One repair can expose another (e.g. the removed marking leaves its annotations without a
 * marking and its children without a parent); each round resolves what the previous one exposed.
 */
const MAX_ROUNDS = 8;

/**
 * Repairs what is mechanical and unambiguous: a pair with a repeated id → new id; `rect` of a
 * container marking outside the image → clipped to the bounds (no area → marking removed);
 * marking of a nonexistent image and annotation of a nonexistent marking or layer → removed (the
 * annotation takes along the ones it owns); nonexistent parent, floating parent or cycle in the
 * hierarchy → the marking becomes a root; missing container parent, one that is not on the
 * canvas or that does not contain it → the container is left without a parent; floating with a
 * container or parent → goes to the canvas, with the `rect` converted; overlapping images → the
 * one with the higher index goes to the right of the previous ones; arrow with a nonexistent
 * endpoint (or one that is not a marking) or linked to itself → removed, and its annotations go
 * in the next round (the owner stopped existing); perspective (v16): nonexistent root item, one
 * that is not a root or repeated → removed, nonexistent hidden layer → dropped from the list,
 * repeated id → the repeated one gets a new id, repeated name → the repeated one gets " (2)",
 * " (3)"…; arrival of a nonexistent root, one that is not a root or repeated → removed; anchor
 * (v20) with a nonexistent target, itself, in another space or in a cycle → the marking is left
 * without an anchor (`anchor: null`). It only makes the project valid: it does not settle (the
 * next geometry operation does). What remains after the repairs (`validateProject` again) is
 * `unrepaired`.
 */
export function repairProject(
  project: Project,
  issues: readonly InvariantIssue[],
  newId: () => string = () => crypto.randomUUID(),
): RepairResult {
  const repaired: RepairRecord[] = [];
  let p = project;
  let current = issues;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (!current.some(isRepairable)) break;
    p = repairRound(p, current, newId, repaired);
    current = validateProject(p);
  }
  return { project: p, repaired, unrepaired: current };
}

function record(
  out: RepairRecord[],
  action: RepairAction,
  code: InvariantCode,
  entity: InvariantEntity,
  item: {
    readonly id: string;
    readonly name: string | null;
    readonly file?: string | null;
  },
): void {
  const name = item.name ?? item.file ?? null;
  out.push({ action, code, entity, id: item.id, ...(name === null ? {} : { name }) });
}

/** Clipping of `rect` to the image bounds; `null` if no area is left. */
function clipToImage(rect: Rect, image: ProjectContainer): Rect | null {
  const bounds = imagePixelRect(image);
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const width = Math.min(rect.x + rect.width, bounds.width) - x;
  const height = Math.min(rect.y + rect.height, bounds.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Is the marking part of the cycle (going up through the parents, it returns to itself)? */
function inCycle(m: Marking, markings: ReadonlyMap<string, Marking>): boolean {
  const visited = new Set<string>();
  let parentId = m.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    if (parentId === m.id) return true;
    visited.add(parentId);
    parentId = markings.get(parentId)?.parentId ?? null;
  }
  return false;
}

const ANCHOR_CODES: readonly InvariantCode[] = [
  'anchor-missing',
  'anchor-self',
  'anchor-other-space',
  'anchor-cycle',
];

/**
 * Anchor (v20) that breaks an invariant (nonexistent target, the marking itself, another space
 * or a cycle): the marking stays where it is, without an anchor. In a cycle, all those the chain
 * reaches back are released (each one is reported).
 */
function releaseBrokenAnchor(
  m: Marking,
  has: (entity: InvariantEntity, id: string, code: InvariantCode) => boolean,
  out: RepairRecord[],
): Marking {
  if (m.anchor == null) return m;
  const code = ANCHOR_CODES.find((c) => has('marking', m.id, c));
  if (code === undefined) return m;
  record(out, 'released', code, 'marking', m);
  return { ...m, anchor: null };
}

function repairRound(
  p: Project,
  issues: readonly InvariantIssue[],
  newId: () => string,
  out: RepairRecord[],
): Project {
  const codesOf = new Map<string, Set<InvariantCode>>();
  for (const issue of issues) {
    const key = `${issue.entity}:${issue.id}`;
    const set = codesOf.get(key) ?? new Set<InvariantCode>();
    set.add(issue.code);
    codesOf.set(key, set);
  }
  const has = (entity: InvariantEntity, id: string, code: InvariantCode) =>
    codesOf.get(`${entity}:${id}`)?.has(code) ?? false;

  // Markings: removed (nonexistent image, clip with no area), clipped or made root.
  // A canvas marking (null `containerId`) has no image: it is never an orphan nor clipped.
  const containers = new Map(p.containers.map((i) => [i.id, i]));
  const byId = new Map(p.markings.map((m) => [m.id, m]));
  const markings: Marking[] = [];
  for (const m of p.markings) {
    if (has('marking', m.id, 'missing-image')) {
      record(out, 'removed', 'missing-image', 'marking', m);
      continue;
    }
    let next = m;
    const image = m.containerId === null ? undefined : containers.get(m.containerId);
    if (has('marking', m.id, 'floating-in-container')) {
      // A floating one lives only on the canvas: it leaves the container, with the `rect` as
      // the person sees it.
      const rect = image
        ? fromCanvasRect(IDENTITY_PLACEMENT, toCanvasRect(image.placement, m.rect), null)
        : m.rect;
      next = { ...next, containerId: null, parentId: null, rect };
      record(out, 'made-root', 'floating-in-container', 'marking', m);
    } else if (image && has('marking', m.id, 'rect-out-of-image')) {
      const rect = clipToImage(m.rect, image);
      if (!rect) {
        record(out, 'removed', 'rect-out-of-image', 'marking', m);
        continue;
      }
      next = { ...next, rect };
      record(out, 'clipped', 'rect-out-of-image', 'marking', m);
    }
    if (next.parentId !== null && has('marking', m.id, 'missing-parent')) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'missing-parent', 'marking', m);
    } else if (next.parentId !== null && has('marking', m.id, 'parent-floating')) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'parent-floating', 'marking', m);
    } else if (has('marking', m.id, 'hierarchy-cycle') && inCycle(m, byId)) {
      next = { ...next, parentId: null };
      record(out, 'made-root', 'hierarchy-cycle', 'marking', m);
    }
    markings.push(next);
  }
  const anchored = markings.map((m) => releaseBrokenAnchor(m, has, out));

  // Arrows: without one of the endpoints or linked to themselves, there is nothing to link. Their
  // annotations go in the next round, like those of any owner that stopped existing.
  const arrows: Arrow[] = [];
  for (const a of p.arrows) {
    const code = (['arrow-endpoint-missing', 'arrow-self'] as const).find((c) =>
      has('arrow', a.id, c),
    );
    if (code) record(out, 'removed', code, 'arrow', a);
    else arrows.push(a);
  }

  // Annotations: those of a nonexistent marking or layer go, along with the ones they own.
  const removed = new Set<string>();
  const kept: Annotation[] = [];
  for (const a of p.annotations) {
    const code: InvariantCode | null = has('annotation', a.id, 'missing-marking')
      ? 'missing-marking'
      : has('annotation', a.id, 'missing-layer')
        ? 'missing-layer'
        : null;
    if (code) {
      removed.add(a.id);
      record(out, 'removed', code, 'annotation', a);
    }
  }
  if (removed.size > 0) {
    // The owned ones may come before the owner in the list: repeat until none is found.
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of p.annotations) {
        if (removed.has(a.id) || a.parentAnnotationId === null) continue;
        if (!removed.has(a.parentAnnotationId)) continue;
        removed.add(a.id);
        record(out, 'removed', 'missing-parent-annotation', 'annotation', a);
        grew = true;
      }
    }
  }
  const seenEntries = new Set<string>();
  for (const a of p.annotations) {
    if (removed.has(a.id)) continue;
    if (!has('annotation', a.id, 'duplicate-entry-id')) {
      for (const e of a.entries) seenEntries.add(e.id);
      kept.push(a);
      continue;
    }
    // The first pair with the id keeps it (the references keep pointing to it).
    let renewed = false;
    const entries = a.entries.map((e) => {
      if (!seenEntries.has(e.id)) {
        seenEntries.add(e.id);
        return e;
      }
      let id = newId();
      while (seenEntries.has(id)) id = newId();
      seenEntries.add(id);
      renewed = true;
      return { ...e, id };
    });
    // The incoming id may have collided only with a removed annotation: then nothing changed.
    if (renewed) record(out, 'new-id', 'duplicate-entry-id', 'annotation', a);
    kept.push(renewed ? { ...a, entries } : a);
  }

  // Overlapping images: each one that touches a previous one goes to the right of all of them.
  let projectImages = p.containers;
  if (issues.some((i) => i.code === 'images-overlap')) {
    const placed: Rect[] = [];
    projectImages = p.containers.map((image) => {
      let next = image;
      let rect = imageCanvasRect(image, image.placement);
      if (placed.some((r) => rectsOverlap(r, rect))) {
        const x = Math.max(...placed.map(right)) + IMAGE_GAP;
        next = { ...image, placement: snapPlacement({ ...image.placement, x }) };
        rect = imageCanvasRect(next, next.placement);
        record(out, 'moved', 'images-overlap', 'image', image);
      }
      placed.push(rect);
      return next;
    });
  }

  // Container parent missing, not a canvas marking or not containing it: no parent.
  const orphanCodes: readonly InvariantCode[] = [
    'container-parent-missing',
    'container-parent-not-canvas',
    'container-outside-parent',
  ];
  projectImages = projectImages.map((image) => {
    const code = orphanCodes.find((c) => has('image', image.id, c));
    if (code === undefined || image.parentId === null) return image;
    record(out, 'made-root', code, 'image', image);
    return { ...image, parentId: null };
  });

  return {
    ...p,
    containers: projectImages,
    markings: anchored,
    arrows,
    ...repairPerspectives(p, issues, newId, out),
    annotations: kept,
  };
}

/** A name free among those already used (case-insensitive comparison): `Name (2)`, `Name (3)`… */
function numberedName(name: string, taken: ReadonlySet<string>): string {
  const base = name.trim();
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(perspectiveNameKey(candidate))) return candidate;
  }
}

/** Without the nonexistent hidden layers and without the items with an invalid or repeated root. */
function cleanPerspective(
  x: Perspective,
  badRoots: ReadonlySet<string>,
  badLayers: ReadonlySet<string>,
): Perspective {
  const seen = new Set<string>();
  return {
    ...x,
    hiddenLayers: x.hiddenLayers.filter((layer) => !badLayers.has(layer)),
    items: x.items.filter(({ root }) => {
      if (badRoots.has(root) || seen.has(root)) return false;
      seen.add(root);
      return true;
    }),
  };
}

/** Unique `id` and name: the first perspective keeps its own; a repeated one changes (none vanishes). */
function uniquePerspectives(
  list: readonly Perspective[],
  newId: () => string,
): Perspective[] {
  const takenIds = new Set(list.map((x) => x.id));
  const takenNames = new Set(list.map((x) => perspectiveNameKey(x.name)));
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  return list.map((x) => {
    let next = x;
    if (usedIds.has(x.id)) {
      let id = newId();
      while (takenIds.has(id)) id = newId();
      takenIds.add(id);
      next = { ...next, id };
    }
    usedIds.add(next.id);
    if (usedNames.has(perspectiveNameKey(x.name))) {
      const name = numberedName(x.name, takenNames);
      takenNames.add(perspectiveNameKey(name));
      next = { ...next, name };
    }
    usedNames.add(perspectiveNameKey(next.name));
    return next;
  });
}

/**
 * Repair of the perspectives and arrivals (v16). The invalid root or layer comes in the
 * problem's `otherId` (the arrival's, in `id`). Each problem becomes a record; with no
 * perspective or arrival problem, it returns the lists as they are.
 */
function repairPerspectives(
  p: Project,
  issues: readonly InvariantIssue[],
  newId: () => string,
  out: RepairRecord[],
): { perspectives: readonly Perspective[]; arrivals: readonly Arrival[] } {
  const badRoots = new Set<string>();
  const badLayers = new Set<string>();
  const badArrivals = new Set<string>();
  // What each code says to remove (the repeated root and the repeated id and name are not here:
  // there is no invalid value, only the second use).
  const drop: Partial<Record<InvariantCode, Set<string>>> = {
    'perspective-root-missing': badRoots,
    'perspective-root-not-root': badRoots,
    'perspective-layer-missing': badLayers,
    'arrival-root-missing': badArrivals,
    'arrival-root-not-root': badArrivals,
  };
  let touched = false;
  for (const i of issues) {
    if (!isPerspectiveIssue(i)) continue;
    touched = true;
    record(out, PERSPECTIVE_ACTIONS[i.code] ?? 'removed', i.code, i.entity, {
      id: i.id,
      name: i.name ?? null,
    });
    drop[i.code]?.add(i.entity === 'arrival' ? i.id : (i.otherId ?? ''));
  }
  if (!touched) return { perspectives: p.perspectives, arrivals: p.arrivals };
  const seen = new Set<string>();
  return {
    perspectives: uniquePerspectives(
      p.perspectives.map((x) => cleanPerspective(x, badRoots, badLayers)),
      newId,
    ),
    // The repeated arrival (same root) loses the second one.
    arrivals: p.arrivals.filter(({ root }) => {
      if (badArrivals.has(root) || seen.has(root)) return false;
      seen.add(root);
      return true;
    }),
  };
}

/** Perspective or arrival problem with a repair (`duplicate-id` only applies to the perspective). */
function isPerspectiveIssue(i: InvariantIssue): boolean {
  return (i.entity === 'perspective' || i.entity === 'arrival') && isRepairable(i);
}

/** Action of each code; whatever is not here removes the item. */
const PERSPECTIVE_ACTIONS: Partial<Record<InvariantCode, RepairAction>> = {
  'duplicate-id': 'new-id',
  'perspective-duplicate-name': 'renamed',
};
