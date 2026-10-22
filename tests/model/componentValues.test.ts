import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTableRow,
  addTypedAnnotation,
  createMarking,
  drawingValues,
  setFieldValue,
  setTableCell,
  type JsonValue,
  type Project,
} from '../../src/model';
import { SPEC_ID, componentProject, testSpec } from './componentFixtures';

const TEXT = (testSpec().layers[0]?.annotationTypes ?? []).find((t) => t.id === 'text')!;

/** Grava valores direto na anotação, sem a validação das ações (cenários que o modelo recusaria). */
function withValues(p: Project, id: string, patch: Record<string, JsonValue>): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id ? { ...a, values: { ...a.values, ...patch } } : a,
    ),
  };
}

function base(): Project {
  let p = componentProject();
  for (const [id, y] of [
    ['M1', 0],
    ['M2', 100],
    ['M3', 200],
  ] as const) {
    p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x: 0, y, width: 100, height: 50 },
    });
  }
  p = addTypedAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'LS1',
    type: { specId: SPEC_ID, typeId: 'text' },
  });
  p = addTypedAnnotation(p, {
    id: 'A3',
    markingId: 'M3',
    layerId: 'LS1',
    type: { specId: SPEC_ID, typeId: 'text' },
  });
  p = setFieldValue(p, 'A3', 'label', 'Alvo');
  p = addAnnotation(p, {
    id: 'A2',
    markingId: 'M2',
    layerId: 'L1',
    entries: [{ id: 'E1', key: 'chave', value: 'Valor da tupla' }],
  });
  return p;
}

const annotation = (p: Project, id: string) => p.annotations.find((a) => a.id === id)!;
const valuesOf = (p: Project, id = 'A1') => drawingValues(p, annotation(p, id), TEXT);

describe('drawingValues: tipos simples', () => {
  it('string, number, enum e date; vazio vira null; table é sempre null', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'label', 'Olá');
    p = setFieldValue(p, 'A1', 'count', 7);
    p = setFieldValue(p, 'A1', 'kind', 'b');
    p = setFieldValue(p, 'A1', 'when', '2026-10-17');
    p = addTableRow(p, 'A1', 'items', 'R1');
    p = setTableCell(p, 'A1', 'items', 'R1', 'name', 'x');
    const { values, warnings } = valuesOf(p);
    expect(values).toEqual({
      label: 'Olá',
      count: 7,
      kind: 'b',
      when: '2026-10-17',
      target: null,
      items: null,
    });
    expect(warnings).toEqual([]);
  });

  it('as chaves seguem a ordem dos campos do tipo', () => {
    expect(Object.keys(valuesOf(base()).values)).toEqual(TEXT.fields.map((f) => f.key));
  });

  it('o default do campo vale quando a anotação o recebeu ao ser criada', () => {
    const { values } = valuesOf(base());
    expect(values.label).toBe('Hello');
    expect(values.kind).toBe('a');
    expect(values.count).toBeNull();
  });

  it('texto vazio e valor ausente viram null', () => {
    let p = base();
    p = withValues(p, 'A1', { label: '', count: null });
    const { values } = valuesOf(withValues(p, 'A1', {}));
    expect(values.label).toBeNull();
    expect(values.count).toBeNull();
    const noKey = {
      ...p,
      annotations: p.annotations.map((a) => (a.id === 'A1' ? { ...a, values: {} } : a)),
    };
    expect(valuesOf(noKey).values.kind).toBeNull();
  });

  it('valor de tipo errado não vai para o desenho', () => {
    const p = withValues(base(), 'A1', { label: 5, count: 'x', kind: 3 });
    const { values } = valuesOf(p);
    expect(values.label).toBeNull();
    expect(values.count).toBeNull();
    expect(values.kind).toBeNull();
  });
});

describe('drawingValues: referências', () => {
  it('FieldRef: o valor simples do campo alvo', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'target', { annotationId: 'A3', key: 'label' });
    expect(valuesOf(p).values.target).toBe('Alvo');
    expect(valuesOf(p).warnings).toEqual([]);
  });

  it('FieldRef para um número vira número', () => {
    // O campo `count` não tem etiqueta: grava direto.
    let p = withValues(base(), 'A3', { count: 12 });
    p = withValues(p, 'A1', { target: { annotationId: 'A3', key: 'count' } });
    expect(valuesOf(p).values.target).toBe(12);
  });

  it('EntryRef: o value da tupla da anotação livre', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'target', { annotationId: 'A2', entryId: 'E1' });
    expect(valuesOf(p).values.target).toBe('Valor da tupla');
  });

  it('RowRef: o rótulo da linha (coluna rowLabel), ou a posição quando vazio', () => {
    let p = base();
    p = addTableRow(p, 'A3', 'items', 'R1');
    p = addTableRow(p, 'A3', 'items', 'R2');
    p = setTableCell(p, 'A3', 'items', 'R1', 'name', 'Linha um');
    p = setFieldValue(p, 'A1', 'target', {
      annotationId: 'A3',
      key: 'items',
      rowId: 'R1',
    });
    expect(valuesOf(p).values.target).toBe('Linha um');
    p = setFieldValue(p, 'A1', 'target', {
      annotationId: 'A3',
      key: 'items',
      rowId: 'R2',
    });
    expect(valuesOf(p).values.target).toBe('#2');
  });

  it('mais de um nível: o alvo é outra referência, não é seguido', () => {
    let p = base();
    p = withValues(p, 'A3', { target: { annotationId: 'A2', entryId: 'E1' } });
    p = withValues(p, 'A1', { target: { annotationId: 'A3', key: 'target' } });
    const { values, warnings } = valuesOf(p);
    expect(values.target).toBeNull();
    expect(warnings).toEqual(['referência em mais de um nível: target']);
  });

  it('ciclo: o alvo volta à própria anotação', () => {
    const p = withValues(base(), 'A1', { target: { annotationId: 'A1', key: 'label' } });
    const { values, warnings } = valuesOf(p);
    expect(values.target).toBeNull();
    expect(warnings).toEqual(['referência em ciclo: target']);
  });

  it('referência quebrada: alvo que não existe, ou formato que não é referência', () => {
    let p = withValues(base(), 'A1', { target: { annotationId: 'ZZ', key: 'label' } });
    expect(valuesOf(p).values.target).toBeNull();
    expect(valuesOf(p).warnings).toEqual(['referência quebrada: target']);
    p = withValues(p, 'A1', {
      target: { annotationId: 'A3', key: 'items', rowId: 'inexistente' },
    });
    expect(valuesOf(p).warnings).toEqual(['referência quebrada: target']);
    p = withValues(p, 'A1', { target: 'texto solto' });
    expect(valuesOf(p).warnings).toEqual(['referência quebrada: target']);
    p = withValues(p, 'A1', { target: { annotationId: 'A2', entryId: 'EX' } });
    expect(valuesOf(p).warnings).toEqual(['referência quebrada: target']);
  });

  it('referência vazia não avisa', () => {
    const p = withValues(base(), 'A1', { target: null });
    expect(valuesOf(p)).toEqual({
      values: expect.objectContaining({ target: null }),
      warnings: [],
    });
  });
});
