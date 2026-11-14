// VL2 of the "variables in format 4" stage (#1504): the material3-compose `carousel.json` writes each
// long subexpression once, in a `let`, and uses it with `$var`, instead of repeating the snippet (it was 107 kB
// formatted, almost all repetition). The test reads the file as it is (with `let` and `$var`), not the
// component already replaced by `parseComponent`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseComponentText } from '../../src/model/components/parseComponent';

const FILE = 'libraries/material3-compose/components/carousel.json';
const text = readFileSync(FILE, 'utf8');
const file = JSON.parse(text) as { template: { let?: Record<string, unknown> } };

/** The size, in characters, from which a subexpression cannot repeat. */
const MAX_REPEATED_CHARS = 200;

/** Every subexpression (object or list) of the file, serialized, including those inside the `let`s. */
function subexpressions(node: unknown, found: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return found;
  found.push(JSON.stringify(node));
  for (const child of Array.isArray(node) ? node : Object.values(node))
    subexpressions(child, found);
  return found;
}

describe('carousel.json with variables (let and $var)', () => {
  it('no subexpression of more than 200 characters appears more than once', () => {
    const counts = new Map<string, number>();
    for (const sub of subexpressions(file)) {
      if (sub.length > MAX_REPEATED_CHARS) counts.set(sub, (counts.get(sub) ?? 0) + 1);
    }
    const repeated = [...counts]
      .filter(([, n]) => n > 1)
      .map(([sub, n]) => `${n}× ${sub.slice(0, 120)}…`);
    expect(repeated).toEqual([]);
  });

  it('declares variables in the root frame and all of them are used', () => {
    const declared = Object.keys(file.template.let ?? {});
    expect(declared.length).toBeGreaterThan(0);
    const used = new Set([...text.matchAll(/"\$var":\s*"([^"]+)"/g)].map((m) => m[1]));
    expect(declared.filter((name) => !used.has(name))).toEqual([]);
  });

  it('the component is valid, without errors or warnings, and the parsed one has no let or $var', () => {
    const result = parseComponentText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings ?? []).toEqual([]);
    const expanded = JSON.stringify(result.component);
    expect(expanded).not.toContain('"let"');
    expect(expanded).not.toContain('"$var"');
  });

  it('the formatted file stays below 60 kB (it was 107 kB without variables)', () => {
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(60_000);
  });
});
