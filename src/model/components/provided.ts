/**
 * Inherited color (format 4): what the `slot` of an ancestor offers (`provide`) and what the child
 * reads (`$provided`). Pure functions over the component and the already resolved values; whoever
 * walks the tree (the drawing cache, the viewer's and the lab's screen) uses these.
 */
import type { ComponentFile, SlotTemplate } from './componentFormat';
import type { ProvidedValues } from './expressions';

export type { ProvidedValues };

/** No offered value (always the same object, to compare by identity). */
export const NO_PROVIDED: ProvidedValues = Object.freeze({});

const NO_NAMES: readonly string[] = Object.freeze([]);

/** Walks the template's JSON object (`children` and the repeat's `template`) looking for `visit`. */
function walk(node: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit));
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  visit(record);
  for (const value of Object.values(record)) walk(value, visit);
}

/** An object that is the `$provided` expression (only `$provided` and `default`), not a `provide` with that name. */
function isReadExpr(record: Record<string, unknown>): boolean {
  return Object.keys(record).every((key) => key === '$provided' || key === 'default');
}

const readsCache = new WeakMap<ComponentFile, readonly string[]>();

/** The names the template reads with `$provided`, without repetition and in order; memoized per component. */
export function providedReads(component: ComponentFile): readonly string[] {
  const hit = readsCache.get(component);
  if (hit !== undefined) return hit;
  const names = new Set<string>();
  walk(component.template, (record) => {
    if (typeof record.$provided === 'string' && isReadExpr(record))
      names.add(record.$provided);
  });
  const result = names.size === 0 ? NO_NAMES : [...names].sort();
  readsCache.set(component, result);
  return result;
}

/** The first `slot` of the template with `provide` (the same slot `findSlot` finds), or none. */
export function providingSlot(component: ComponentFile): SlotTemplate | undefined {
  const search = (node: unknown): SlotTemplate | undefined => {
    if (typeof node !== 'object' || node === null) return undefined;
    const record = node as { type?: unknown; children?: unknown };
    if (record.type === 'slot') return node as SlotTemplate;
    if (record.type !== 'frame' || !Array.isArray(record.children)) return undefined;
    for (const child of record.children as unknown[]) {
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  const slot = search(component.template);
  return slot?.provide === undefined || Object.keys(slot.provide).length === 0
    ? undefined
    : slot;
}

/** The part of `scope` that the component reads; `NO_PROVIDED` if it reads nothing (the common case). */
export function pickProvided(
  scope: ProvidedValues,
  component: ComponentFile,
): ProvidedValues {
  const names = providedReads(component);
  if (names.length === 0) return NO_PROVIDED;
  const picked: Record<string, string | number> = {};
  for (const name of names) {
    const value = Object.hasOwn(scope, name) ? scope[name] : undefined;
    if (value !== undefined) picked[name] = value;
  }
  return Object.keys(picked).length === 0 ? NO_PROVIDED : picked;
}

/** The same names with the same values. */
export function sameProvided(a: ProvidedValues, b: ProvidedValues): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

/** What a parent's children inherit: what the parent inherited, with what it offers on top (the nearest wins). */
export function extendProvided(
  inherited: ProvidedValues,
  offered: ProvidedValues | undefined,
): ProvidedValues {
  if (offered === undefined || Object.keys(offered).length === 0) return inherited;
  return { ...inherited, ...offered };
}
