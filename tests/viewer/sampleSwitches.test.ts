import { describe, expect, it } from 'vitest';
import { SAMPLE_COMPONENTS, SAMPLE_SPEC } from '../../viewer/samples/samples';

/** Every `{ $switch, cases }` node of a value, at any depth. */
function switches(node: unknown, found: { field: string; keys: string[] }[] = []) {
  if (Array.isArray(node)) node.forEach((n) => switches(n, found));
  else if (node !== null && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (
      typeof o.$switch === 'string' &&
      o.cases !== null &&
      typeof o.cases === 'object'
    ) {
      found.push({ field: o.$switch, keys: Object.keys(o.cases) });
    }
    Object.values(o).forEach((n) => switches(n, found));
  }
  return found;
}

/** The options of every enum field of the sample specialization, by field key. */
function optionsByField(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (typeof o.key === 'string' && Array.isArray(o.options)) {
        const set = out.get(o.key) ?? new Set<string>();
        o.options.forEach((v) => set.add(String(v)));
        out.set(o.key, set);
      }
      Object.values(o).forEach(walk);
    }
  };
  walk(SAMPLE_SPEC);
  return out;
}

describe('sample components', () => {
  it('every $switch case key is one of the options of its field (a renamed option must not fall to the default)', () => {
    const options = optionsByField();
    const orphans: string[] = [];
    for (const component of SAMPLE_COMPONENTS) {
      for (const { field, keys } of switches(component)) {
        const known = options.get(field);
        if (known === undefined) continue; // not an enum field: nothing to compare with
        for (const key of keys)
          if (!known.has(key)) orphans.push(`${component.id}: ${field}=${key}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});
