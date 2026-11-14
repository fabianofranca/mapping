// EX6 of the "expressions that compute in format 4" stage (#897), decision 16: the seven components that
// the stage rewrote (date-picker, time-picker, slider, progress-indicator, carousel,
// short-navigation-bar and pull-to-refresh) draw by computing, without enumerated tables, and their
// examples draw without warnings in both modes.
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { drawIn, text, typeOf } from '../support/material3Library';
import { catalog, type Mode, type Values } from '../support/material3Ex6Fixture';

const SEVEN = [
  'date-picker',
  'time-picker',
  'slider',
  'progress-indicator',
  'carousel',
  'short-navigation-bar',
  'pull-to-refresh',
] as const;

/**
 * Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. The exception is the
 * `$switch` over the `icon` field (icon name in Compose → id of the icon set): it is a name
 * translation, not a table of numbers, and the format has no text function for it. The same
 * goes for the `$switch` over `trackColor` (MF5): it picks a ColorScheme role.
 */
function offenders(id: (typeof SEVEN)[number]): string[] {
  const numberFields = new Set(
    typeOf(id)
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if (
      '$switch' in obj &&
      obj['$switch'] !== 'icon' &&
      obj['$switch'] !== 'trackColor' &&
      typeof cases === 'object' &&
      cases !== null
    ) {
      const count = Object.keys(cases).length;
      if (count > 12) found.push(`${path}: $switch of ${count} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 — the seven components without enumerated tables', () => {
  for (const id of SEVEN) {
    it(`${id}: no $switch with more than 12 cases nor $eq over a number field`, () => {
      expect(offenders(id)).toEqual([]);
    });
  }

  it('the value fields of the slider are number (0 to 1)', () => {
    const fields = typeOf('slider').fields;
    for (const key of ['value', 'valueStart', 'valueEnd']) {
      const field = fields.find((f) => f.key === key);
      expect(field?.type, key).toBe('number');
    }
  });
});

describe('EX6 — the examples of the seven draw without warnings, in light and in dark', () => {
  for (const id of SEVEN) {
    it(id, () => {
      const type = typeOf(id);
      const entry = findEntry(catalog, id)!;
      const examples = type.examples ?? [];
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        for (const mode of ['light', 'dark'] as const satisfies readonly Mode[]) {
          const drawing = drawIn(catalog, entry, example.values as Values, mode);
          expect(drawing.warnings, `${id} · ${example.name} · ${mode}`).toEqual([]);
        }
      }
    });
  }
});
