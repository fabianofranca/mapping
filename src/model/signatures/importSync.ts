import { flatParams, type FlatParam } from './importUnits';
import type { ImportChange } from './importTypes';
import type { Signature } from './types';

// Comparison between the saved signature and the new one (stage #1079, decision 12): what came in,
// what went out, what changed and the likely rename (same `type`, same position). Pure.

export interface SignatureDiff {
  /** One that left and another that came in, with the same type and in the same position. */
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  /** Left (minus the renamed ones). */
  readonly removed: readonly string[];
  /** Came in (minus the renamed ones). */
  readonly added: readonly string[];
  readonly changed: readonly ImportChange[];
}

type Indexed = Map<string, { readonly item: FlatParam; readonly index: number }>;

const indexed = (items: readonly FlatParam[]): Indexed =>
  new Map(items.map((item, index) => [item.target, { item, index }]));

const ASPECTS = [
  ['type', (p: FlatParam) => p.param.type],
  ['default', (p: FlatParam) => p.param.default],
  ['kind', (p: FlatParam) => p.param.value?.kind],
  ['options', (p: FlatParam) => p.param.value?.options?.join(', ')],
  ['required', (p: FlatParam) => String(p.param.required === true)],
] as const;

function changesOf(before: FlatParam, after: FlatParam): ImportChange[] {
  const out: ImportChange[] = [];
  for (const [aspect, read] of ASPECTS) {
    const from = read(before);
    const to = read(after);
    if (from === to) continue;
    out.push({
      kind: 'changed',
      param: after.target,
      aspect,
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
    });
  }
  return out;
}

/** The parameters that came in, left and changed from the `previous` signature to the `current` one. */
export function diffSignatures(previous: Signature, current: Signature): SignatureDiff {
  const before = indexed(flatParams(previous));
  const after = indexed(flatParams(current));
  const gone = [...before.values()].filter((entry) => !after.has(entry.item.target));
  const entered = [...after.values()].filter((entry) => !before.has(entry.item.target));
  const renamed: { from: string; to: string }[] = [];
  const taken = new Set<string>();
  for (const old of gone) {
    const match = entered.find(
      (entry) =>
        !taken.has(entry.item.target) &&
        entry.index === old.index &&
        entry.item.param.type === old.item.param.type,
    );
    if (match === undefined) continue;
    taken.add(match.item.target);
    renamed.push({ from: old.item.target, to: match.item.target });
  }
  const renamedFrom = new Set(renamed.map((r) => r.from));
  const changed: ImportChange[] = [];
  for (const [target, entry] of after) {
    const old = before.get(target);
    if (old !== undefined) changed.push(...changesOf(old.item, entry.item));
  }
  return {
    renamed,
    removed: gone.map((e) => e.item.target).filter((t) => !renamedFrom.has(t)),
    added: entered.map((e) => e.item.target).filter((t) => !taken.has(t)),
    changed,
  };
}
