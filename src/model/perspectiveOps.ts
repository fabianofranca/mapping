import { fail } from './errors';
import { snapCoordinate } from './geometry';
import { perspectiveNameKey } from './invariants';
import {
  isMarkingRoot,
  perspectiveView,
  rootPosition,
  type CanvasPosition,
} from './perspective';
import { placeRootIn } from './perspectivePlace';
import { reconcilePerspective } from './perspectiveReconcile';
import { findById, updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Perspective, PerspectiveItem, Project } from './types';

// Perspective operations (v16, decisions 6, 10 and 11). The "For everyone" ones live in the
// project (`p.perspectives`) and the operations receive the `id`; the "Only me" ones live in the
// browser, in the same format, and use the by-value version (`Perspective`). Ids come from the
// caller.

export type NameIssue = 'empty' | 'taken';

/**
 * What is wrong with a perspective name: empty, or equal (ignoring case and surrounding spaces)
 * to one of `names`. `exceptName` is the current name of the one being renamed: it does not
 * count as a duplicate.
 */
export function perspectiveNameIssue(
  names: readonly string[],
  name: string,
  exceptName?: string,
): NameIssue | null {
  const key = perspectiveNameKey(name);
  if (key === '') return 'empty';
  const except = exceptName === undefined ? null : perspectiveNameKey(exceptName);
  const taken = names.some((n) => {
    const other = perspectiveNameKey(n);
    return other === key && other !== except;
  });
  return taken ? 'taken' : null;
}

/** `perspectiveNameIssue` against the project's "For everyone" ones and the extra names (the "Only me" ones). */
export function projectPerspectiveNameIssue(
  p: Project,
  name: string,
  exceptName?: string,
  extraNames: readonly string[] = [],
): NameIssue | null {
  const names = [...p.perspectives.map((x) => x.name), ...extraNames];
  return perspectiveNameIssue(names, name, exceptName);
}

/** The name without surrounding spaces; fails with the problem's code. */
function checkedName(
  p: Project,
  name: string,
  exceptName: string | undefined,
  extraNames: readonly string[] | undefined,
): string {
  const issue = projectPerspectiveNameIssue(p, name, exceptName, extraNames);
  if (issue === 'empty') fail('perspective-name-empty');
  if (issue === 'taken') fail('perspective-name-taken', name.trim());
  return name.trim();
}

/** Only layers that exist, without repeats, in the project's layer order. */
function normalizedLayers(p: Project, layerIds: readonly string[]): string[] {
  const wanted = new Set(layerIds);
  return p.layers.filter((l) => wanted.has(l.id)).map((l) => l.id);
}

/** Where a new perspective starts from: the Main one (`null`), empty or a copy of one. */
export type PerspectiveStart = null | 'empty' | Perspective;

function startItems(p: Project, startFrom: PerspectiveStart): readonly PerspectiveItem[] {
  if (startFrom === 'empty') return [];
  if (startFrom !== null) return startFrom.items.map((item) => ({ ...item }));
  return projectIndex(p).roots.map((root) => {
    const at = rootPosition(p, root) as CanvasPosition;
    return { root, x: at.x, y: at.y };
  });
}

/**
 * Builds a new perspective (a value; the project or the browser stores it). "Start from":
 * the Main one takes all roots at their positions; Empty, none; a perspective, a copy of the
 * roots, positions and hidden layers (already cleaned of what the project no longer has).
 * `hiddenLayers`, if given, replaces the source's (Main and Empty start with none).
 */
export function buildPerspective(
  p: Project,
  args: {
    readonly id: string;
    readonly name: string;
    readonly startFrom: PerspectiveStart;
    readonly hiddenLayers?: readonly string[];
  },
): Perspective {
  const { startFrom } = args;
  const inherited =
    startFrom !== null && startFrom !== 'empty' ? startFrom.hiddenLayers : [];
  const raw: Perspective = {
    id: args.id,
    name: args.name.trim(),
    hiddenLayers: [...(args.hiddenLayers ?? inherited)],
    items: startItems(p, startFrom),
  };
  const clean = reconcilePerspective(p, p, raw);
  return { ...clean, hiddenLayers: normalizedLayers(p, clean.hiddenLayers) };
}

/**
 * Appends the perspective at the end of the "For everyone" ones. Fails with
 * `perspective-name-empty`, `perspective-name-taken` (against the project's and `extraNames`,
 * the "Only me" ones) or `duplicate-id`.
 */
export function addPerspective(
  p: Project,
  perspective: Perspective,
  extraNames?: readonly string[],
): Project {
  const name = checkedName(p, perspective.name, undefined, extraNames);
  if (p.perspectives.some((x) => x.id === perspective.id)) {
    fail('duplicate-id', perspective.id);
  }
  return { ...p, perspectives: [...p.perspectives, { ...perspective, name }] };
}

export function renamePerspective(
  p: Project,
  id: string,
  name: string,
  extraNames?: readonly string[],
): Project {
  const current = findById(p.perspectives, id);
  const checked = checkedName(p, name, current.name, extraNames);
  return {
    ...p,
    perspectives: updateById(p.perspectives, id, (x) => ({ ...x, name: checked })),
  };
}

/** Duplicates the perspective (roots, positions and hidden layers) with a new id and name, at the end. */
export function duplicatePerspective(
  p: Project,
  id: string,
  newId: string,
  name: string,
  extraNames?: readonly string[],
): Project {
  const source = findById(p.perspectives, id);
  const copy = buildPerspective(p, { id: newId, name, startFrom: source });
  return addPerspective(p, copy, extraNames);
}

/** Deletes the perspective. Only `perspectives` changes: arrival marks keep the name (`fromName`). */
export function removePerspective(p: Project, id: string): Project {
  findById(p.perspectives, id);
  return { ...p, perspectives: p.perspectives.filter((x) => x.id !== id) };
}

/** Replaces the project's perspective `id` with `next` (the same object: nothing to replace). */
function replaced(
  p: Project,
  id: string,
  current: Perspective,
  next: Perspective,
): Project {
  if (next === current) return p;
  return { ...p, perspectives: updateById(p.perspectives, id, () => next) };
}

// ---------------------------------------------------------------------------
// Send and remove

/**
 * Sends roots to perspective `target` (decision 6): each root not yet there enters by the
 * arrival rule (`placeRootIn`: near the reference, at the nearest free spot or in the arrival
 * area), one at a time (the second already sees the first), without a mark. `source` is where
 * the roots are now (`null` = the Main one). An id that is not a root fails with `not-root`.
 */
export function sendRoots(
  p: Project,
  target: Perspective,
  rootIds: readonly string[],
  source: Perspective | null,
): Perspective {
  const roots = projectIndex(p).rootOf;
  const sourceRoots = source ? new Set(source.items.map((item) => item.root)) : null;
  let current = target;
  const have = new Set(target.items.map((item) => item.root));
  for (const id of rootIds) {
    if (roots.get(id) !== id) fail('not-root', id);
    if (have.has(id)) continue;
    // A root that the source does not have is measured in the Main perspective.
    const from = source && sourceRoots?.has(id) ? perspectiveView(p, source) : p;
    const place = placeRootIn(perspectiveView(p, current), from, id);
    current = {
      ...current,
      items: [...current.items, { root: id, x: place.x, y: place.y }],
    };
    have.add(id);
  }
  return current;
}

export function sendRootsToPerspective(
  p: Project,
  targetId: string,
  rootIds: readonly string[],
  source: Perspective | null,
): Project {
  const target = findById(p.perspectives, targetId);
  return replaced(p, targetId, target, sendRoots(p, target, rootIds, source));
}

/** Removes the roots from the perspective; nothing of the project is deleted. Ids it does not have are ignored. */
export function removeRoots(
  target: Perspective,
  rootIds: readonly string[],
): Perspective {
  const drop = new Set(rootIds);
  const items = target.items.filter((item) => !drop.has(item.root));
  return items.length === target.items.length ? target : { ...target, items };
}

export function removeRootsFromPerspective(
  p: Project,
  id: string,
  rootIds: readonly string[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, removeRoots(target, rootIds));
}

// ---------------------------------------------------------------------------
// Move and layers

export interface RootMove {
  readonly root: string;
  readonly dx: number;
  readonly dy: number;
}

/** The item after the move; a marking only moves in whole numbers. */
function movedItem(p: Project, item: PerspectiveItem, move: RootMove): PerspectiveItem {
  if (!Number.isFinite(move.dx) || !Number.isFinite(move.dy)) fail('invalid-placement');
  const whole = Number.isInteger(move.dx) && Number.isInteger(move.dy);
  if (isMarkingRoot(p, item.root) && !whole) fail('rect-not-integer', item.root);
  return {
    root: item.root,
    x: snapCoordinate(item.x + move.dx),
    y: snapCoordinate(item.y + move.dy),
  };
}

/**
 * Changes only the position of the roots in the perspective (decision 10): the project does not
 * change. A root the perspective does not have fails with `not-found`; a marking's offset is a
 * whole number, otherwise `rect-not-integer`. A zero offset returns the same perspective.
 */
export function moveRoots(
  p: Project,
  target: Perspective,
  moves: readonly RootMove[],
): Perspective {
  const items = new Map(target.items.map((item) => [item.root, item]));
  for (const move of moves) {
    const item = items.get(move.root) ?? fail('not-found', move.root);
    items.set(move.root, movedItem(p, item, move));
  }
  const next = target.items.map((item) => items.get(item.root) as PerspectiveItem);
  const same = next.every((item, i) => {
    const old = target.items[i] as PerspectiveItem;
    return item.x === old.x && item.y === old.y;
  });
  return same ? target : { ...target, items: next };
}

export function moveRootsInPerspective(
  p: Project,
  id: string,
  moves: readonly RootMove[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, moveRoots(p, target, moves));
}

/** Hidden layers (decision 11): only those that exist, without repeats, in the project's order. */
export function setHiddenLayers(
  p: Project,
  target: Perspective,
  layerIds: readonly string[],
): Perspective {
  const hiddenLayers = normalizedLayers(p, layerIds);
  const same =
    hiddenLayers.length === target.hiddenLayers.length &&
    hiddenLayers.every((layer, i) => layer === target.hiddenLayers[i]);
  return same ? target : { ...target, hiddenLayers };
}

export function setPerspectiveHiddenLayers(
  p: Project,
  id: string,
  layerIds: readonly string[],
): Project {
  const target = findById(p.perspectives, id);
  return replaced(p, id, target, setHiddenLayers(p, target, layerIds));
}
