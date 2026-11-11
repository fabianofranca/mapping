// EX6 da etapa "expressões que calculam no formato 4" (#897), decisão 16: os sete componentes que
// a etapa reescreveu (date-picker, time-picker, slider, progress-indicator, carousel,
// short-navigation-bar e pull-to-refresh) desenham por conta, sem tabelas enumeradas, e os
// exemplos deles desenham sem aviso nos dois modos.
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
 * Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. A exceção é o
 * `$switch` sobre o campo `icon` (nome do ícone no Compose → id do conjunto de ícones): é uma
 * tradução de nome, não uma tabela de números, e o formato não tem função de texto para ela. O mesmo
 * vale para o `$switch` sobre `trackColor` (MF5): escolhe um papel do ColorScheme.
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
      if (count > 12) found.push(`${path}: $switch de ${count} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 — os sete componentes sem tabelas enumeradas', () => {
  for (const id of SEVEN) {
    it(`${id}: nenhum $switch com mais de 12 casos nem $eq sobre campo number`, () => {
      expect(offenders(id)).toEqual([]);
    });
  }

  it('os campos de valor do slider são number (0 a 1)', () => {
    const fields = typeOf('slider').fields;
    for (const key of ['value', 'valueStart', 'valueEnd']) {
      const field = fields.find((f) => f.key === key);
      expect(field?.type, key).toBe('number');
    }
  });
});

describe('EX6 — os exemplos dos sete desenham sem aviso, em light e em dark', () => {
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
