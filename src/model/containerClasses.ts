import { isRecord } from './isRecord';
import { addSpecIssue, specMsg, type SpecMsg } from './specIssueCode';
import type { z } from 'zod';

// Container classes (`formatVersion` 21, stage #1901, decisions 1 to 8): named **sets** of classes
// that a library declares at the root (`containerClasses`). A set is **computed** from the
// container's size (`by: "width" | "height"`, classes cut by `below`, in units) or **chosen** per
// container (no `by`). A ready-made size carries a choice (`containers[].classes`, chosen sets
// only) and a type is restricted to classes with `appliesIn`. This module holds the declaration:
// the shapes, the version, the cross checks and the pure resolver of the computed class. The keys
// are outside the version contract (`diffSpecs` ignores them). Generic: the library names the sets
// and the classes (nothing here knows a breakpoint or a platform). No browser APIs.

/** First `formatVersion` of `containerClasses`, `classes` on a ready-made size and `appliesIn`. */
export const CONTAINER_CLASSES_VERSION = 21;

/** The axis a computed set reads. */
export type ContainerClassAxis = 'width' | 'height';
export const CONTAINER_CLASS_AXES: readonly ContainerClassAxis[] = ['width', 'height'];

export interface SpecContainerClass {
  /** `[a-z0-9-]+`, unique in the set. */
  id: string;
  name: string;
  /** Upper limit in units (exclusive); required in every class but the last of a computed set. */
  below?: number;
}

export interface SpecContainerClassSet {
  /** `[a-z0-9-]+`, unique in the specialization; `width` and `height` are reserved. */
  id: string;
  name: string;
  /** Present: the set is computed from the container's size; absent: chosen per container. */
  by?: ContainerClassAxis;
  classes: SpecContainerClass[];
}

/** The classes a type is meant for: set id → class ids (`appliesIn` on the type). */
export type SpecAppliesIn = Record<string, string[]>;

/** The choice a ready-made size carries: set id → class id (`classes` on `containers[]`). */
export type SpecContainerChoice = Record<string, string>;

/** Does the set read the container's size (as opposed to being chosen)? */
export function isComputedSet(set: Pick<SpecContainerClassSet, 'by'>): boolean {
  return set.by !== undefined;
}

/** The container's side in units: its size in pixels divided by the effective density. */
export function unitsOf(pixels: number, density: number): number {
  return pixels / density;
}

/**
 * The class of a computed set for a size in units (decision 2): the first class whose `below` is
 * greater than `units`, otherwise the last. `undefined` for a chosen set (it has no computed class).
 */
export function computedClassOf(
  set: SpecContainerClassSet,
  units: number,
): SpecContainerClass | undefined {
  if (!isComputedSet(set)) return undefined;
  return (
    set.classes.find((c) => c.below !== undefined && c.below > units) ??
    set.classes.at(-1)
  );
}

// ---- Validation (`parseSpec`) -----------------------------------------------------------------

const ID_RE = /^[a-z0-9-]+$/;
/** Ids that `$container.width` and `$container.height` read (decision 1): not usable as a set id. */
const RESERVED_IDS: ReadonlySet<string> = new Set(CONTAINER_CLASS_AXES);
const SET_KEYS = new Set(['id', 'name', 'by', 'classes']);
const CLASS_KEYS = new Set(['id', 'name', 'below']);

type Path = (string | number)[];
/** The sets the cross checks read; `null` = unknown (the declaration is malformed): nothing to check. */
type Sets = Map<string, KnownSet> | null;
type Add = (path: Path, message: string | SpecMsg) => void;

/** What the cross checks know about a well-formed set: its axis and its class ids. */
interface KnownSet {
  readonly by?: ContainerClassAxis;
  readonly classIds: ReadonlySet<string>;
}

/** `value` is a non-empty text? Otherwise, the error at `path` ("required", "must be text" or "cannot be empty"). */
function checkText(value: unknown, path: Path, add: Add): void {
  if (value === undefined) add(path, specMsg('spec.required'));
  else if (typeof value !== 'string') add(path, specMsg('spec.mustBeText'));
  else if (value === '') add(path, specMsg('spec.notEmpty'));
}

function checkUnknownKeys(
  entry: { readonly [key: string]: unknown },
  allowed: ReadonlySet<string>,
  path: Path,
  add: Add,
): void {
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) {
      add([...path, key], specMsg('spec.containerClassKeyUnknown', { key }));
    }
  }
}

/** An id: non-empty text with the `[a-z0-9-]+` pattern, unique in `seen` (reserved ones too, when asked). */
function checkId(
  entry: { readonly [key: string]: unknown },
  path: Path,
  seen: Set<string>,
  add: Add,
  reserved: boolean,
): void {
  const { id } = entry;
  checkText(id, [...path, 'id'], add);
  if (typeof id !== 'string' || id === '') return;
  if (!ID_RE.test(id)) add([...path, 'id'], specMsg('spec.containerClassIdInvalid'));
  else if (reserved && RESERVED_IDS.has(id)) {
    add([...path, 'id'], specMsg('spec.containerClassIdReserved'));
  }
  if (seen.has(id)) add([...path, 'id'], specMsg('spec.idRepeated', { id }));
  seen.add(id);
}

/** A well-formed `below`: a number greater than 0. */
function isBelow(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** The `below` of one class of a computed set (the last has none; the others increase). */
function checkComputedClass(
  entry: { readonly [key: string]: unknown },
  path: Path,
  last: boolean,
  previous: number | undefined,
  add: Add,
): number | undefined {
  const { below } = entry;
  if (last) {
    if (below !== undefined) add(path, specMsg('spec.containerClassLastBelow'));
    return previous;
  }
  if (below === undefined) {
    add(path, specMsg('spec.containerClassBelowRequired'));
    return previous;
  }
  if (!isBelow(below)) {
    add([...path, 'below'], specMsg('spec.containerClassBelowInvalid'));
    return previous;
  }
  if (previous !== undefined && below <= previous) {
    add(path, specMsg('spec.containerClassBelowIncrease'));
  }
  return below;
}

/** How the `below` of a class is read: by the axis of its set (`unknown`: the `by` is invalid, no rule). */
type SetMode = 'computed' | 'chosen' | 'unknown';

function checkClass(
  entry: unknown,
  path: Path,
  options: { mode: SetMode; last: boolean; previous?: number },
  ids: Set<string>,
  add: Add,
): number | undefined {
  if (!isRecord(entry)) {
    add(path, specMsg('spec.mustBeObject'));
    return options.previous;
  }
  checkUnknownKeys(entry, CLASS_KEYS, path, add);
  checkId(entry, path, ids, add, false);
  checkText(entry.name, [...path, 'name'], add);
  if (options.mode === 'computed') {
    return checkComputedClass(entry, path, options.last, options.previous, add);
  }
  if (options.mode === 'chosen' && entry.below !== undefined) {
    add([...path, 'below'], specMsg('spec.containerClassBelowNotComputed'));
  }
  return options.previous;
}

/** `by` is absent (chosen set), `"width"` or `"height"`; any other value is an error. */
function checkBy(
  by: unknown,
  path: Path,
  add: Add,
): ContainerClassAxis | 'invalid' | undefined {
  if (by === undefined) return undefined;
  if (by === 'width' || by === 'height') return by;
  add([...path, 'by'], specMsg('spec.containerClassByInvalid'));
  return 'invalid';
}

function checkSetClasses(
  set: { readonly [key: string]: unknown },
  by: ContainerClassAxis | 'invalid' | undefined,
  path: Path,
  add: Add,
): Set<string> {
  const ids = new Set<string>();
  const { classes } = set;
  const classesPath = [...path, 'classes'];
  if (classes === undefined) add(classesPath, specMsg('spec.required'));
  else if (!Array.isArray(classes))
    add(classesPath, specMsg('spec.containerClassListShape'));
  else if (classes.length === 0) add(classesPath, specMsg('spec.notEmpty'));
  else {
    let previous: number | undefined;
    // An invalid `by` already has its error: no `below` rule on top of it.
    const mode: SetMode =
      by === undefined ? 'chosen' : by === 'invalid' ? 'unknown' : 'computed';
    classes.forEach((entry: unknown, i) => {
      previous = checkClass(
        entry,
        [...classesPath, i],
        { mode, last: i === classes.length - 1, previous },
        ids,
        add,
      );
    });
  }
  return ids;
}

function checkSet(
  entry: unknown,
  path: Path,
  setIds: Set<string>,
  known: Map<string, KnownSet>,
  add: Add,
): void {
  if (!isRecord(entry)) return add(path, specMsg('spec.mustBeObject'));
  checkUnknownKeys(entry, SET_KEYS, path, add);
  checkId(entry, path, setIds, add, true);
  checkText(entry.name, [...path, 'name'], add);
  const by = checkBy(entry.by, path, add);
  const classIds = checkSetClasses(entry, by, path, add);
  const { id } = entry;
  if (typeof id !== 'string' || id === '' || known.has(id)) return;
  known.set(id, { by: by === 'invalid' ? undefined : by, classIds });
}

/** The sets of the specialization that the cross checks can read (the well-formed ones). */
/** `null` when the list itself is malformed: the cross checks then have nothing to compare with. */
function knownSets(containerClasses: unknown, add: Add): Map<string, KnownSet> | null {
  const known = new Map<string, KnownSet>();
  if (containerClasses === undefined) return known;
  if (!Array.isArray(containerClasses)) {
    add(['containerClasses'], specMsg('spec.containerClassSetsShape'));
    return null;
  }
  const ids = new Set<string>();
  containerClasses.forEach((entry: unknown, i) =>
    checkSet(entry, ['containerClasses', i], ids, known, add),
  );
  return known;
}

const notAClass = (set: string, id: string): SpecMsg =>
  specMsg('spec.containerClassNotInSet', { set, class: id });

/** One entry of `classes` on a ready-made size: a chosen set of this specialization and one of its classes. */
function checkChoice(
  setId: string,
  value: unknown,
  path: Path,
  sets: Sets,
  add: Add,
): void {
  if (sets === null) return;
  const set = sets.get(setId);
  if (set === undefined) {
    return add(path, specMsg('spec.containerClassSetMissing', { set: setId }));
  }
  if (set.by !== undefined) {
    return add(
      path,
      specMsg('spec.containerClassSetComputed', { set: setId, by: set.by }),
    );
  }
  if (typeof value !== 'string') return add(path, specMsg('spec.mustBeText'));
  if (!set.classIds.has(value)) add(path, notAClass(setId, value));
}

type RawContainer = { readonly classes?: unknown };

/** `classes` of the ready-made sizes (`containers[]`). */
function checkContainerChoices(
  containers: readonly RawContainer[] | undefined,
  sets: Sets,
  current: boolean,
  add: Add,
): void {
  (containers ?? []).forEach((container, ci) => {
    const { classes } = container;
    if (classes === undefined) return;
    const path: Path = ['containers', ci, 'classes'];
    if (!current) return add(path, onlyCurrent());
    if (!isRecord(classes)) return add(path, specMsg('spec.mustBeObject'));
    for (const [setId, value] of Object.entries(classes)) {
      checkChoice(setId, value, [...path, setId], sets, add);
    }
  });
}

function onlyCurrent(): SpecMsg {
  return specMsg('spec.onlyFormat', { version: String(CONTAINER_CLASSES_VERSION) });
}

/** One set of `appliesIn`: a non-empty list, without repeats, of classes of that set. */
function checkAppliesInSet(
  setId: string,
  value: unknown,
  path: Path,
  sets: Sets,
  add: Add,
): void {
  const set = sets?.get(setId);
  if (sets !== null && set === undefined) {
    return add(path, specMsg('spec.containerClassSetMissing', { set: setId }));
  }
  if (!Array.isArray(value)) return add(path, specMsg('spec.containerClassListShape'));
  if (value.length === 0) return add(path, specMsg('spec.notEmpty'));
  if (new Set(value).size !== value.length) add(path, specMsg('spec.repeatedValues'));
  for (const id of value) {
    if (typeof id !== 'string') add(path, specMsg('spec.mustBeText'));
    else if (set !== undefined && !set.classIds.has(id)) add(path, notAClass(setId, id));
  }
}

interface RawType {
  readonly appliesTo?: readonly unknown[];
  readonly floating?: unknown;
  readonly appliesIn?: unknown;
}

/** `appliesIn` of one type: the shape, the sets and classes, and where the type applies. */
function checkAppliesIn(type: RawType, path: Path, sets: Sets, add: Add): void {
  const { appliesIn } = type;
  if (!isRecord(appliesIn)) return add(path, specMsg('spec.mustBeObject'));
  const entries = Object.entries(appliesIn);
  if (entries.length === 0) return add(path, specMsg('spec.notEmpty'));
  const marking = type.appliesTo === undefined || type.appliesTo.includes('marking');
  if (!marking || type.floating === true) {
    add(path, specMsg('spec.appliesInNotInContainer'));
  }
  for (const [setId, value] of entries) {
    checkAppliesInSet(setId, value, [...path, setId], sets, add);
  }
}

interface RawLayer {
  readonly annotationTypes: readonly RawType[];
}

function checkTypes(
  layers: readonly RawLayer[],
  sets: Sets,
  current: boolean,
  add: Add,
): void {
  layers.forEach((layer, li) => {
    layer.annotationTypes.forEach((type, ti) => {
      if (type.appliesIn === undefined) return;
      const path: Path = ['layers', li, 'annotationTypes', ti, 'appliesIn'];
      if (!current) add(path, onlyCurrent());
      else checkAppliesIn(type, path, sets, add);
    });
  });
}

/**
 * Container classes of the specialization (`formatVersion` 21 only): the sets at the root
 * (decision 1), the choice on a ready-made size (decision 5) and `appliesIn` on the type
 * (decision 6). Before 21, each key is `only allowed with formatVersion 21`, at its own path.
 */
export function checkContainerClasses(
  spec: {
    formatVersion: number;
    containerClasses?: unknown;
    containers?: readonly RawContainer[];
    layers: readonly RawLayer[];
  },
  ctx: z.RefinementCtx,
): void {
  const add: Add = (path, message) => addSpecIssue(ctx, path, message);
  const current = spec.formatVersion >= CONTAINER_CLASSES_VERSION;
  let sets: Sets = new Map<string, KnownSet>();
  if (spec.containerClasses !== undefined) {
    if (current) sets = knownSets(spec.containerClasses, add);
    else add(['containerClasses'], onlyCurrent());
  }
  checkContainerChoices(spec.containers, sets, current, add);
  checkTypes(spec.layers, sets, current, add);
}
