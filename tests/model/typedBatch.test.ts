// Operações em lote (`setFieldValues`, `setTableCells`) e `refTargetText` (etapa Sugestões, SG2):
// o texto e o `ref` de um `linkedRef` são gravados numa atualização só.
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
  throw new Error(`esperava o erro ${code}`);
}

const values = (p: ReturnType<typeof build>, id = 'AL') =>
  p.annotations.find((a) => a.id === id)?.values;

describe('setFieldValues', () => {
  it('grava várias chaves de uma vez, igual a chamar setFieldValue em sequência', () => {
    const p = build();
    const batch = setFieldValues(p, 'AL', { titulo: 'Lista', principal: R1 });
    const seq = setFieldValue(
      setFieldValue(p, 'AL', 'titulo', 'Lista'),
      'AL',
      'principal',
      R1,
    );
    expect(values(batch)).toEqual(values(seq));
    expect(values(batch)).toMatchObject({ titulo: 'Lista', principal: R1 });
  });

  it('é atômica: se uma chave falha, nada é gravado', () => {
    const p = build();
    expectCode(
      () =>
        setFieldValues(p, 'AL', {
          titulo: 'Lista',
          principal: { annotationId: 'ZZ', key: 'x' },
        }),
      'ref-not-accepted',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'Lista', nada: 'x' }),
      'unknown-field',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'Lista', alvos: [] }),
      'invalid-value',
    );
    expectCode(
      () => setFieldValues(p, 'AL', { titulo: 'Lista', principal: E1 }),
      'ref-not-accepted',
    );
    expectCode(
      () =>
        setFieldValues(p, 'AL', {
          titulo: 'Lista',
          principal: { annotationId: 'AL', key: 'titulo' },
        }),
      'self-ref',
    );
  });

  it('texto vazio vira null, como em setFieldValue', () => {
    const p = setFieldValues(build(), 'AL', { titulo: '' });
    expect(values(p)?.titulo).toBeNull();
  });
});

describe('setTableCells', () => {
  it('grava várias células da linha de uma vez, igual a setTableCell em sequência', () => {
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

  it('é atômica e valida cada célula', () => {
    const p = build();
    const set =
      (cells: Record<string, JsonValue>, row = 'L1', key = 'alvos') =>
      () =>
        setTableCells(p, 'AL', key, row, cells);
    expectCode(set({ nota: 'x', alvo: 'texto' }), 'invalid-value');
    expectCode(set({ nota: 'x', nada: 1 }), 'unknown-field');
    expectCode(set({ nota: 'x' }, 'L9'), 'not-found');
    expectCode(set({ nota: 'x' }, 'L1', 'titulo'), 'invalid-value');
    expectCode(set({ nota: 'x' }, 'L1', 'nada'), 'unknown-field');
  });
});

describe('refTargetText', () => {
  it('campo simples: o valor do campo', () => {
    expect(refTargetText(build(), { annotationId: 'AM', key: 'titulo' })).toBe('Cliente');
  });

  it('campo sem texto (vazio): null', () => {
    expect(refTargetText(build(), { annotationId: 'AL', key: 'titulo' })).toBeNull();
  });

  it('linha de table: o valor da coluna rowLabel; sem rowLabel: null', () => {
    const p = build();
    expect(refTargetText(p, R1)).toBe('cpf');
    expect(refTargetText(p, R2)).toBe('nome');
    expect(
      refTargetText(p, { annotationId: 'AL', key: 'alvos', rowId: 'L1' }),
    ).toBeNull();
    const empty = setTableCell(p, 'AM', 'campos', 'R1', 'nome', '');
    expect(refTargetText(empty, R1)).toBeNull();
  });

  it('tupla livre: a key da tupla', () => {
    expect(refTargetText(build(), E1)).toBe('termo');
  });

  it('referência que não resolve: null', () => {
    const p = build();
    expect(refTargetText(p, { annotationId: 'ZZ', key: 'x' })).toBeNull();
    expect(
      refTargetText(p, { annotationId: 'AM', key: 'campos', rowId: 'R9' }),
    ).toBeNull();
    expect(refTargetText(p, { annotationId: 'AF', entryId: 'E9' })).toBeNull();
  });
});
