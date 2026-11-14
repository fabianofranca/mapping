/**
 * Component engine (Library stage): the screen without an image. A screen is a blank rectangle with
 * instances; each instance is a rectangle (like a marking) with the specialization's type
 * and the field values (like an annotation). Pure, immutable functions.
 */
import type { Box } from './box';
import type { Direction, FieldRow, FieldValue, FieldValues } from './componentFormat';

export type { Box };

export interface Instance {
  readonly id: string;
  /** Id of the annotation type in the specialization (which points to the component). */
  readonly typeId: string;
  /** Absolute rectangle on the screen (also for children of components with a slot). */
  readonly box: Box;
  readonly values: FieldValues;
  /**
   * Component with a slot (instance) it belongs to; absent = screen level. Sibling order is the
   * order in the list.
   */
  readonly parentId?: string;
}

export interface Screen {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Background color of the screen (CSS). */
  readonly background: string;
  /**
   * Reading direction of the screen (R2, #1107). Only appears as `rtl` (absent = `ltr`):
   * `layoutScreen` already mirrored the boxes and the drawing uses the same direction when
   * instantiating the inside of each component.
   */
  readonly direction?: Direction;
  readonly instances: readonly Instance[];
}

export const SCREEN_FORMAT = 'mapping-lab-screen';

export function newScreen(name: string, width: number, height: number): Screen {
  return {
    id: crypto.randomUUID(),
    name,
    width,
    height,
    background: '#FFFFFF',
    instances: [],
  };
}

export function addInstance(screen: Screen, instance: Omit<Instance, 'id'>): Screen {
  return {
    ...screen,
    instances: [...screen.instances, { ...instance, id: crypto.randomUUID() }],
  };
}

/** Removes only the instance; the children go up to its parent. */
export function removeInstance(screen: Screen, id: string): Screen {
  const removed = screen.instances.find((i) => i.id === id);
  if (!removed) return screen;
  const instances = screen.instances
    .filter((i) => i.id !== id)
    .map((i) =>
      i.parentId === id
        ? removed.parentId
          ? { ...i, parentId: removed.parentId }
          : withoutParent(i)
        : i,
    );
  return { ...screen, instances };
}

/** Changes the rectangle; moving (x/y) takes the descendants along, like the app's markings. */
export function updateBox(screen: Screen, id: string, box: Box): Screen {
  const current = screen.instances.find((i) => i.id === id);
  if (!current) return screen;
  const next = roundBox(box);
  const dx = next.x - current.box.x;
  const dy = next.y - current.box.y;
  const moved = new Set(descendantsOf(screen, id));
  const instances = screen.instances.map((i) => {
    if (i.id === id) return { ...i, box: next };
    if ((dx !== 0 || dy !== 0) && moved.has(i.id))
      return { ...i, box: { ...i.box, x: i.box.x + dx, y: i.box.y + dy } };
    return i;
  });
  return { ...screen, instances };
}

/** Removes the instance and the descendants. */
export function removeSubtree(screen: Screen, id: string): Screen {
  const gone = new Set([id, ...descendantsOf(screen, id)]);
  return { ...screen, instances: screen.instances.filter((i) => !gone.has(i.id)) };
}

/** Children by parent (absent = root), in list order; a single pass, memoized by the list (immutable). */
const childIndexCache = new WeakMap<
  readonly Instance[],
  Map<string | undefined, Instance[]>
>();

function childIndex(screen: Screen): Map<string | undefined, Instance[]> {
  const cached = childIndexCache.get(screen.instances);
  if (cached) return cached;
  const index = new Map<string | undefined, Instance[]>();
  for (const instance of screen.instances) {
    const parent = instance.parentId ?? undefined;
    if (index.get(parent)?.push(instance) === undefined) index.set(parent, [instance]);
  }
  childIndexCache.set(screen.instances, index);
  return index;
}

export function childrenOf(screen: Screen, parentId: string | undefined): Instance[] {
  return (childIndex(screen).get(parentId) ?? []).slice();
}

/** Ids of the descendants, in pre-order. */
export function descendantsOf(screen: Screen, id: string): string[] {
  const index = childIndex(screen);
  const out: string[] = [];
  // Defense: a hand-built screen with a cycle does not hang (each instance enters once).
  const seen = new Set<string>();
  const visit = (parent: string) => {
    for (const child of index.get(parent) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child.id);
      visit(child.id);
    }
  };
  visit(id);
  return out;
}

export function ancestorsOf(screen: Screen, id: string): string[] {
  const out: string[] = [];
  let current = screen.instances.find((i) => i.id === id);
  while (current?.parentId) {
    const parentId: string = current.parentId;
    if (out.includes(parentId)) break;
    out.push(parentId);
    current = screen.instances.find((i) => i.id === parentId);
  }
  return out;
}

/** Drawing order: parent before children (pre-order from the screen level). */
export function renderOrder(screen: Screen): Instance[] {
  const out: Instance[] = [];
  const known = new Set(screen.instances.map((i) => i.id));
  // Children by effective parent (absent parent = root), in list order: a single pass, O(n).
  const byParent = new Map<string | undefined, Instance[]>();
  for (const child of screen.instances) {
    const parent =
      child.parentId && known.has(child.parentId) ? child.parentId : undefined;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(child);
    else byParent.set(parent, [child]);
  }
  const visit = (parentId: string | undefined) => {
    for (const child of byParent.get(parentId) ?? []) {
      out.push(child);
      visit(child.id);
    }
  };
  visit(undefined);
  return out;
}

/**
 * Puts the instance inside a component with a slot (or at the screen level, with `undefined`) at
 * a position among the siblings. Refuses cycles (an ancestor cannot become a child of its
 * descendant).
 */
export function setParent(
  screen: Screen,
  id: string,
  parentId: string | undefined,
  index?: number,
): Screen {
  if (parentId === id) return screen;
  if (parentId && [id, ...descendantsOf(screen, id)].includes(parentId)) return screen;
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  const moved: Instance = parentId ? { ...instance, parentId } : withoutParent(instance);
  const rest = screen.instances.filter((i) => i.id !== id);
  const siblings = rest.filter((i) => (i.parentId ?? undefined) === parentId);
  const at =
    index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
  // Inserts before the sibling that occupies position `at` (or at the end of the list).
  const anchor = siblings[at];
  const position = anchor ? rest.indexOf(anchor) : rest.length;
  const instances = [...rest.slice(0, position), moved, ...rest.slice(position)];
  return { ...screen, instances };
}

/** Moves the instance one position among the siblings (`-1` backward, `+1` forward). */
export function moveSibling(screen: Screen, id: string, delta: -1 | 1): Screen {
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  const siblings = childrenOf(screen, instance.parentId ?? undefined);
  const index = siblings.findIndex((i) => i.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= siblings.length) return screen;
  // `setParent` indexes among the siblings without the instance itself: `target` serves both ways.
  return setParent(screen, id, instance.parentId ?? undefined, target);
}

function withoutParent(instance: Instance): Instance {
  const { parentId: _parentId, ...rest } = instance;
  void _parentId;
  return rest;
}

export function setValue(
  screen: Screen,
  id: string,
  key: string,
  value: FieldValue,
): Screen {
  return patch(screen, id, (i) => ({ ...i, values: { ...i.values, [key]: value } }));
}

/** Brings the instance to the front (end of the list = drawn last). */
export function bringToFront(screen: Screen, id: string): Screen {
  const instance = screen.instances.find((i) => i.id === id);
  if (!instance) return screen;
  return {
    ...screen,
    instances: [...screen.instances.filter((i) => i.id !== id), instance],
  };
}

export function resize(screen: Screen, width: number, height: number): Screen {
  return {
    ...screen,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function patch(screen: Screen, id: string, fn: (i: Instance) => Instance): Screen {
  let changed = false;
  const instances = screen.instances.map((i) => {
    if (i.id !== id) return i;
    changed = true;
    return fn(i);
  });
  return changed ? { ...screen, instances } : screen;
}

function roundBox(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
}

/** Screen serialization (the lab's `*.screen.json` file). */
export function serializeScreen(screen: Screen): string {
  return JSON.stringify({ format: SCREEN_FORMAT, formatVersion: 1, ...screen }, null, 2);
}

function isCell(v: unknown): v is string | number | null {
  return typeof v === 'string' || typeof v === 'number' || v === null;
}

/** A table row: only the text, number or `null` cells stay; the rest of the cell is discarded. */
function parseRow(raw: object): FieldRow {
  const row: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(raw)) if (isCell(v)) row[k] = v;
  return row;
}

/**
 * Values of an instance: text, number, `null` or a table (list of objects; a non-object item is
 * discarded).
 */
function parseValues(raw: unknown): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  if (typeof raw !== 'object' || raw === null) return values;
  for (const [k, v] of Object.entries(raw)) {
    if (isCell(v)) values[k] = v;
    else if (Array.isArray(v))
      values[k] = v.flatMap((row: unknown) =>
        typeof row === 'object' && row !== null && !Array.isArray(row)
          ? [parseRow(row)]
          : [],
      );
  }
  return values;
}

/** Refuses a repeated `id`, a `parentId` that is the instance itself, missing, or closing a cycle. */
function checkHierarchy(instances: readonly Instance[]): void {
  const byId = new Map<string, Instance>();
  instances.forEach((inst, index) => {
    if (byId.has(inst.id))
      throw new Error(`Invalid screen: instances[${index}].id is duplicated (${inst.id})`);
    byId.set(inst.id, inst);
  });
  instances.forEach((inst, index) => {
    if (inst.parentId === undefined) return;
    const where = `Invalid screen: instances[${index}].parentId`;
    if (inst.parentId === inst.id)
      throw new Error(`${where} points to the instance itself`);
    if (!byId.has(inst.parentId))
      throw new Error(`${where} does not exist in the screen (${inst.parentId})`);
    const seen = new Set<string>([inst.id]);
    for (
      let up = byId.get(inst.parentId);
      up !== undefined;
      up = up.parentId === undefined ? undefined : byId.get(up.parentId)
    ) {
      if (seen.has(up.id)) throw new Error(`${where} forms a cycle`);
      seen.add(up.id);
    }
  });
}

export function parseScreen(input: unknown): Screen {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid screen: not an object');
  const r = input as Record<string, unknown>;
  if (r.format !== SCREEN_FORMAT)
    throw new Error(`Invalid screen: format must be "${SCREEN_FORMAT}"`);
  const num = (v: unknown, name: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw new Error(`Invalid screen: ${name} must be a number`);
    return v;
  };
  const str = (v: unknown, name: string): string => {
    if (typeof v !== 'string') throw new Error(`Invalid screen: ${name} must be text`);
    return v;
  };
  if (!Array.isArray(r.instances))
    throw new Error('Invalid screen: instances must be a list');
  const instances: Instance[] = r.instances.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null)
      throw new Error(`Invalid screen: instances[${index}]`);
    const i = raw as Record<string, unknown>;
    const b = (typeof i.box === 'object' && i.box !== null ? i.box : {}) as Record<
      string,
      unknown
    >;
    const values = parseValues(i.values);
    return {
      id: typeof i.id === 'string' ? i.id : crypto.randomUUID(),
      typeId: str(i.typeId, `instances[${index}].typeId`),
      ...(typeof i.parentId === 'string' ? { parentId: i.parentId } : {}),
      box: {
        x: num(b.x, `instances[${index}].box.x`),
        y: num(b.y, `instances[${index}].box.y`),
        width: num(b.width, `instances[${index}].box.width`),
        height: num(b.height, `instances[${index}].box.height`),
      },
      values,
    };
  });
  checkHierarchy(instances);
  return {
    id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
    name: typeof r.name === 'string' ? r.name : 'Tela',
    width: num(r.width, 'width'),
    height: num(r.height, 'height'),
    background: typeof r.background === 'string' ? r.background : '#FFFFFF',
    // Only `rtl` becomes a key (absent = `ltr`); an invalid value is ignored, like `name`/`background`.
    ...(r.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
    instances,
  };
}
