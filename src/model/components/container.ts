import type { ComponentFile, FieldValues } from './componentFormat';
import { CONTAINER_PREFIX, isContainerFieldName } from './expressions';

// The container in the component engine (stage #1901, CX4, decisions 17 and 18): the `$container.*`
// pseudo-fields that the instance receives, and whether a component reads them (the drawing cache
// compares the container context only for the ones that do). Pure functions, no DOM.

/**
 * The container context of an instance, ALREADY in component units (see `containerValues`, in
 * `componentValues.ts`, which produces it from the project). The `width` and `height` are the
 * container's size in units (pixels ÷ effective density); `classes` is its class id per set, computed
 * or chosen. The drawing proof passes one class at a time, with the size absent.
 */
export interface InstanceContainer {
  readonly width?: number;
  readonly height?: number;
  readonly classes: Readonly<Record<string, string>>;
}

/**
 * The reserved values that the container hands to the engine (`$container.width`, `.height` and
 * `$container.<set>` per class). Without a container, or for a set it has no class in, the field is
 * absent: the template falls back to the `default` or to the place's default. A field of the type
 * never has such a key (`$` is not valid in a field key), so there is nothing to shadow.
 */
export function containerFieldValues(
  container: InstanceContainer | undefined,
): FieldValues {
  if (container === undefined) return {};
  const out: Record<string, string | number> = {};
  if (container.width !== undefined) out[`${CONTAINER_PREFIX}width`] = container.width;
  if (container.height !== undefined) out[`${CONTAINER_PREFIX}height`] = container.height;
  for (const [set, classId] of Object.entries(container.classes)) {
    out[`${CONTAINER_PREFIX}${set}`] = classId;
  }
  return out;
}

/**
 * The values of an instance with the container's pseudo-fields among them: for what the engine evaluates
 * outside `instantiate` with the values alone (a slot's `layout`, which Arrange and the slot plan read).
 */
export function withContainer(
  values: FieldValues,
  container: InstanceContainer | undefined,
): FieldValues {
  return container === undefined
    ? values
    : { ...values, ...containerFieldValues(container) };
}

/** The same size and the same classes (the drawing cache compares the container context with it). */
export function sameContainer(
  a: InstanceContainer | undefined,
  b: InstanceContainer | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.width !== b.width || a.height !== b.height) return false;
  const keys = Object.keys(a.classes);
  return (
    keys.length === Object.keys(b.classes).length &&
    keys.every(
      (set) => Object.hasOwn(b.classes, set) && a.classes[set] === b.classes[set],
    )
  );
}

/** The name an expression key cites (`$field`, `$has`, `$switch` or the first item of `$eq`). */
function citedName(key: string, value: unknown): string | undefined {
  if (
    (key === '$field' || key === '$has' || key === '$switch') &&
    typeof value === 'string'
  )
    return value;
  if (key === '$eq' && Array.isArray(value) && typeof value[0] === 'string')
    return value[0];
  return undefined;
}

/** The names a JSON cites (`$container.<name>`), without the prefix. */
export function citedContainerNames(
  node: unknown,
  out: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) citedContainerNames(item, out);
    return out;
  }
  if (typeof node !== 'object' || node === null) return out;
  for (const [key, value] of Object.entries(node)) {
    const name = citedName(key, value);
    if (name !== undefined && isContainerFieldName(name)) {
      out.add(name.slice(CONTAINER_PREFIX.length));
    }
    citedContainerNames(value, out);
  }
  return out;
}

const readsCache = new WeakMap<ComponentFile, ReadonlySet<string>>();

/**
 * The `$container.*` names a component reads (without the prefix): in its template, in its `sizing`, or
 * through an inner component of a `component` node (`resolvedComponents`). Memoized per component object:
 * the drawing cache asks once per marking and per call.
 */
export function containerReads(component: ComponentFile): ReadonlySet<string> {
  const known = readsCache.get(component);
  if (known !== undefined) return known;
  const reads = citedContainerNames(component.template);
  citedContainerNames(component.sizing, reads);
  for (const inner of Object.values(component.resolvedComponents ?? {}))
    for (const name of containerReads(inner.component)) reads.add(name);
  readsCache.set(component, reads);
  return reads;
}

/** Does the component read `$container.*` at all. */
export function readsContainer(component: ComponentFile): boolean {
  return containerReads(component).size > 0;
}

/**
 * The part of the container that a component reads (`width`, `height` and the sets it cites): the drawing
 * cache compares only this, so a change in a set the component does not read does not redraw it.
 */
export function readContainer(
  component: ComponentFile,
  container: InstanceContainer | undefined,
): InstanceContainer | undefined {
  if (container === undefined) return undefined;
  const reads = containerReads(component);
  if (reads.size === 0) return undefined;
  return {
    ...(reads.has('width') && container.width !== undefined
      ? { width: container.width }
      : {}),
    ...(reads.has('height') && container.height !== undefined
      ? { height: container.height }
      : {}),
    classes: Object.fromEntries(
      Object.entries(container.classes).filter(([set]) => reads.has(set)),
    ),
  };
}
