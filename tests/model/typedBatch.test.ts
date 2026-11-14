// Batch operations (`setFieldValues`, `setTableCells`) and `refTargetText` (Suggestions stage, SG2):
// the text and the `ref` of a `linkedRef` are written in a single update.
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  refTargetText,
  setFieldValue,
  setFieldValues,
  setTableCell,
  setTableCells,
  type JsonValue,
} from '../../src/model';
import { build, cell, E1, R1, R2 } from './refColumnFixtures';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelError);
    expect((e as ModelError).code).toBe(code);
    return;
  }
  throw new Error(`expected the error ${code}`);
}

const values = (p: ReturnType<typeof build>, id = 'AL') =>
  p.annotations.find((a) => a.id === id)?.values;

// pt-BR kept: shared fixture data asserted by tests/mcp, tests/components, tests/examples (refColumnFixtures)
describe('setFieldValues', () => {
  it('writes several keys at once, same as calling setFieldValue in sequence', () => {
    const p = build();
    const batch = setFieldValues(p, 'AL', { titulo: 'List', principal: R1 });
    const seq = setFieldValue(
      setFieldValue(p, 'AL', 'titulo', 'List'),
      'AL',
      'principal',
      R1,
    );
    expect(values(batch)).toEqual(values(seq));
    expect(values(batch)).toMatchObject({ titulo: 'List', principal: R1 });
  });

  it('is atomic: if a key fails, nothing is written', () => {
    const p = build();
    expectCode(
      () =>
        setFieldValues(p, 'AL', {
          titulo: 'List',
          principal: { annotationId: 'ZZ', key: 'x' },
        }),
      'ref-not-accepted',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'List', nothing: 'x' }),
      'unknown-field',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'List', alvos: [] }),
      'invalid-value',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'List', principal: E1 }),
      'ref-not-accepted',
    );
    expectCode(
      () =>
        setFieldValues(p, 'AL', {
          titulo: 'List',
          principal: { annotationId: 'AL', key: 'titulo' },
        }),
      'self-ref',
    );
  });

  it('empty text becomes null, as in setFieldValue', () => {
    const p = setFieldValues(build(), 'AL', { titulo: '' });
    expect(values(p)?.titulo).toBeNull();
  });
});

describe('setTableCells', () => {
  it('writes several cells of the row at once, same as setTableCell in sequence', () => {
    const p = build();
    const batch = setTableCells(p, 'AL', 'alvos', 'L1', { nota: 'x', alvo: R1 });
    const seq = setTableCell(
      setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'x'),
      'AL',
      'alvos',
      'L1',
      'alvo',
      R1,
    );
    expect(values(batch)).toEqual(values(seq));
    expect(cell(batch)).toEqual(R1);
  });

  it('is atomic and validates each cell', () => {
    const p = build();
    const set =
      (cells: Record<string, JsonValue>, row = 'L1', key = 'alvos') =>
      () =>
        setTableCells(p, 'AL', key, row, cells);
    expectCode(set({ nota: 'x', alvo: 'text' }), 'invalid-value');
    expectCode(set({ nota: 'x', nothing: 1 }), 'unknown-field');
    expectCode(set({ nota: 'x' }, 'L9'), 'not-found');
    expectCode(set({ nota: 'x' }, 'L1', 'titulo'), 'invalid-value');
    expectCode(set({ nota: 'x' }, 'L1', 'nothing'), 'unknown-field');
  });
});

describe('refTargetText', () => {
  it('simple field: the value of the field', () => {
    expect(refTargetText(build(), { annotationId: 'AM', key: 'titulo' })).toBe('Cliente');
  });

  it('field without text (empty): null', () => {
    expect(refTargetText(build(), { annotationId: 'AL', key: 'titulo' })).toBeNull();
  });

  it('table row: the value of the rowLabel column; without rowLabel: null', () => {
    const p = build();
    expect(refTargetText(p, R1)).toBe('cpf');
    expect(refTargetText(p, R2)).toBe('nome');
    expect(
      refTargetText(p, { annotationId: 'AL', key: 'alvos', rowId: 'L1' }),
    ).toBeNull();
    const empty = setTableCell(p, 'AM', 'campos', 'R1', 'nome', '');
    expect(refTargetText(empty, R1)).toBeNull();
  });

  it('free tuple: the key of the tuple', () => {
    expect(refTargetText(build(), E1)).toBe('termo');
  });

  it('reference that does not resolve: null', () => {
    const p = build();
    expect(refTargetText(p, { annotationId: 'ZZ', key: 'x' })).toBeNull();
    expect(
      refTargetText(p, { annotationId: 'AM', key: 'campos', rowId: 'R9' }),
    ).toBeNull();
    expect(refTargetText(p, { annotationId: 'AF', entryId: 'E9' })).toBeNull();
  });
});
